'use strict';
const index_1 = require('vscode-uri/lib/index');
//Global interfaces:
//These commands are used to distinguish the different message types
class Commands {
}
//SERVER TO CLIENT
//Server notifies client about the result of the settings check
Commands.SettingsChecked = { method: "SettingsChecked" }; //SettingsCheckedParams
//The language server requests what version is required for the settings
Commands.RequestRequiredVersion = { method: "RequestRequiredVersion" }; //void -> requiredVersions: Versions
//Server notifies client about a state change
Commands.StateChange = { method: "StateChange" }; //StateChangeParams
//LOGGING
//Log a message to the output
Commands.Log = { method: "Log" }; //LogParams
//Log an error message to the output
Commands.Error = { method: "Error" }; //LogParams
//Log a message to the log file
Commands.ToLogFile = { method: "ToLogFile" }; //LogParams
//Server tells client to show an information message to the user
Commands.Hint = { method: "Hint" }; //message: string
//Server informs client about ongoing backend change
Commands.BackendChange = { method: "BackendChange" }; //name: string
//Server is informing client about opened file
Commands.FileOpened = { method: "FileOpened" }; //uri: string
//Server is informing client about closed file
Commands.FileClosed = { method: "FileClosed" }; //uri: string
//Server is notifying client that the verification could not be started
Commands.VerificationNotStarted = { method: "VerificationNotStarted" }; //uri: string
//Either server or client request debugging to be stopped
Commands.StopDebugging = { method: "StopDebugging" }; //void
//Server informs client about started backend
Commands.BackendReady = { method: "BackendReady" }; //BackendReadyParams
Commands.StepsAsDecorationOptions = { method: "StepsAsDecorationOptions" }; //StepsAsDecorationOptionsResult
Commands.HeapGraph = { method: "HeapGraph" }; //HeapGraph
//static StateSelected = { method: "StateSelected" };
//CLIENT TO SERVER
//static SelectBackend = { method: "SelectBackend" };
//Client asks server for the list of backend names
Commands.RequestBackendNames = { method: "RequestBackendNames" }; //void
//Client tells server to dispose itself
Commands.Dispose = { method: "Dispose" }; //void
//Client requests verification for a file
Commands.Verify = { method: "Verify" }; //VerifyParams
//Client tells server to abort the running verification
Commands.StopVerification = { method: "StopVerification" }; //filePath:string
Commands.ShowHeap = { method: "ShowHeap" }; //ShowHeapParams
//Client tells Server to start backends
Commands.StartBackend = { method: "StartBackend" }; //backendName:string
//Request a list of all states that led to the current state
Commands.GetExecutionTrace = { method: "GetExecutionTrace" }; //GetExecutionTraceParams -> trace:ExecutionTrace[]
//Request the path to the dot executable from the language server
//static GetDotExecutable = { method: "GetDotExecutable" };//void -> dotExecutable:string
//remove the diagnostics in the file specified by uri
Commands.RemoveDiagnostics = { method: "RemoveDiagnostics" };
exports.Commands = Commands;
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
})(exports.VerificationState || (exports.VerificationState = {}));
var VerificationState = exports.VerificationState;
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
})(exports.LogLevel || (exports.LogLevel = {}));
var LogLevel = exports.LogLevel;
//Verification Success
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
})(exports.Success || (exports.Success = {}));
var Success = exports.Success;
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
(function (StepType) {
    StepType[StepType["Stay"] = 0] = "Stay";
    StepType[StepType["Next"] = 1] = "Next";
    StepType[StepType["Back"] = 2] = "Back";
    StepType[StepType["In"] = 3] = "In";
    StepType[StepType["Out"] = 4] = "Out";
    StepType[StepType["Continue"] = 5] = "Continue";
})(exports.StepType || (exports.StepType = {}));
var StepType = exports.StepType;
//Language Server Internal:
(function (StatementType) {
    StatementType[StatementType["EXECUTE"] = 0] = "EXECUTE";
    StatementType[StatementType["EVAL"] = 1] = "EVAL";
    StatementType[StatementType["CONSUME"] = 2] = "CONSUME";
    StatementType[StatementType["PRODUCE"] = 3] = "PRODUCE";
    StatementType[StatementType["UNKONWN"] = 4] = "UNKONWN";
})(exports.StatementType || (exports.StatementType = {}));
var StatementType = exports.StatementType;
;
(function (SettingsErrorType) {
    SettingsErrorType[SettingsErrorType["Error"] = 0] = "Error";
    SettingsErrorType[SettingsErrorType["Warning"] = 1] = "Warning";
})(exports.SettingsErrorType || (exports.SettingsErrorType = {}));
var SettingsErrorType = exports.SettingsErrorType;
class BackendOutputType {
}
BackendOutputType.Start = "Start";
BackendOutputType.End = "End";
BackendOutputType.VerificationStart = "VerificationStart";
BackendOutputType.MethodVerified = "MethodVerified";
BackendOutputType.FunctionVerified = "FunctionVerified";
BackendOutputType.PredicateVerified = "PredicateVerified";
BackendOutputType.Error = "Error";
BackendOutputType.Success = "Success";
exports.BackendOutputType = BackendOutputType;
class Common {
    //URI helper Methods
    static uriToPath(uri) {
        let uriObject = index_1.default.parse(uri);
        let platformIndependentPath = uriObject.fsPath;
        return platformIndependentPath;
    }
    static pathToUri(path) {
        let uriObject = index_1.default.file(path);
        let platformIndependentUri = uriObject.toString();
        return platformIndependentUri;
    }
}
exports.Common = Common;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmlwZXJQcm90b2NvbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYix3QkFBZ0Isc0JBQXNCLENBQUMsQ0FBQTtBQUV2QyxvQkFBb0I7QUFFcEIsb0VBQW9FO0FBQ3BFO0FBcURBLENBQUM7QUFwREcsa0JBQWtCO0FBQ2xCLCtEQUErRDtBQUN4RCx3QkFBZSxHQUFHLEVBQUUsTUFBTSxFQUFFLGlCQUFpQixFQUFFLENBQUMsQ0FBQSx1QkFBdUI7QUFDOUUsd0VBQXdFO0FBQ2pFLCtCQUFzQixHQUFHLEVBQUUsTUFBTSxFQUFFLHdCQUF3QixFQUFFLENBQUMsQ0FBQSxvQ0FBb0M7QUFDekcsNkNBQTZDO0FBQ3RDLG9CQUFXLEdBQUcsRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLENBQUMsQ0FBQSxtQkFBbUI7QUFDbEUsU0FBUztBQUNULDZCQUE2QjtBQUN0QixZQUFHLEdBQUcsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQSxXQUFXO0FBQzFDLG9DQUFvQztBQUM3QixjQUFLLEdBQUcsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQSxXQUFXO0FBQzlDLCtCQUErQjtBQUN4QixrQkFBUyxHQUFHLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUEsV0FBVztBQUN0RCxnRUFBZ0U7QUFDekQsYUFBSSxHQUFHLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUEsaUJBQWlCO0FBQ2xELG9EQUFvRDtBQUM3QyxzQkFBYSxHQUFHLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUEsY0FBYztBQUNqRSw4Q0FBOEM7QUFDdkMsbUJBQVUsR0FBRyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsQ0FBQyxDQUFBLGFBQWE7QUFDMUQsOENBQThDO0FBQ3ZDLG1CQUFV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