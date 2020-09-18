/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const child_process = require("child_process");
const Log_1 = require("./Log");
const Settings_1 = require("./Settings");
const ViperProtocol_1 = require("./ViperProtocol");
const ServerClass_1 = require("./ServerClass");
class BackendService {
    constructor() {
        this.instanceCount = 0;
        this.isSessionRunning = false;
        this.ngSessionFinished = () => { };
        this._ready = false;
    }
    isReady() {
        return this._ready;
    }
    isBackendCompatible(backend) {
        return ServerClass_1.Server.backend.engine.toLowerCase() != this.engine.toLowerCase();
    }
    swapBackend(newBackend) {
        Log_1.Log.error("The current backend service does not support swaping backends, stop the backend instead.");
        this.stop();
    }
    kill() {
        this.stop();
    }
    startStageProcess(fileToVerify, stage, onData, onError, onClose) {
        try {
            Log_1.Log.log("Start Stage Process", ViperProtocol_1.LogLevel.LowLevelDebug);
            if (this.isBackendCompatible(ServerClass_1.Server.backend)) {
                Log_1.Log.error("The engine required by the backend (" + ServerClass_1.Server.backend.engine + ") does not correspond to the running engine: " + this.engine);
            }
            let command = this.getStageCommand(fileToVerify, stage);
            //this.verifyProcess = 
            this.startVerifyProcess(command, fileToVerify, onData, onError, onClose);
        }
        catch (e) {
            Log_1.Log.error("Error starting stage process: " + e);
        }
    }
    getServerPid() {
        Log_1.Log.log("Determining the backend server PID", ViperProtocol_1.LogLevel.LowLevelDebug);
        if (!this.backendProcess) {
            if (Settings_1.Settings.settings.viperServerSettings.viperServerPolicy === "attach") {
                let url = Settings_1.Settings.settings.viperServerSettings.viperServerAddress + ":" + Settings_1.Settings.settings.viperServerSettings.viperServerPort;
                return Promise.reject("The backendProcess should be set before determining its PID " +
                    "(you have Settings.settings.viperServerSettings.viperServerPolicy set to 'attach'; " +
                    "is the server actually running on " + url + " ?)");
            }
            else {
                return Promise.reject("The backendProcess should be set before determining its PID");
            }
        }
        return new Promise((resolve, reject) => {
            try {
                let command;
                if (Settings_1.Settings.isWin) {
                    command = 'wmic process where "parentprocessId=' + this.backendProcess.pid + ' and name=\'java.exe\'" get ProcessId';
                }
                else if (Settings_1.Settings.isLinux) {
                    command = 'pgrep -P ' + this.backendProcess.pid;
                }
                else {
                    //No need to get the childProcess
                    resolve(this.backendProcess.pid);
                    return;
                }
                Log_1.Log.log("Getting backend server PID: " + command, ViperProtocol_1.LogLevel.Debug);
                child_process.exec(command, (strerr, stdout, stderr) => {
                    let regex = /.*?(\d+).*/.exec(stdout);
                    if (regex != null && regex[1]) {
                        resolve(parseInt(regex[1]));
                    }
                    else {
                        Log_1.Log.log("Error getting backend server Pid", ViperProtocol_1.LogLevel.LowLevelDebug);
                        reject("");
                    }
                });
            }
            catch (e) {
                reject("Error determining the backend server PID: " + e);
            }
        });
    }
    startTimeout(instanceCount) {
        let timeout = Settings_1.Settings.settings.viperServerSettings.timeout;
        if (timeout) {
            this.timeout = setTimeout(() => {
                if (!this.isReady() && this.instanceCount == instanceCount) {
                    Log_1.Log.hint("The backend server startup timed out after " + timeout + "ms, make sure the files in " + Settings_1.Settings.expandViperToolsPath("$ViperTools$/backends/") + " contain no conflicting jars");
                    this.kill();
                }
            }, timeout);
        }
    }
    setReady(backend) {
        this._ready = true;
        ServerClass_1.Server.backend = backend;
        ServerClass_1.Server.startingOrRestarting = false;
        Log_1.Log.log("The backend is ready for verification", ViperProtocol_1.LogLevel.Info);
        ServerClass_1.Server.sendBackendReadyNotification({
            name: ServerClass_1.Server.backend.name,
            restarted: Settings_1.Settings.settings.preferences.autoVerifyAfterBackendChange,
            isViperServer: ServerClass_1.Server.backendService.isViperServerService
        });
        this.getServerPid().then(pid => {
            this.backendServerPid = pid;
            Log_1.Log.log("The backend server pid is " + pid, ViperProtocol_1.LogLevel.LowLevelDebug);
        }).catch(e => {
            Log_1.Log.error(e);
        });
    }
    getViperBackendClassName(stage) {
        switch (ServerClass_1.Server.backend.type) {
            case "silicon": return "silicon";
            case "carbon": return "carbon";
            case "other": return stage.mainMethod;
            default: throw new Error('Invalid verification backend value. Possible values are silicon|carbon|other but found `' + ServerClass_1.Server.backend + '`');
        }
    }
    getStageCommand(fileToVerify, stage) {
        let args = this.getViperBackendClassName(stage) + " " + stage.customArguments;
        let command = Settings_1.Settings.expandCustomArguments(args, stage, fileToVerify, ServerClass_1.Server.backend);
        Log_1.Log.log(command, ViperProtocol_1.LogLevel.Debug);
        return command;
    }
    setStopping() {
        Log_1.Log.log("Set Stopping... ", ViperProtocol_1.LogLevel.Debug);
        this._ready = false;
        ServerClass_1.Server.startingOrRestarting = false;
        ServerClass_1.Server.sendStateChangeNotification({ newState: ViperProtocol_1.VerificationState.Stopping });
    }
    setStopped() {
        Log_1.Log.log("Set Stopped. ", ViperProtocol_1.LogLevel.Debug);
        this._ready = false;
        ServerClass_1.Server.startingOrRestarting = false;
        ServerClass_1.Server.sendStateChangeNotification({ newState: ViperProtocol_1.VerificationState.Stopped });
    }
    isJreInstalled() {
        Log_1.Log.log("Check JRE version", ViperProtocol_1.LogLevel.Verbose);
        return new Promise((resolve, reject) => {
            let is64bit = false;
            let dataHandler = (data) => {
                is64bit = is64bit || data.indexOf("64") >= 0;
                if (this.findAppropriateVersion(data)) {
                    resolve(true);
                }
            };
            let exitHandler = () => {
                if (!is64bit) {
                    Log_1.Log.error("Error: Your java version is not 64-bit. The backend server will not work");
                }
                resolve(false);
            };
            let jreTester = ViperProtocol_1.Common.executer("java -version", dataHandler, dataHandler, exitHandler);
        });
    }
    findAppropriateVersion(s) {
        try {
            let match = /([1-9]\d*)\.(\d+)\.(\d+)/.exec(s);
            if (match && match[1] && match[2] && match[3]) {
                let major = Number.parseInt(match[1]);
                let minor = Number.parseInt(match[2]);
                return major > 1 || (major === 1 && minor >= BackendService.REQUIRED_JAVA_VERSION);
            }
        }
        catch (e) {
            Log_1.Log.error("Error checking for the right java version: " + e);
        }
    }
}
BackendService.REQUIRED_JAVA_VERSION = 8;
exports.BackendService = BackendService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQmFja2VuZFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0JhY2tlbmRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7SUFNSTtBQUVKLFlBQVksQ0FBQzs7QUFHYiwrQ0FBZ0Q7QUFDaEQsK0JBQTJCO0FBQzNCLHlDQUFxQztBQUNyQyxtREFBcUY7QUFDckYsK0NBQXVDO0FBRXZDLE1BQXNCLGNBQWM7SUFBcEM7UUFFSSxrQkFBYSxHQUFXLENBQUMsQ0FBQztRQUMxQixxQkFBZ0IsR0FBWSxLQUFLLENBQUM7UUFHbEMsc0JBQWlCLEdBQUcsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBRXRCLFdBQU0sR0FBWSxLQUFLLENBQUM7SUFxTHBDLENBQUM7SUE1S1UsT0FBTztRQUNWLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUN2QixDQUFDO0lBSVMsbUJBQW1CLENBQUMsT0FBZ0I7UUFDMUMsT0FBTyxvQkFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUM1RSxDQUFDO0lBRU0sV0FBVyxDQUFDLFVBQW1CO1FBQ2xDLFNBQUcsQ0FBQyxLQUFLLENBQUMsMEZBQTBGLENBQUMsQ0FBQTtRQUNyRyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDaEIsQ0FBQztJQUVNLElBQUk7UUFDUCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDaEIsQ0FBQztJQUVNLGlCQUFpQixDQUFDLFlBQW9CLEVBQUUsS0FBWSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsT0FBTztRQUNqRixJQUFJO1lBQ0EsU0FBRyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSx3QkFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBRXZELElBQUksSUFBSSxDQUFDLG1CQUFtQixDQUFDLG9CQUFNLENBQUMsT0FB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