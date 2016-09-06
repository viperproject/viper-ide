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
//Server asks client to promt the backend selection dialog
Commands.AskUserToSelectBackend = { method: "AskUserToSelectBackend" };
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
Commands.BackendStarted = { method: "BackendStarted" };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmlwZXJQcm90b2NvbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxvQkFBb0I7O0FBRXBCLG9FQUFvRTtBQUNwRTtBQTRDQSxDQUFDO0FBM0NHLCtDQUErQztBQUN4Qyx3QkFBZSxHQUFHLEVBQUUsTUFBTSxFQUFFLGlCQUFpQixFQUFFLENBQUM7QUFDdkQsc0RBQXNEO0FBQy9DLGtCQUFTLEdBQUcsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLENBQUM7QUFDM0Msc0RBQXNEO0FBQy9DLGtCQUFTLEdBQUcsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLENBQUM7QUFFcEMsc0JBQWEsR0FBRyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsQ0FBQztBQUNuRCwwREFBMEQ7QUFDbkQsK0JBQXNCLEdBQUcsRUFBRSxNQUFNLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQztBQUNyRSxrREFBa0Q7QUFDM0MsNEJBQW1CLEdBQUcsRUFBRSxNQUFNLEVBQUUscUJBQXFCLEVBQUUsQ0FBQztBQUMvRCw2Q0FBNkM7QUFDdEMsb0JBQVcsR0FBRyxFQUFFLE1BQU0sRUFBRSxhQUFhLEVBQUUsQ0FBQztBQUMvQyx1Q0FBdUM7QUFDaEMsZ0JBQU8sR0FBRyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQztBQUN2Qyx5Q0FBeUM7QUFDbEMsZUFBTSxHQUFHLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDO0FBQ3JDLGtCQUFrQjtBQUNYLFlBQUcsR0FBRyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQztBQUN4QixjQUFLLEdBQUcsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLENBQUM7QUFDNUIsa0JBQVMsR0FBRyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsQ0FBQztBQUMzQyxnRUFBZ0U7QUFDekQsYUFBSSxHQUFHLEVBQUUsTUFBTSxFQUFFLE1B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