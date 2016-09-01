'use strict';

import child_process = require('child_process');

import {Log} from './Log'
import {Settings} from './Settings'
import {Stage, Backend, ViperSettings, Commands, VerificationState, LogLevel} from './ViperProtocol'
import {Server} from './ServerClass';
import {VerificationTask} from './VerificationTask'

export class NailgunService {
    nailgunProcess: child_process.ChildProcess;

    private _ready: boolean = false;
    settings: ViperSettings;
    activeBackend: Backend;

    maxNumberOfRetries = 20;
    static REQUIRED_JAVA_VERSION = 8;

    static startingOrRestarting = false;

    changeSettings(settings: ViperSettings) {
        this.settings = settings;
    }

    public nailgunStarted(): boolean {
        return (this.nailgunProcess != null);
    }

    public isReady(): boolean {
        return this._ready;
    }

    public setReady(connection, backend: Backend) {
        this._ready = true;
        Log.log("Nailgun started", LogLevel.Info);
    }

    public setStopping(connection) {
        this._ready = false;
        connection.sendNotification(Commands.StateChange, { newState: VerificationState.Stopping });
    }

    //NailgunService.startingOrRestarting must be set to true before calling this method
    private startNailgunServer(connection, backend: Backend) {
        this.isJreInstalled().then(jreInstalled => {
            if (!jreInstalled) {
                Log.hint("No compatible Java 8 (64bit) Runtime Environment is installed. Please install it.");
                connection.sendNotification(Commands.StateChange, { newState: VerificationState.Stopped });
                return;
            }
            connection.sendNotification(Commands.BackendChange, backend.name);
            this.activeBackend = backend;
            if (!this.nailgunStarted()) {
                Log.log("close nailgun server on port: " + this.settings.nailgunPort, LogLevel.Info)
                let killOldNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ng-stop');

                Log.logOutput(killOldNailgunProcess, "NG killer");
                killOldNailgunProcess.on('exit', (code, signal) => {
                    Log.log('starting nailgun server', LogLevel.Info);
                    //start the nailgun server for both silicon and carbon

                    let backendJars = Settings.backendJars(backend);
                    //Log.log("Backend Jars: " + backendJars,LogLevel.Debug);
                    let command = 'java -Xmx2048m -Xss16m -cp ' + this.settings.nailgunServerJar + backendJars + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + this.settings.nailgunPort;
                    Log.log(command, LogLevel.Debug)

                    this.nailgunProcess = child_process.exec(command);
                    this.nailgunProcess.stdout.on('data', (data: string) => {
                        Log.logWithOrigin('NS', data, LogLevel.LowLevelDebug);
                        if (data.indexOf("started") > 0) {
                            this.waitForNailgunToStart(this.maxNumberOfRetries, connection);
                        }
                    });
                    Log.logOutput(killOldNailgunProcess, "NS stopper");
                });
            } else {
                Log.log('nailgun server is already starting or running', LogLevel.Info);
            };
        });
    }

    private waitForNailgunToStart(retriesLeft: number, connection) {
        if (retriesLeft <= 0) {
            Log.log("A problem with nailgun was detected, Nailgun cannot be started.", LogLevel.Default)
            NailgunService.startingOrRestarting = false;
            return;
        }
        this.isNailgunServerReallyRunning().then(running => {
            if (!running) {
                Log.log("Nailgun server should be running, however, it is not running yet. -> retry after 100ms", LogLevel.Info);
                setTimeout(() => {
                    this.waitForNailgunToStart(retriesLeft - 1, connection);
                }, 100);
            } else {
                //the nailgun server is confirmed to be running
                NailgunService.startingOrRestarting = false;
                this.setReady(this.activeBackend, connection);
                connection.sendNotification(Commands.BackendStarted, this.activeBackend.name)
            }
        });
    }

    public stopNailgunServer() {
        this.setStopping(VerificationTask.connection);
        if (this.nailgunProcess) {
            Log.log('gracefully shutting down nailgun server', LogLevel.Info);
            let shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ng-stop');
            shutDownNailgunProcess.on('exit', (code, signal) => {
                Log.log("nailgun server is stopped", LogLevel.Info);
            });
            Log.logOutput(shutDownNailgunProcess, "NG stopper");
        }
        this.nailgunProcess = null;
    }

    public killNgDeamon(): Thenable<boolean> {
        return new Promise((resolve, reject) => {
            this.setStopping(VerificationTask.connection);
            Log.log("Killing ng deamon", LogLevel.Info);
            let ngKiller = child_process.exec("taskkill /F /im ng.exe")
            ngKiller.on("exit", (data) => {
                Log.log("kill ng.exe: " + data, LogLevel.Debug);
                return resolve(false);
            })
            Log.logOutput(ngKiller, "kill ng.exe");
        });
    }

    public restartNailgunServer(connection, backend: Backend) {
        if (NailgunService.startingOrRestarting) {
            Log.log("Server is already starting or restarting, don't restart", LogLevel.Debug);
            return;
        }
        NailgunService.startingOrRestarting = true;

        //Stop all running verificationTasks before restarting backend
        Log.log("Stop all running verificationTasks before restarting backend", LogLevel.Debug)
        Server.verificationTasks.forEach(task => { task.abortVerification(); });

        this.setStopping(connection);
        connection.sendNotification(Commands.StateChange, { newState: VerificationState.Starting, backendName: backend.name });
        if (this.nailgunProcess) {
            Log.log('gracefully shutting down nailgun server', LogLevel.Info);
            let shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ng-stop');
            this.nailgunProcess = null;
            shutDownNailgunProcess.on('exit', (code, signal) => {
                Log.log("nailgun server is stopped", LogLevel.Info);
                //restart
                this.startNailgunServer(connection, backend);
            });
            Log.logOutput(shutDownNailgunProcess, "Nailgun stopper2");
        } else {
            //first -> only start
            this.startNailgunServer(connection, backend);
        }
    }

    //unused
    // private killNailgunServer() {
    //     Log.log('killing nailgun server, this may leave its sub processes running', LogLevel.Debug);
    //     //this.nailgunProcess.kill('SIGINT');
    //     process.kill(this.nailgunProcess.pid);
    //     this.nailgunProcess = null;
    // }

    public startStageProcess(fileToVerify: string, stage: Stage, onData, onError, onClose): child_process.ChildProcess {
        let command = this.settings.nailgunClient + ' ' + Settings.completeNGArguments(stage, fileToVerify);
        Log.log(command, LogLevel.Debug);
        let verifyProcess = child_process.exec(command, { cwd: Settings.workspace });
        verifyProcess.stdout.on('data', onData);
        verifyProcess.stderr.on('data', onError);
        verifyProcess.on('close', onClose);
        return verifyProcess;
    }

    // public startNailgunIfNotRunning(connection, backend: Backend) {
    //     if (NailgunService.startingOrRestarting) {
    //         Log.log("Server is already starting or restarting, don't start", LogLevel.Debug);
    //         return;
    //     }
    //     NailgunService.startingOrRestarting = true;
    //     //startNailgun if it is not already running:
    //     if (!this.nailgunStarted()) {
    //         this.startNailgunServer(connection, backend);
    //     }
    // }

    private isNailgunServerReallyRunning(): Thenable<boolean> {
        return new Promise((resolve, reject) => {
            if (!this.nailgunProcess) {
                return resolve(false);
            }
            let command = this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + " NOT_USED_CLASS_NAME";
            Log.log(command, LogLevel.Debug);
            let nailgunServerTester = child_process.exec(command);
            nailgunServerTester.stderr.on('data', data => {
                if (data.startsWith("java.lang.ClassNotFoundException:")) {
                    return resolve(true);
                } else {
                    return resolve(false);
                }
            });
        });
    }

    public isJreInstalled(): Thenable<boolean> {
        Log.log("Check if Jre is installed", LogLevel.Verbose);
        return new Promise((resolve, reject) => {
            let jreTester = child_process.exec("java -version");
            jreTester.stdout.on('data', (data: string) => {
                Log.toLogFile("[Java checker]: " + data, LogLevel.LowLevelDebug);
                if (this.findAppropriateVersion(data)) return resolve(true);
            });
            jreTester.stderr.on('data', (data: string) => {
                Log.toLogFile("[Java checker stderr]: " + data, LogLevel.LowLevelDebug);
                if (this.findAppropriateVersion(data)) return resolve(true);
            });
            jreTester.on('exit', () => {
                Log.toLogFile("[Java checker done]", LogLevel.LowLevelDebug);
                return resolve(false);
            });
        });
    }

    private findAppropriateVersion(s: string): boolean {
        let match = /([1-9]\d*)\.(\d+)\.(\d+)/.exec(s);
        if (match && match[1] && match[2] && match[3]) {
            return +match[1] > 1 || (+match[1] === 1 && +match[2] >= NailgunService.REQUIRED_JAVA_VERSION);
        }
    }
}