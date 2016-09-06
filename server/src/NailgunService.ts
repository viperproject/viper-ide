'use strict';

import child_process = require('child_process');

import {Log} from './Log'
import {Settings} from './Settings'
import {BackendStartedParams, Stage, Backend, ViperSettings, Commands, VerificationState, LogLevel} from './ViperProtocol'
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

    public changeSettings(settings: ViperSettings) {
        this.settings = settings;
    }

    public isReady(): boolean {
        return this._ready;
    }

    public setReady(backend: Backend) {
        this._ready = true;
        Log.log("Nailgun started", LogLevel.Info);
        Server.sendBackendStartedNotification({ name: this.activeBackend.name, reverify: true });
    }

    public setStopping() {
        this._ready = false;
        Server.sendStateChangeNotification({ newState: VerificationState.Stopping });
    }

    public startOrRestartNailgunServer(backend: Backend) {
        if (NailgunService.startingOrRestarting) {
            Log.log("Server is already starting or restarting, don't restart", LogLevel.Debug);
            return;
        }
        NailgunService.startingOrRestarting = true;

        //Stop all running verificationTasks before restarting backend
        if (Server.verificationTasks && Server.verificationTasks.size > 0) {
            Log.log("Stop all running verificationTasks before restarting backend", LogLevel.Debug)
            Server.verificationTasks.forEach(task => { task.abortVerification(); });
        }
        //check java version
        this.isJreInstalled().then(jreInstalled => {
            if (!jreInstalled) {
                Log.hint("No compatible Java 8 (64bit) Runtime Environment is installed. Please install it.");
                Server.sendStateChangeNotification({ newState: VerificationState.Stopped });
                return;
            }
            this.activeBackend = backend;
            this.stopNailgunServer().then(resolve => {
                Log.log('starting nailgun server', LogLevel.Info);
                //notify client
                Server.sendBackendChangeNotification(backend.name);
                Server.sendStateChangeNotification({ newState: VerificationState.Starting, backendName: backend.name });

                let backendJars = Settings.backendJars(backend);
                let command = 'java -Xmx2048m -Xss16m -cp ' + this.settings.nailgunServerJar + backendJars + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + this.settings.nailgunPort;
                Log.log(command, LogLevel.Debug)

                this.nailgunProcess = child_process.exec(command);
                this.nailgunProcess.stdout.on('data', (data: string) => {
                    Log.logWithOrigin('NS', data, LogLevel.LowLevelDebug);
                    if (data.indexOf("started") > 0) {
                        this.waitForNailgunToStart(this.maxNumberOfRetries);
                    }
                });
            });
        });
    }

    private waitForNailgunToStart(retriesLeft: number) {
        if (retriesLeft <= 0) {
            Log.log("A problem with nailgun was detected, Nailgun cannot be started.", LogLevel.Default)
            NailgunService.startingOrRestarting = false;
            return;
        }
        this.isNailgunServerReallyRunning().then(running => {
            if (!running) {
                Log.log("Nailgun server should be running, however, it is not running yet. -> retry after 100ms", LogLevel.Info);
                setTimeout(() => {
                    this.waitForNailgunToStart(retriesLeft - 1);
                }, 100);
            } else {
                //the nailgun server is confirmed to be running
                NailgunService.startingOrRestarting = false;
                this.setReady(this.activeBackend);
            }
        });
    }

    public stopNailgunServer(): Thenable<boolean> {
        return new Promise((resolve, reject) => {
            try {
                this.setStopping();
                Log.log("gracefully shutting down nailgun server on port: " + this.settings.nailgunPort, LogLevel.Info);
                let shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ng-stop');
                shutDownNailgunProcess.on('exit', (code, signal) => {
                    Log.log("nailgun server is stopped", LogLevel.Info);
                    return resolve(true);
                });
                this.nailgunProcess = null;
                Log.logOutput(shutDownNailgunProcess, "NG stopper");
            } catch (e) {
                Log.error("Error stopping nailgun server: " + e);
                resolve(false);
            }
        });
    }

    public killNgDeamon(): Thenable<boolean> {
        return new Promise((resolve, reject) => {
            this.setStopping();
            Log.log("Killing ng deamon", LogLevel.Info);
            let ngKiller = child_process.exec("taskkill /F /im ng.exe");
            ngKiller.on("exit", (data) => {
                Log.log("kill ng.exe: " + data, LogLevel.Debug);
                return resolve(false);
            })
            Log.logOutput(ngKiller, "kill ng.exe");
        });
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

    //currently unused, the purpose of this method is to trigger a repeated settings check
    public tryToStartNailgunServer(backend: Backend) {
        if (this._ready || NailgunService.startingOrRestarting || this.nailgunProcess) return;
        //repeat the settings check
        Settings.checkSettings(this.settings);
        if (Settings.valid()) {
            //since the nailgun server is not started, do that now
            this.startOrRestartNailgunServer(backend);
        }
    }

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