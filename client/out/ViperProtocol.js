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
Commands.GetDotExecutable = { method: "GetDotExecutable" }; //void -> dotExecutable:string
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9WaXBlclByb3RvY29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLHdCQUFnQixzQkFBc0IsQ0FBQyxDQUFBO0FBRXZDLG9CQUFvQjtBQUVwQixvRUFBb0U7QUFDcEU7QUFrREEsQ0FBQztBQWpERyxrQkFBa0I7QUFDbEIsK0RBQStEO0FBQ3hELHdCQUFlLEdBQUcsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQyxDQUFBLHVCQUF1QjtBQUM5RSx3RUFBd0U7QUFDakUsK0JBQXNCLEdBQUcsRUFBRSxNQUFNLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQyxDQUFBLG9DQUFvQztBQUN6Ryw2Q0FBNkM7QUFDdEMsb0JBQVcsR0FBRyxFQUFFLE1BQU0sRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFBLG1CQUFtQjtBQUNsRSxTQUFTO0FBQ1QsNkJBQTZCO0FBQ3RCLFlBQUcsR0FBRyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFBLFdBQVc7QUFDMUMsb0NBQW9DO0FBQzdCLGNBQUssR0FBRyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFBLFdBQVc7QUFDOUMsK0JBQStCO0FBQ3hCLGtCQUFTLEdBQUcsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQSxXQUFXO0FBQ3RELGdFQUFnRTtBQUN6RCxhQUFJLEdBQUcsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQSxpQkFBaUI7QUFDbEQsb0RBQW9EO0FBQzdDLHNCQUFhLEdBQUcsRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLENBQUMsQ0FBQSxjQUFjO0FBQ2pFLDhDQUE4QztBQUN2QyxtQkFBVSxHQUFHLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxDQUFDLENBQUEsYUFBYTtBQUMxRCw4Q0FBOEM7QUFDdkMsbUJBQVUsR0FBRyxFQUFF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