'use strict';

import child_process = require('child_process');

import {Log} from './Log'
import {Settings} from './Settings'
import {Stage, Backend, ViperSettings, Commands, VerificationState, LogLevel} from './ViperProtocol'
import {Server} from './ServerClass';
import {VerificationTask} from './VerificationTask'

export class NailgunService {
    nailgunProcess: child_process.ChildProcess;
    instanceCount: number = 0;

    private _ready: boolean = false;
    activeBackend: Backend;

    reverifyWhenBackendReady: boolean = true;

    maxNumberOfRetries = 20;
    static REQUIRED_JAVA_VERSION = 8;

    static startingOrRestarting: boolean = false;

    public isReady(): boolean {
        return this._ready;
    }

    public setReady(backend: Backend) {
        this._ready = true;
        NailgunService.startingOrRestarting = false;
        Log.log("The backend is ready for verification", LogLevel.Info);
        Server.sendBackendReadyNotification({ name: this.activeBackend.name, restarted: this.reverifyWhenBackendReady });
    }

    public setStopping() {
        this._ready = false;
        NailgunService.startingOrRestarting = false;
        Server.sendStateChangeNotification({ newState: VerificationState.Stopping });
    }

    public setStopped() {
        Log.log("Set Stopped ", LogLevel.Debug);
        this._ready = false;
        NailgunService.startingOrRestarting = false;
        Server.sendStateChangeNotification({ newState: VerificationState.Stopped });
    }

    //TODO: move to VerificationTask
    //TODO: resolve only after completion 
    public static stopAllRunningVerifications(): Thenable<boolean> {
        return new Promise((resolve, reject) => {
            if (Server.verificationTasks && Server.verificationTasks.size > 0) {
                Log.log("Stop all running verificationTasks before restarting backend", LogLevel.Debug)
                Server.verificationTasks.forEach(task => { task.abortVerification(); });
            }
            resolve(true);
        });
    }

    public startOrRestartNailgunServer(backend: Backend, reverifyWhenBackendReady: boolean) {
        try {
            this.reverifyWhenBackendReady = reverifyWhenBackendReady;
            if (NailgunService.startingOrRestarting) {
                Log.log("Server is already starting or restarting, don't restart", LogLevel.Debug);
                return;
            }

            //Stop all running verificationTasks before restarting backend
            NailgunService.stopAllRunningVerifications().then(done => {
                //check java version
                this.isJreInstalled().then(jreInstalled => {
                    if (!jreInstalled) {
                        Log.hint("No compatible Java 8 (64bit) Runtime Environment is installed. Please install it.");
                        this.setStopped(); return;
                    }
                    this.activeBackend = backend;
                    if (!backend.useNailgun) {
                        //In nailgun is disabled, don't start it
                        this.setReady(this.activeBackend);
                        return;
                    }
                    this.stopNailgunServer().then(success => {
                        NailgunService.startingOrRestarting = true;
                        Log.log('starting nailgun server', LogLevel.Info);
                        //notify client
                        Server.sendBackendChangeNotification(backend.name);
                        Server.sendStateChangeNotification({ newState: VerificationState.Starting, backendName: backend.name });


                        let command = 'java ' + Settings.settings.javaSettings.customArguments + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + Settings.settings.nailgunSettings.port;
                        let backendJars = Settings.backendJars(backend);
                        command = command.replace(/\$backendPaths\$/g, '"' + Settings.settings.nailgunSettings.serverJar + '"' + backendJars);
                        Log.log(command, LogLevel.Debug)

                        this.instanceCount++;
                        this.startNailgunTimeout(this.instanceCount);
                        this.nailgunProcess = child_process.exec(command);
                        this.nailgunProcess.stdout.on('data', (data: string) => {
                            Log.logWithOrigin('NS', data, LogLevel.LowLevelDebug);
                            if (data.indexOf("started") > 0) {
                                this.waitForNailgunToStart(this.maxNumberOfRetries).then(success => {
                                    if (success) {
                                        //the nailgun server is confirmed to be running
                                        this.setReady(this.activeBackend);
                                    } else {
                                        this.setStopped();
                                    }
                                }, reject => {
                                    Log.error("waitForNailgunToStart was rejected");
                                    this.setStopped();
                                });
                            }
                        });
                    }, reject => {
                        Log.error("stopNailgunServer was rejected");
                        this.setStopped();
                    });
                });
            }, reject => {
                Log.error("stopAllRunningVerifications was rejected");
                this.setStopped();
            });
        } catch (e) {
            Log.error("Error starting or restarting nailgun server");
            this.setStopped(); return;
        }
    }

    private startNailgunTimeout(instanceCount: number) {
        if (Settings.settings.nailgunSettings.timeout) {
            setTimeout(() => {
                //Log.log("check for nailgun timeout", LogLevel.Debug);
                if (!this.isReady() && this.instanceCount == instanceCount) {
                    Log.hint("The nailgun server startup timed out after " + Settings.settings.nailgunSettings.timeout + "ms");
                    this.stopNailgunServer();
                }
            }, Settings.settings.nailgunSettings.timeout);
        }
    }

    private waitForNailgunToStart(retriesLeft: number): Thenable<boolean> {
        return new Promise((resolve, reject) => {
            try {
                if (!NailgunService.startingOrRestarting) {
                    //this can happen due to a timeout
                    Log.log("WARNING: while waiting for nailgun server to start, the start is aborted, possibly due to a timeout.", LogLevel.Debug);
                    resolve(false); return;
                }
                if (retriesLeft <= 0) {
                    Log.log("A problem with nailgun was detected, Nailgun cannot be started.", LogLevel.Default)
                    resolve(false); return;
                }
                this.isNailgunServerReallyRunning().then(running => {
                    if (running) {
                        resolve(true);
                    } else {
                        Log.log("Nailgun server should be running, however, it is not running yet. -> retry after 100ms", LogLevel.Info);
                        setTimeout(() => {
                            this.waitForNailgunToStart(retriesLeft - 1).then(success => {
                                resolve(success);
                            }, reject => {
                                resolve(false);
                            });
                        }, 100);
                    }
                });
            } catch (e) {
                Log.error("Error waiting for nailgun to start " + e);
                resolve(false);
            }
        });
    }

    public stopNailgunServer(): Thenable<boolean> {
        return new Promise((resolve, reject) => {
            try {
                this.setStopping();
                Log.log("gracefully shutting down nailgun server on port: " + Settings.settings.nailgunSettings.port, LogLevel.Info);
                let shutDownNailgunProcess = child_process.exec('"' + Settings.settings.nailgunSettings.clientExecutable + '" --nailgun-port ' + Settings.settings.nailgunSettings.port + ' ng-stop');
                shutDownNailgunProcess.on('exit', (code, signal) => {
                    Log.log("nailgun server is stopped", LogLevel.Info);
                    this.setStopped();
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
        let program = this.activeBackend.useNailgun ? ('"' + Settings.settings.nailgunSettings.clientExecutable + '"') : ('java ' + Settings.settings.javaSettings.customArguments);
        let command = Settings.expandCustomArguments(program, stage, fileToVerify, this.activeBackend);
        Log.log(command, LogLevel.Debug);
        let verifyProcess = child_process.exec(command, { maxBuffer: 1024 * Settings.settings.advancedFeatures.verificationBufferSize, cwd: Settings.workspace });
        verifyProcess.stdout.on('data', onData);
        verifyProcess.stderr.on('data', onError);
        verifyProcess.on('close', onClose);
        return verifyProcess;
    }

    private isNailgunServerReallyRunning(): Thenable<boolean> {
        return new Promise((resolve, reject) => {
            if (!this.nailgunProcess) {
                return resolve(false);
            }
            let command = '"' + Settings.settings.nailgunSettings.clientExecutable + '" --nailgun-port ' + Settings.settings.nailgunSettings.port + " NOT_USED_CLASS_NAME";
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
            let is64bit = false;
            let resolved = false;
            jreTester.stdout.on('data', (data: string) => {
                Log.toLogFile("[Java checker]: " + data, LogLevel.LowLevelDebug);
                is64bit = is64bit || data.indexOf("64") >= 0;
                if (!resolved && this.findAppropriateVersion(data)) {
                    resolved = true;
                    resolve(true);
                }
            });
            jreTester.stderr.on('data', (data: string) => {
                Log.toLogFile("[Java checker stderr]: " + data, LogLevel.LowLevelDebug);
                is64bit = is64bit || data.indexOf("64") >= 0;
                if (!resolved && this.findAppropriateVersion(data)) {
                    resolved = true;
                    resolve(true);
                }
            });
            jreTester.on('exit', () => {
                Log.toLogFile("[Java checker done]", LogLevel.LowLevelDebug);
                if (!is64bit) {
                    Log.error("Your java version is not 64-bit. The nailgun server will possibly not work")
                }
                if (!resolved) resolve(false);
            });
        });
    }

    private findAppropriateVersion(s: string): boolean {
        try {
            let match = /([1-9]\d*)\.(\d+)\.(\d+)/.exec(s);
            if (match && match[1] && match[2] && match[3]) {
                let major = Number.parseInt(match[1]);
                let minor = Number.parseInt(match[2]);
                return major > 1 || (major === 1 && minor >= NailgunService.REQUIRED_JAVA_VERSION);
            }
        } catch (e) {
            Log.error("Error checking for the right java version: " + e);
        }
    }
}