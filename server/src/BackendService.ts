'use strict';
import { clearTimeout } from 'timers';

import child_process = require('child_process');
import { Log } from './Log'
import { Settings } from './Settings'
import { Common, Stage, Backend, VerificationState, LogLevel } from './ViperProtocol'
import { Server } from './ServerClass';
import { VerificationTask } from './VerificationTask'

export abstract class BackendService {
    backendProcess: child_process.ChildProcess;
    verifyProcess: child_process.ChildProcess;
    backendServerPid: number;
    instanceCount: number = 0;
    isSessionRunning: boolean;
    ngSessionFinished = () => { };

    private _ready: boolean = false;

    static REQUIRED_JAVA_VERSION = 8;

    protected timeout;
    protected engine: string;

    public isViperServerService: boolean;

    public isReady(): boolean {
        return this._ready;
    }
    public abstract start(backend: Backend): Promise<boolean>;
    public abstract stop(): Promise<boolean>;
    public abstract stopVerification(ngPid?: number, secondTry?: boolean): Promise<boolean>;
    protected isBackendCompatible(backend: Backend): boolean {
        return Server.backend.engine.toLowerCase() != this.engine.toLowerCase();
    }

    public swapBackend(newBackend: Backend) {
        Log.error("The current backend service does not support swaping backends, stop the backend instead.")
        this.stop();
    }

    public kill() {
        this.stop();
    }

    public startStageProcess(fileToVerify: string, stage: Stage, onData, onError, onClose) {
        try {
            Log.log("Start Stage Process", LogLevel.LowLevelDebug);

            if (this.isBackendCompatible(Server.backend)) {
                Log.error("The engine required by the backend (" + Server.backend.engine + ") does not correspond to the running engine: " + this.engine)
            }

            let command = this.getStageCommand(fileToVerify, stage);

            this.verifyProcess = this.startVerifyProcess(command);

            this.registerHandler(onData, onError, onClose);

            return this.verifyProcess;
        } catch (e) {
            Log.error("Error starting stage process: " + e);
        }
    }

    protected registerHandler(onData, onError, onClose) {
        this.verifyProcess.stdout.on('data', onData);
        this.verifyProcess.stderr.on('data', onError);
        this.verifyProcess.on('close', onClose);
    }

    protected startVerifyProcess(command: string): child_process.ChildProcess {
        let verifyProcess = child_process.exec(command, { maxBuffer: 1024 * Settings.settings.advancedFeatures.verificationBufferSize, cwd: Server.backendOutputDirectory });
        Log.log("Verifier Process PID: " + verifyProcess.pid, LogLevel.Debug);
        this.isSessionRunning = true;
        return verifyProcess;
    }

    protected getServerPid(): Promise<number> {
        Log.log("Determining the backend server PID", LogLevel.LowLevelDebug);
        if (!this.backendProcess) {
            return Promise.reject("The backendProcess should be set before determining its PID");
        }

        return new Promise((resolve, reject) => {
            try {
                let command: string;
                if (Settings.isWin) {
                    command = 'wmic process where "parentprocessId=' + this.backendProcess.pid + ' and name=\'java.exe\'" get ProcessId';
                } else if (Settings.isLinux) {
                    command = 'pgrep -P ' + this.backendProcess.pid;
                } else {
                    //No need to get the childProcess
                    resolve(this.backendProcess.pid);
                    return;
                }
                Log.log("Getting backend server PID: " + command, LogLevel.Debug)
                child_process.exec(command, (strerr, stdout, stderr) => {
                    let regex = /.*?(\d+).*/.exec(stdout);
                    if (regex != null && regex[1]) {
                        resolve(parseInt(regex[1]));
                    } else {
                        Log.log("Error getting backend server Pid", LogLevel.LowLevelDebug);
                        reject("");
                    }
                });
            } catch (e) {
                reject("Error determining the backend server PID: " + e);
            }
        });
    }

    protected startTimeout(instanceCount: number) {
        let timeout = Settings.settings.viperServerSettings.timeout
        if (timeout) {
            this.timeout = setTimeout(() => {
                if (!this.isReady() && this.instanceCount == instanceCount) {
                    Log.hint("The backend server startup timed out after " + timeout + "ms, make sure the files in " + Settings.expandViperToolsPath("$ViperTools$/backends/") + " contain no conflicting jars");
                    this.kill();
                }
            }, timeout);
        }
    }

    public setReady(backend: Backend) {
        this._ready = true;
        Server.backend = backend;
        Server.startingOrRestarting = false;
        Log.log("The backend is ready for verification", LogLevel.Info);
        Server.sendBackendReadyNotification({
            name: Server.backend.name,
            restarted: Settings.settings.preferences.autoVerifyAfterBackendChange,
            isViperServer: Server.backendService.isViperServerService
        });

        this.getServerPid().then(pid => {
            this.backendServerPid = pid;
            Log.log("The backend server pid is " + pid, LogLevel.LowLevelDebug);
        }).catch(e => {
            Log.error(e);
        });
    }

    protected getStageCommand(fileToVerify: string, stage: Stage): string {
        let args = Server.backend.type + " " + stage.customArguments;
        let command = Settings.expandCustomArguments(args, stage, fileToVerify, Server.backend);
        Log.log(command, LogLevel.Debug);
        return command;
    }

    public setStopping() {
        this._ready = false;
        Server.startingOrRestarting = false;
        Server.sendStateChangeNotification({ newState: VerificationState.Stopping });
    }

    public setStopped() {
        Log.log("Set Stopped ", LogLevel.Debug);
        this._ready = false;
        Server.startingOrRestarting = false;
        Server.sendStateChangeNotification({ newState: VerificationState.Stopped });
    }

    public isJreInstalled(): Promise<boolean> {
        Log.log("Check Jre version", LogLevel.Verbose);
        return new Promise((resolve, reject) => {
            let is64bit = false;
            let dataHandler = (data: string) => {
                is64bit = is64bit || data.indexOf("64") >= 0;
                if (this.findAppropriateVersion(data)) {
                    resolve(true);
                }
            };
            let exitHandler = () => {
                if (!is64bit) {
                    Log.error("Error: Your java version is not 64-bit. The backend server will not work")
                }
                resolve(false);
            }
            let jreTester = Common.executer("java -version", dataHandler, dataHandler, exitHandler);
        });
    }

    private findAppropriateVersion(s: string): boolean {
        try {
            let match = /([1-9]\d*)\.(\d+)\.(\d+)/.exec(s);
            if (match && match[1] && match[2] && match[3]) {
                let major = Number.parseInt(match[1]);
                let minor = Number.parseInt(match[2]);
                return major > 1 || (major === 1 && minor >= BackendService.REQUIRED_JAVA_VERSION);
            }
        } catch (e) {
            Log.error("Error checking for the right java version: " + e);
        }
    }
}
