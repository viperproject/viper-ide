//Global interfaces:
"use strict";
//These commands are used to distinguish the different message types
class Commands {
}
//Server notifies client about invalid settings
Commands.InvalidSettings = { method: "InvalidSettings" };
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
exports.Commands = Commands;
//Communication between Language Client and Language Server:
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmlwZXJQcm90b2NvbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxvQkFBb0I7O0FBRXBCLG9FQUFvRTtBQUNwRTtBQTRDQSxDQUFDO0FBM0NHLCtDQUErQztBQUN4Qyx3QkFBZSxHQUFHLEVBQUUsTUFBTSxFQUFFLGlCQUFpQixFQUFFLENBQUM7QUFDdkQsc0RBQXNEO0FBQy9DLGtCQUFTLEdBQUcsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLENBQUM7QUFDM0Msc0RBQXNEO0FBQy9DLGtCQUFTLEdBQUcsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLENBQUM7QUFFcEMsc0JBQWEsR0FBRyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsQ0FBQztBQUNuRCxrREFBa0Q7QUFDM0MsNEJBQW1CLEdBQUcsRUFBRSxNQUFNLEVBQUUscUJBQXFCLEVBQUUsQ0FBQztBQUMvRCw2Q0FBNkM7QUFDdEMsb0JBQVcsR0FBRyxFQUFFLE1BQU0sRUFBRSxhQUFhLEVBQUUsQ0FBQztBQUMvQyx1Q0FBdUM7QUFDaEMsZ0JBQU8sR0FBRyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQztBQUN2Qyx5Q0FBeUM7QUFDbEMsZUFBTSxHQUFHLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDO0FBQ3JDLGtCQUFrQjtBQUNYLFlBQUcsR0FBRyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQztBQUN4QixjQUFLLEdBQUcsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLENBQUM7QUFDNUIsa0JBQVMsR0FBRyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsQ0FBQztBQUMzQyxnRUFBZ0U7QUFDekQsYUFBSSxHQUFHLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDO0FBQ2pDLHVEQUF1RDtBQUNoRCx5QkFBZ0IsR0FBRyxFQUFFLE1BQU0sRUFBRSxrQkFB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