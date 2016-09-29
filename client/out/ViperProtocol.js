//Global interfaces:
"use strict";
//These commands are used to distinguish the different message types
class Commands {
}
//Server notifies client about the result of the settings check
Commands.SettingsChecked = { method: "SettingsChecked" };
//Server asks client to transform a uri to a file path
Commands.UriToPath = { method: "UriToPath" };
//Server asks client to transform a file path to a uri
Commands.PathToUri = { method: "PathToUri" };
Commands.SelectBackend = { method: "SelectBackend" };
//Client asks server for the list of backend names
Commands.RequestBackendNames = { method: "RequestBackendNames" };
//Server notifies client about a state change
Commands.StateChange = { method: "StateChange" };
//Client tells server to dispose itself
Commands.Dispose = { method: "Dispose" };
//Client requests verification for a file
Commands.Verify = { method: "Verify" };
//Used for logging
Commands.Log = { method: "Log" };
Commands.Error = { method: "Error" };
Commands.ToLogFile = { method: "ToLogFile" };
//Server tells client to show an information message to the user
Commands.Hint = { method: "Hint" };
//Client tells server to abort the running verification
Commands.StopVerification = { method: "StopVerification" };
//Server informs client about ongoing backend change
Commands.BackendChange = { method: "BackendChange" };
Commands.StepsAsDecorationOptions = { method: "StepsAsDecorationOptions" };
Commands.ShowHeap = { method: "ShowHeap" };
Commands.HeapGraph = { method: "HeapGraph" };
Commands.StateSelected = { method: "StateSelected" };
//Server is informing client about opened file
Commands.FileOpened = { method: "FileOpened" };
//Server is informing client about closed file
Commands.FileClosed = { method: "FileClosed" };
//Server is notifying client that the verification could not be started
Commands.VerificationNotStarted = { method: "VerificationNotStarted" };
//Either server or client request debugging to be stopped
Commands.StopDebugging = { method: "StopDebugging" };
//Server informs client about started backend
Commands.BackendReady = { method: "BackendReady" };
//Client tells Server to start backends
Commands.StartBackend = { method: "StartBackend" };
//Request a list of all states that led to the current state
Commands.GetExecutionTrace = { method: "GetExecutionTrace" };
//Request the path to the dot executable from the language server
Commands.GetDotExecutable = { method: "GetDotExecutable" };
//The language server requests what version is required for the settings
Commands.RequestRequiredVersion = { method: "RequestRequiredVersion" };
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
exports.BackendOutputType = BackendOutputType;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9WaXBlclByb3RvY29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLG9CQUFvQjs7QUFFcEIsb0VBQW9FO0FBQ3BFO0FBa0RBLENBQUM7QUFqREcsK0RBQStEO0FBQ3hELHdCQUFlLEdBQUcsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztBQUN2RCxzREFBc0Q7QUFDL0Msa0JBQVMsR0FBRyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsQ0FBQztBQUMzQyxzREFBc0Q7QUFDL0Msa0JBQVMsR0FBRyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsQ0FBQztBQUVwQyxzQkFBYSxHQUFHLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxDQUFDO0FBQ25ELGtEQUFrRDtBQUMzQyw0QkFBbUIsR0FBRyxFQUFFLE1BQU0sRUFBRSxxQkFBcUIsRUFBRSxDQUFDO0FBQy9ELDZDQUE2QztBQUN0QyxvQkFBVyxHQUFHLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxDQUFDO0FBQy9DLHVDQUF1QztBQUNoQyxnQkFBTyxHQUFHLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxDQUFDO0FBQ3ZDLHlDQUF5QztBQUNsQyxlQUFNLEdBQUcsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLENBQUM7QUFDckMsa0JBQWtCO0FBQ1gsWUFBRyxHQUFHLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxDQUFDO0FBQ3hCLGNBQUssR0FBRyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsQ0FBQztBQUM1QixrQkFBUyxHQUFHLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxDQUFDO0FBQzNDLGdFQUFnRTtBQUN6RCxhQUFJLEdBQUcsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUM7QUFDakMsdURBQXVEO0FBQ2hELHlCQUFnQixHQUFHLEVBQUUsTUFBTSxFQUFFLGtCQUFrQixFQUFFLENB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