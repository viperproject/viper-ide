'use strict';
import { clearTimeout } from 'timers';

import child_process = require('child_process');
import { Log } from './Log'
import { Settings } from './Settings'
import { Common, Stage, Backend, VerificationState, LogLevel } from './ViperProtocol'
import { Server } from './ServerClass';
import { VerificationTask } from './VerificationTask';
import { BackendService } from './BackendService';

export class NailgunService extends BackendService {

    public constructor() {
        super();
        this.isViperServerService = false;
        this.engine = "Nailgun";
    }
    maxNumberOfRetries = 20;

    /**
     * resolve(true) => nailgun server successfully started
     * resolve(false) => nailgun server was not started
     * reject() => nailgun server start failed, the server needs to be terminated 
     */
    public start(backend: Backend): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (NailgunService.startingOrRestarting || this.isReady()) {
                Log.error("Cannot start server, it is not stopped.", LogLevel.Debug);
                resolve(false);
                return;
            }
            if (!Settings.useNailgunServer(backend)) {
                //If nailgun is disabled, don't start it
                resolve(true)
                return;
            }
            this.isJreInstalled().then(jreInstalled => {
                if (!jreInstalled) {
                    Log.hint("No compatible Java 8 (64bit) Runtime Environment is installed. Please install it.");
                    resolve(false);
                    return false;
                }
                //determine the nailgun port if needed
                return Settings.setNailgunPort(Settings.settings.nailgunSettings);
            }).then(success => {
                if (!success) return false;
                Log.log('starting nailgun server', LogLevel.Info);
                //notify client
                Server.sendStateChangeNotification({ newState: VerificationState.Starting, backendName: backend.name });
                return this.doStartNailgunServer(backend);
            }).then(success => {
                resolve(success);
            }).catch(error => {
                reject();
            })
        });
    }

    private doStartNailgunServer(backend: Backend): Promise<boolean> {
        return new Promise((resolve, reject) => {
            NailgunService.startingOrRestarting = true;

            let command = this.getNailgunStartCommand(backend);
            Log.log(command, LogLevel.Debug)

            this.startTimeout(++this.instanceCount);
            this.backendProcess = child_process.exec(command, { cwd: Server.backendOutputDirectory });
            this.backendProcess.stdout.on('data', (data: string) => {
                Log.logWithOrigin('NS', data, LogLevel.LowLevelDebug);
                if (data.indexOf("started") > 0) {
                    this.waitForNailgunToStart(this.maxNumberOfRetries).then(success => {
                        if (success) {
                            //the nailgun server is confirmed to be running
                            resolve(true);
                        } else {
                            reject();
                        }
                    }, reject => {
                        Log.error("waitForNailgunToStart was rejected");
                        reject();
                    });
                } else if (data.startsWith("NGSession") && (data.endsWith("disconnected") || data.indexOf('exited with status') >= 0)) {
                    this.isSessionRunning = false;
                    this.ngSessionFinished();
                }
            });
        })
    }

    private getNailgunStartCommand(backend: Backend): string {
        let command = 'java ' + Settings.settings.javaSettings.customArguments + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + Settings.settings.nailgunSettings.port;
        let backendJars = Settings.backendJars(backend);
        command = command.replace(/\$backendPaths\$/g, '"' + Settings.settings.nailgunSettings.serverJar + '"' + backendJars);
        return command;
    }

    private waitForNailgunToStart(retriesLeft: number): Promise<boolean> {
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
                        Log.log("Nailgun server should be running, however, it is not running yet. -> retry after 200ms", LogLevel.Info);
                        setTimeout(() => {
                            this.waitForNailgunToStart(retriesLeft - 1).then(success => {
                                resolve(success);
                            }, reject => {
                                resolve(false);
                            });
                        }, 200);
                    }
                });
            } catch (e) {
                Log.error("Error waiting for nailgun to start " + e);
                resolve(false);
            }
        });
    }

    public stop(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            try {
                clearTimeout(this.timeout);
                if (Settings.settings.nailgunSettings.port == '*') {
                    if (this.isReady() || NailgunService.startingOrRestarting) {
                        Log.error("Error: inconsistent state detected, the nailgun port is * but the nailgun server is not stopped.");
                        Log.error("This potentially leaks a java process.");
                        resolve(false);
                    } else {
                        Log.log("nailgun server is stopped", LogLevel.Info);

                        resolve(true);
                    }
                    this.setStopped();
                } else {
                    if (this.backendProcess) {
                        this.setStopping();
                        Log.log("gracefully shutting down nailgun server on port: " + Settings.settings.nailgunSettings.port, LogLevel.Info);
                        let shutDownNailgunProcess = child_process.exec('"' + Settings.settings.nailgunSettings.clientExecutable + '" --nailgun-port ' + Settings.settings.nailgunSettings.port + ' ng-stop');
                        shutDownNailgunProcess.on('exit', (code, signal) => {
                            Log.log("nailgun server is stopped", LogLevel.Info);
                            this.setStopped();
                            return resolve(true);
                        });
                        this.backendProcess = null;
                        Log.logOutput(shutDownNailgunProcess, "NG stopper");
                    } else {
                        this.setStopped();
                        return resolve(true);
                    }
                }
            } catch (e) {
                Log.error("Error stopping nailgun server: " + e);
                resolve(false);
            }
        });
    }

    //the backend related processes (e.g z3) are child processes of the nailgun server, 
    //therefore, killing all childs of the nailgun server stops the right processes
    public stopVerification(ngPid?: number, secondTry: boolean = false): Promise<boolean> {
        return new Promise((resolve, reject) => {
            try {
                if (Server.backendService.backendServerPid) {
                    if (Settings.isWin) {
                        let killProcess = Common.spawner('wmic', ["process", "where", '"ParentProcessId=' + Server.backendService.backendServerPid + (ngPid ? ' or ParentProcessId=' + ngPid : "") + '"', "call", "terminate"]);
                        killProcess.on('exit', (code) => {
                            resolve(true);
                        });
                    } else {
                        //since z3 appears as the child process of the nailgun server, it suffices to kill all children of the nailgun server process
                        let killProcess = Common.spawner('pkill', ["-9", "-P", "" + Server.backendService.backendServerPid + (ngPid ? "," + ngPid : "")]);
                        killProcess.on('exit', (code) => {
                            // if (ngPid) {
                            //     killProcess = Common.spawner('kill', ['-9', '' + ngPid]);
                            //     killProcess.on('exit', (code) => {
                            //         resolve(true);
                            //     });
                            // } else {
                            resolve(true);
                            // }
                        });
                    }
                } else {
                    if (!secondTry) {
                        this.getServerPid().then(serverPid => {
                            Server.backendService.backendServerPid = serverPid;
                            this.stopVerification(ngPid, true).then(() => {
                                resolve(true);
                            })
                        }).catch((msg) => {
                            Log.error("Cannot kill the ng and z3 processes: " + msg);
                            resolve(false);
                        });
                    } else {
                        Log.error("Cannot kill the ng and z3 processes, because the nailgun server PID is unknown.");
                        resolve(false);
                    }
                }
            } catch (e) {
                Log.error("Error killing ng and z3: " + e)
                resolve(false);
            }
        });
    }

    public kill() {
        // Log.log('killing nailgun server, this may leave its sub processes running', LogLevel.Debug);
        // process.kill(this.nailgunProcess.pid, 'SIGTERM')

        if (this.timeout) {
            clearTimeout(this.timeout);
        }

        if (!this.backendProcess) {
            Log.error("cannot kill the Nailgun process, it is not running.");
            return;
        }
        Log.log('kill nailgun server', LogLevel.Debug);

        if (Settings.isWin) {
            let where = 'ParentProcessId=' + this.backendProcess.pid + ' or ProcessId=' + this.backendProcess.pid
                + (this.backendServerPid ? ' or ProcessId=' + this.backendServerPid + ' or ParentProcessId=' + this.backendServerPid : "");
            let killProcess = Common.spawner('wmic', ["process", "where", where, "call", "terminate"]);
        } else {
            //TODO: consider also killing the parent (its actually the shell process)
            Common.spawner('pkill', ["-9", "-P", "" + this.backendProcess.pid]);
            Common.spawner('kill', ["-9", "" + this.backendProcess.pid]);
        }

        //this.nailgunProcess.kill('SIGINT');
        this.backendProcess = null;
        this.setStopped();
    }

    protected checkBackendCompatibility(backend: Backend) {
        if (!Settings.useNailgunServer(Server.backend)) {
            Log.error("The used backendService does not correspond to the current engine: Nailgun")
        }
    }

    protected getStageCommand(fileToVerify: string, stage: Stage): string {
        let args = "$ngExe$ $mainMethod$ --nailgun-port $nailgunPort$ " + stage.customArguments;
        let command = Settings.expandCustomArguments(args, stage, fileToVerify, Server.backend);
        Log.log(command, LogLevel.Debug);
        return command;
    }

    private isNailgunServerReallyRunning(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (!this.backendProcess) {
                return resolve(false);
            }
            let command = '"' + Settings.settings.nailgunSettings.clientExecutable + '" --nailgun-port ' + Settings.settings.nailgunSettings.port + " NOT_USED_CLASS_NAME";
            Log.log(command, LogLevel.Debug);
            let nailgunServerTester = child_process.exec(command);
            nailgunServerTester.stderr.on('data', (data: string) => {
                if (data.startsWith("java.lang.ClassNotFoundException:")) {
                    return resolve(true);
                } else {
                    return resolve(false);
                }
            });
        });
    }
}