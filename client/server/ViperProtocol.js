/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_uri_1 = require("vscode-uri");
const child_process = require("child_process");
const Log_1 = require("./Log");
var sudo = require('sudo-prompt');
//Global interfaces:
//These commands are used to distinguish the different message types
class Commands {
}
//SERVER TO CLIENT
//Server notifies client about the result of the settings check
Commands.SettingsChecked = "SettingsChecked"; //SettingsCheckedParams
//The language server requests what version is required for the settings
Commands.RequestRequiredVersion = "RequestRequiredVersion"; //void -> requiredVersions: Versions
//Server notifies client about a state change
Commands.StateChange = "StateChange"; //StateChangeParams
//LOGGING
//Log a message to the output
Commands.Log = "Log"; //LogParams
//Log an error message to the output
Commands.Error = "Error"; //LogParams
//Log a message to the log file
Commands.ToLogFile = "ToLogFile"; //LogParams
//Server tells client to show an information message to the user
Commands.Hint = "Hint"; //message: string
//Server tells client to show progress
Commands.Progress = "Progress"; //message: {domain:string, curr:number, total:number}
//Server is informing client about opened file
Commands.FileOpened = "FileOpened"; //uri: string
//Server is informing client about closed file
Commands.FileClosed = "FileClosed"; //uri: string
//Server is notifying client that the verification could not be started
Commands.VerificationNotStarted = "VerificationNotStarted"; //uri: string
//Either server or client request debugging to be stopped
Commands.StopDebugging = "StopDebugging"; //void
//Server informs client about started backend
Commands.BackendReady = "BackendReady"; //BackendReadyParams
Commands.StepsAsDecorationOptions = "StepsAsDecorationOptions"; //StepsAsDecorationOptionsResult
Commands.HeapGraph = "HeapGraph"; //HeapGraph
/** The language server notifies an unhandled message type from ViperServer.
 *
 *  Used to inform the client that there might be some additional messages
 *  that may be destined to some extension via the ViperApi.
 */
Commands.UnhandledViperServerMessageType = 'UnhandledViperServerMessageType';
//CLIENT TO SERVER
//Client asks server for the list of backend names
Commands.RequestBackendNames = "RequestBackendNames"; //void
//Client tells server to dispose itself
Commands.Dispose = "Dispose"; //void
//Client requests verification for a file
Commands.Verify = "Verify"; //VerifyParams
//Client tells server to abort the running verification
Commands.StopVerification = "StopVerification"; //filePath:string
Commands.ShowHeap = "ShowHeap"; //ShowHeapParams
//Client tells Server to start backends
Commands.StartBackend = "StartBackend"; //backendName:string
//client asks Server to stop the backend
Commands.StopBackend = "StopBackend"; //void
//swap backend without restarting
Commands.SwapBackend = "SwapBackend"; //backendName:string
//Request a list of all states that led to the current state
Commands.GetExecutionTrace = "GetExecutionTrace"; //GetExecutionTraceParams -> trace:ExecutionTrace[]
//remove the diagnostics in the file specified by uri
Commands.RemoveDiagnostics = "RemoveDiagnostics";
//update the viper tools
Commands.UpdateViperTools = "UpdateViperTools";
//The server requests the custom file endings specified in the configuration
Commands.GetViperFileEndings = "GetViperFileEndings";
//The server notifies the client about the completed update
Commands.ViperUpdateComplete = "ViperUpdateComplete";
//the server requests a check of the settings.json files from the client
Commands.CheckIfSettingsVersionsSpecified = "CheckIfSettingsVersionsSpecified";
//The client requests the cache in the viperserver to be flushed, (either completely or for a file)
Commands.FlushCache = "FlushCache";
//The server requests the identifier at some location in the current file to answer the gotoDefinition request
Commands.GetIdentifier = "GetIdentifier";
exports.Commands = Commands;
var VerificationState;
(function (VerificationState) {
    VerificationState[VerificationState["Stopped"] = 0] = "Stopped";
    VerificationState[VerificationState["Starting"] = 1] = "Starting";
    VerificationState[VerificationState["VerificationRunning"] = 2] = "VerificationRunning";
    VerificationState[VerificationState["VerificationPrintingHelp"] = 3] = "VerificationPrintingHelp";
    VerificationState[VerificationState["VerificationReporting"] = 4] = "VerificationReporting";
    VerificationState[VerificationState["PostProcessing"] = 5] = "PostProcessing";
    VerificationState[VerificationState["Ready"] = 6] = "Ready";
    VerificationState[VerificationState["Stopping"] = 7] = "Stopping";
    VerificationState[VerificationState["Stage"] = 8] = "Stage";
})(VerificationState = exports.VerificationState || (exports.VerificationState = {}));
var LogLevel;
(function (LogLevel) {
    //No output
    LogLevel[LogLevel["None"] = 0] = "None";
    //Only verification specific output
    LogLevel[LogLevel["Default"] = 1] = "Default";
    //Some info about internal state, critical errors
    LogLevel[LogLevel["Info"] = 2] = "Info";
    //More info about internal state
    LogLevel[LogLevel["Verbose"] = 3] = "Verbose";
    //Detailed information about internal state, non critical errors
    LogLevel[LogLevel["Debug"] = 4] = "Debug";
    //all output of used tools is written to logFile,
    //some of it also to the console
    LogLevel[LogLevel["LowLevelDebug"] = 5] = "LowLevelDebug";
})(LogLevel = exports.LogLevel || (exports.LogLevel = {}));
//Verification Success
var Success;
(function (Success) {
    //Used for initialization
    Success[Success["None"] = 0] = "None";
    Success[Success["Success"] = 1] = "Success";
    Success[Success["ParsingFailed"] = 2] = "ParsingFailed";
    Success[Success["TypecheckingFailed"] = 3] = "TypecheckingFailed";
    Success[Success["VerificationFailed"] = 4] = "VerificationFailed";
    //Manually aborted verification
    Success[Success["Aborted"] = 5] = "Aborted";
    //Caused by internal error
    Success[Success["Error"] = 6] = "Error";
    //Caused by veification taking too long
    Success[Success["Timeout"] = 7] = "Timeout";
})(Success = exports.Success || (exports.Success = {}));
//colors of states shown in the source code during debugging for both viper light and viper dark theme
class StateColors {
    //currently selected state
    static currentState(dark) {
        return dark ? "red" : "red";
    }
    ;
    //previously selected state
    static previousState(dark) {
        return dark ? "green" : "green";
    }
    ;
    //state in which an error was reported by the backend
    static errorState(dark) {
        return dark ? "yellow" : "orange";
    }
    ;
    //state in same method as current state
    static interestingState(dark) {
        return dark ? "yellow" : "orange";
    }
    ;
    //state in other method
    static uninterestingState(dark) {
        return dark ? "grey" : "grey";
    }
    ;
}
exports.StateColors = StateColors;
//Communication between Language Server and Debugger:
var StepType;
(function (StepType) {
    StepType[StepType["Stay"] = 0] = "Stay";
    StepType[StepType["Next"] = 1] = "Next";
    StepType[StepType["Back"] = 2] = "Back";
    StepType[StepType["In"] = 3] = "In";
    StepType[StepType["Out"] = 4] = "Out";
    StepType[StepType["Continue"] = 5] = "Continue";
})(StepType = exports.StepType || (exports.StepType = {}));
//Language Server Internal:
var StatementType;
(function (StatementType) {
    StatementType[StatementType["EXECUTE"] = 0] = "EXECUTE";
    StatementType[StatementType["EVAL"] = 1] = "EVAL";
    StatementType[StatementType["CONSUME"] = 2] = "CONSUME";
    StatementType[StatementType["PRODUCE"] = 3] = "PRODUCE";
    StatementType[StatementType["UNKONWN"] = 4] = "UNKONWN";
})(StatementType = exports.StatementType || (exports.StatementType = {}));
;
var SettingsErrorType;
(function (SettingsErrorType) {
    SettingsErrorType[SettingsErrorType["Error"] = 0] = "Error";
    SettingsErrorType[SettingsErrorType["Warning"] = 1] = "Warning";
})(SettingsErrorType = exports.SettingsErrorType || (exports.SettingsErrorType = {}));
class BackendOutputType {
}
BackendOutputType.Start = "Start";
BackendOutputType.End = "End";
BackendOutputType.VerificationStart = "VerificationStart";
BackendOutputType.MethodVerified = "MethodVerified";
BackendOutputType.FunctionVerified = "FunctionVerified";
BackendOutputType.PredicateVerified = "PredicateVerified";
BackendOutputType.Error = "Error";
BackendOutputType.Outline = "Outline";
BackendOutputType.Definitions = "Definitions";
BackendOutputType.Success = "Success";
BackendOutputType.Stopped = "Stopped";
exports.BackendOutputType = BackendOutputType;
class Definition {
    constructor(def, location, scope) {
        this.type = def.type;
        this.name = def.name;
        this.location = location;
        this.scope = scope;
    }
}
exports.Definition = Definition;
class Common {
    //URI helper Methods
    static uriToPath(uri) {
        let uriObject = vscode_uri_1.default.parse(uri);
        let platformIndependentPath = uriObject.fsPath;
        return platformIndependentPath;
    }
    static pathToUri(path) {
        let uriObject = vscode_uri_1.default.file(path);
        let platformIndependentUri = uriObject.toString();
        return platformIndependentUri;
    }
    //Helper methods for child processes
    static executer(command, dataHandler, errorHandler, exitHandler) {
        try {
            Log_1.Log.logWithOrigin("executer", command, LogLevel.Debug);
            let child = child_process.exec(command, function (error, stdout, stderr) {
                Log_1.Log.logWithOrigin('executer:stdout', stdout, LogLevel.LowLevelDebug);
                if (dataHandler) {
                    dataHandler(stdout);
                }
                Log_1.Log.logWithOrigin('executer:stderr', stderr, LogLevel.LowLevelDebug);
                if (errorHandler) {
                    errorHandler(stderr);
                }
                if (error !== null) {
                    Log_1.Log.logWithOrigin('executer', '' + error, LogLevel.LowLevelDebug);
                }
                if (exitHandler) {
                    Log_1.Log.logWithOrigin('executer', 'done', LogLevel.LowLevelDebug);
                    exitHandler();
                }
            });
            return child;
        }
        catch (e) {
            Log_1.Log.error("Error executing " + command + ": " + e);
        }
    }
    static sudoExecuter(command, name, callback) {
        Log_1.Log.log("sudo-executer: " + command, LogLevel.Debug);
        let options = { name: name };
        let child = sudo.exec(command, options, function (error, stdout, stderr) {
            Log_1.Log.logWithOrigin('stdout', stdout, LogLevel.LowLevelDebug);
            Log_1.Log.logWithOrigin('stderr', stderr, LogLevel.LowLevelDebug);
            if (error) {
                Log_1.Log.error('sudo-executer error: ' + error);
            }
            callback();
        });
    }
    static spawner(command, args) {
        Log_1.Log.log("spawner: " + command + " " + args.join(" "), LogLevel.Debug);
        try {
            let child = child_process.spawn(command, args, { detached: true });
            child.on('stdout', data => {
                Log_1.Log.logWithOrigin('spawner stdout', data, LogLevel.LowLevelDebug);
            });
            child.on('stderr', data => {
                Log_1.Log.logWithOrigin('spawner stderr', data, LogLevel.LowLevelDebug);
            });
            child.on('exit', data => {
                Log_1.Log.log('spawner done: ' + data, LogLevel.LowLevelDebug);
            });
            return child;
        }
        catch (e) {
            Log_1.Log.error("Error spawning command: " + e);
        }
    }
    static backendRestartNeeded(settings, oldBackendName, newBackendName) {
        if (!settings)
            return true;
        let oldBackend = settings.verificationBackends.find(value => value.name == oldBackendName);
        let newBackend = settings.verificationBackends.find(value => value.name == newBackendName);
        if (oldBackend && newBackend && oldBackend.engine.toLowerCase() == 'viperserver' && newBackend.engine.toLowerCase() == 'viperserver')
            return false;
        return true;
    }
    static isViperServer(settings, newBackendName) {
        if (!settings)
            return false;
        let newBackend = settings.verificationBackends.find(value => value.name == newBackendName);
        if (newBackend && newBackend.engine.toLowerCase() == 'viperserver')
            return true;
        return false;
    }
    static comparePosition(a, b) {
        if (!a && !b)
            return 0;
        if (!a)
            return -1;
        if (!b)
            return 1;
        if (a.line < b.line || (a.line === b.line && a.character < b.character)) {
            return -1;
        }
        else if (a.line === b.line && a.character === b.character) {
            return 0;
        }
        else {
            return 1;
        }
    }
}
exports.Common = Common;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmlwZXJQcm90b2NvbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0lBTUk7QUFFSixZQUFZLENBQUM7O0FBRWIsMkNBQTZCO0FBQzdCLCtDQUFnRDtBQUNoRCwrQkFBNEI7QUFDNUIsSUFBSSxJQUFJLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBRWxDLG9CQUFvQjtBQUVwQixvRUFBb0U7QUFDcEUsTUFBYSxRQUFROztBQUNqQixrQkFBa0I7QUFDbEIsK0RBQStEO0FBQ3hELHdCQUFlLEdBQUcsaUJBQWlCLENBQUMsQ0FBQSx1QkFBdUI7QUFDbEUsd0VBQXdFO0FBQ2pFLCtCQUFzQixHQUFHLHdCQUF3QixDQUFDLENBQUEsb0NBQW9DO0FBQzdGLDZDQUE2QztBQUN0QyxvQkFBVyxHQUFHLGFBQWEsQ0FBQyxDQUFBLG1CQUFtQjtBQUN0RCxTQUFTO0FBQ1QsNkJBQTZCO0FBQ3RCLFlBQUcsR0FBRyxLQUFLLENBQUMsQ0FBQSxXQUFXO0FBQzlCLG9DQUFvQztBQUM3QixjQUFLLEdBQUcsT0FBTyxDQUFDLENBQUEsV0FBVztBQUNsQywrQkFBK0I7QUFDeEIsa0JBQVMsR0FBRyxXQUFXLENBQUMsQ0FBQSxXQUFXO0FBQzFDLGdFQUFnRTtBQUN6RCxhQUFJLEdBQUcsTUFBTSxDQUFDLENBQUEsaUJBQWlCO0FBQ3RDLHNDQUFzQztBQUMvQixpQkFBUSxHQUFHLFVBQVUsQ0FBQyxDQUFBLHFEQUFxRDtBQUNsRiw4Q0FBOEM7QUFDdkMsbUJBQVUsR0FBRyxZQUFZLENBQUMsQ0FBQSxhQUFhO0FBQzlDLDhDQUE4QztBQUN2QyxtQkFBVSxHQUFHLFlBQVksQ0FBQyxDQUFBLGFBQWE7QUFDOUMsdUVBQXVFO0FBQ2hFLCtCQUFzQixHQUFHLHdCQUF3QixDQUFDLENBQUEsYUFBYTtBQUN0RSx5REFBeUQ7QUFDbEQsc0JBQWEsR0FB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