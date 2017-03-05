'use strict';

import child_process = require('child_process');
import { Log } from './Log'
import { Settings } from './Settings'
import { Common, Stage, Backend, VerificationState, LogLevel } from './ViperProtocol'
import { Server } from './ServerClass';
import { VerificationTask } from './VerificationTask'
var tree_kill = require('tree-kill');

export class NailgunService {
    nailgunProcess: child_process.ChildProcess;
    nailgunServerPid: number;
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

        this.getNailgunServerPid().then(pid => {
            this.nailgunServerPid = pid;
            Log.log("The nailgun server pid is " + pid);
        }).catch(e => {
            Log.error(e);
        });
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

    public startOrRestartNailgunServer(backend: Backend, reverifyWhenBackendReady: boolean) {
        try {
            this.reverifyWhenBackendReady = reverifyWhenBackendReady;
            if (NailgunService.startingOrRestarting) {
                Log.log("Server is already starting or restarting, don't restart", LogLevel.Debug);
                return;
            }

            //Stop all running verificationTasks before restarting backend
            VerificationTask.stopAllRunningVerifications().then(done => {
                //check java version
                this.isJreInstalled().then(jreInstalled => {
                    if (!jreInstalled) {
                        Log.hint("No compatible Java 8 (64bit) Runtime Environment is installed. Please install it.");
                        this.setStopped(); return;
                    }
                    this.activeBackend = backend;
                    if (!backend.useNailgun) {
                        //If nailgun is disabled, don't start it
                        this.setReady(this.activeBackend);
                        return;
                    }
                    this.stopNailgunServer().then(success => {
                        NailgunService.startingOrRestarting = true;
                        Log.log('starting nailgun server', LogLevel.Info);
                        //notify client
                        Server.sendBackendChangeNotification(backend.name);
                        Server.sendStateChangeNotification({ newState: VerificationState.Starting, backendName: backend.name });

                        //set determine the nailgun port if needed
                        return Settings.setNailgunPort(Settings.settings.nailgunSettings);
                    }).then(success => {

                        let command = 'java ' + Settings.settings.javaSettings.customArguments + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + Settings.settings.nailgunSettings.port;
                        let backendJars = Settings.backendJars(backend);
                        command = command.replace(/\$backendPaths\$/g, '"' + Settings.settings.nailgunSettings.serverJar + '"' + backendJars);
                        Log.log(command, LogLevel.Debug)

                        this.instanceCount++;
                        this.startNailgunTimeout(this.instanceCount);
                        this.nailgunProcess = child_process.exec(command, { cwd: Server.backendOutputDirectory });
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
                if (Settings.settings.nailgunSettings.port == '*') {
                    if (this.isReady() || NailgunService.startingOrRestarting) {
                        Log.error("Error: inconsistent state detected, the nailgun port is * but the nailgun server is not stopped.");
                    }
                    Log.log("nailgun server is stopped", LogLevel.Info);
                    this.setStopped();
                    resolve(true);
                } else {
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
                }
            } catch (e) {
                Log.error("Error stopping nailgun server: " + e);
                resolve(false);
            }
        });
    }

    //the backend related processes (e.g z3) are child processes of the nailgun server, 
    //therefore, killing all childs of the nailgun server stops the right processes
    public killNGAndZ3(ngPid?: number, secondTry: boolean = false): Thenable<boolean> {
        return new Promise((resolve, reject) => {
            try {
                if (Server.nailgunService.nailgunServerPid) {
                    if (Settings.isWin) {
                        let wmic = Common.spawner('wmic', ["process", "where", 'ParentProcessId=' + Server.nailgunService.nailgunServerPid + (ngPid ? ' or ParentProcessId=' + ngPid : ""), "call", "terminate"]);
                        wmic.on('exit', (code) => {
                            resolve(true);
                        });
                    } else {
                        //since z3 appears as the child process of the nailgun server, it suffices to kill all children of the nailgun server process
                        let wmic = Common.spawner('pkill', ["-P", "" + Server.nailgunService.nailgunServerPid + (ngPid ? "," + ngPid : "")]);
                        wmic.on('exit', (code) => {
                            resolve(true);
                        });
                    }
                } else {
                    if (!secondTry) {
                        this.getNailgunServerPid().then(serverPid => {
                            Server.nailgunService.nailgunServerPid = serverPid;
                            this.killNGAndZ3(ngPid, true).then(() => {
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

    private getNailgunServerPid(): Promise<number> {
        Log.log("Determining the nailgun server PID", LogLevel.LowLevelDebug);
        return new Promise((resolve, reject) => {
            try {
                let command: string;
                if (Settings.isWin) {
                    command = 'wmic process where "parentprocessId=' + this.nailgunProcess.pid + ' and name=\'java.exe\'" get ProcessId';
                } else if (Settings.isLinux) {
                    command = 'pgrep -P ' + this.nailgunProcess.pid;
                } else {
                    //No need to get the childProcess
                    resolve(this.nailgunProcess.pid);
                    return;
                }
                Log.log("Getting nailgun PID: " + command, LogLevel.Debug)
                child_process.exec(command, (strerr, stdout, stderr) => {
                    let regex = /.*?(\d+).*/.exec(stdout);
                    if (regex[1]) {
                        resolve(regex[1]);
                    } else {
                        Log.log("Error getting Nailgun Pid");
                        reject("");
                    }
                });
            } catch (e) {
                reject("Error determining the nailgun server PID");
            }
        });
    }

    public killAllNgAndZ3Processes(): Thenable<boolean> {
        // TODO: it would be much better to kill the processes by process group,
        // unfortunaltey that did not work.
        // Moreover, the nailgun client is not listening to the SIGINT signal, 
        // thus, this mechanism cannot be used to gracefully shut down nailgun and its child processes.
        // using the pID to kill the processes is also not an option, as we do not know the pID of z3

        Log.log("kill all ng and z3 processes");
        return new Promise((resolve, reject) => {
            let killCommand: string;
            if (Settings.isWin) {
                killCommand = "taskkill /F /T /im ng.exe & taskkill /F /T /im z3.exe";
            } else if (Settings.isLinux) {
                killCommand = "pkill -x ng; pkill -x z3";
            } else {
                killCommand = "pkill -x ng; pkill -x z3";
            }
            let killer = Common.executer(killCommand);
            killer.on("exit", (data) => {
                Log.log("ng client and z3 killer: " + data, LogLevel.Debug);
                return resolve(true);
            });
            Log.logOutput(killer, "kill ng.exe");
        });
    }

    public killNailgunServer() {
        // Log.log('killing nailgun server, this may leave its sub processes running', LogLevel.Debug);
        // process.kill(this.nailgunProcess.pid, 'SIGTERM')
        Log.log('recursively killing nailgun server', LogLevel.Debug);
        this.killRecursive(this.nailgunProcess.pid);

        if (Settings.isWin) {
            let wmic = Common.spawner('wmic', ["process", "where", 'ParentProcessId=' + this.nailgunProcess.pid + ' or ProcessId=' + this.nailgunProcess.pid, "call", "terminate"]);
            //let wmic = this.executer('wmic process where "ParentProcessId=' + this.nailgunProcess.pid + ' or ProcessId=' + this.nailgunProcess.pid + '" call terminate');
        } else {
            //TODO: consider also killing the parent (its actually the shell process)
            Common.spawner('pkill', ["-P", "" + this.nailgunProcess.pid]);
        }

        //this.nailgunProcess.kill('SIGINT');
        this.nailgunProcess = null;
    }

    private killRecursive(pid): Promise<boolean> {
        return new Promise((resolve, reject) => {
            tree_kill(pid, 'SIGKILL', (err) => {
                Log.log("tree-killer done: " + err);
                resolve(true);
            });
        });
    }

    // public startStageProcessUsingSpawn(fileToVerify: string, stage: Stage, onData, onError, onClose): child_process.ChildProcess {
    //     let command = "";
    //     if (this.activeBackend.useNailgun) {
    //         //command = '"' + Settings.settings.nailgunSettings.clientExecutable + '"';
    //         command = Settings.settings.nailgunSettings.clientExecutable.toString();
    //     } else {
    //         command = 'java';
    //     }
    //     let args: string[] = Settings.splitArguments(Settings.settings.javaSettings.customArguments); //TODO: what if the argument contains spaces?
    //     args = Settings.expandCustomArgumentsForSpawn(args, stage, fileToVerify, this.activeBackend);

    //     Log.log(command + ' ' + args.join(' '), LogLevel.Debug);

    //     let verifyProcess = child_process.spawn(command, args, { cwd: Server.backendOutputDirectory });
    //     verifyProcess.stdout.on('data', onData);
    //     verifyProcess.stderr.on('data', onError);
    //     verifyProcess.on('close', onClose);
    //     return verifyProcess;
    // }

    public startStageProcess(fileToVerify: string, stage: Stage, onData, onError, onClose): child_process.ChildProcess {
        try {
            Log.log("Start Stage Process", LogLevel.LowLevelDebug);
            let program = this.activeBackend.useNailgun ? ('"' + Settings.settings.nailgunSettings.clientExecutable + '"') : ('java ' + Settings.settings.javaSettings.customArguments);
            let command = Settings.expandCustomArguments(program, stage, fileToVerify, this.activeBackend);
            Log.log(command, LogLevel.Debug);
            let verifyProcess = child_process.exec(command, { maxBuffer: 1024 * Settings.settings.advancedFeatures.verificationBufferSize, cwd: Server.backendOutputDirectory });
            verifyProcess.stdout.on('data', onData);
            verifyProcess.stderr.on('data', onError);
            verifyProcess.on('close', onClose);
            return verifyProcess;
        } catch (e) {
            Log.error("Error starting stage process: " + e);
        }
    }

    private isNailgunServerReallyRunning(): Thenable<boolean> {
        return new Promise((resolve, reject) => {
            if (!this.nailgunProcess) {
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