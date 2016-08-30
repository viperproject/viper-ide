//Global interfaces:
"use strict";
class Commands {
}
Commands.InvalidSettings = { method: "InvalidSettings" };
Commands.Hint = { method: "Hint" };
Commands.UriToPath = { method: "UriToPath" };
Commands.PathToUri = { method: "PathToUri" };
Commands.SelectBackend = { method: "SelectBackend" };
Commands.AskUserToSelectBackend = { method: "AskUserToSelectBackend" };
Commands.RequestBackendNames = { method: "RequestBackendNames" };
Commands.StateChange = { method: "StateChange" };
Commands.Dispose = { method: "Dispose" };
Commands.Verify = { method: "Verify" };
Commands.Log = { method: "Log" };
Commands.Error = { method: "Error" };
Commands.StopVerification = { method: "StopVerification" };
Commands.ToLogFile = { method: "ToLogFile" };
Commands.BackendChange = { method: "BackendChange" };
Commands.StepsAsDecorationOptions = { method: "StepsAsDecorationOptions" };
Commands.ShowHeap = { method: "ShowHeap" };
Commands.HeapGraph = { method: "HeapGraph" };
Commands.StateSelected = { method: "StateSelected" };
Commands.FileOpened = { method: "FileOpened" };
Commands.FileClosed = { method: "FileClosed" };
Commands.VerificationNotStarted = { method: "VerificationNotStarted" };
Commands.StopDebugging = { method: "StopDebugging" };
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
(function (Success) {
    Success[Success["None"] = 0] = "None";
    Success[Success["Success"] = 1] = "Success";
    Success[Success["ParsingFailed"] = 2] = "ParsingFailed";
    Success[Success["TypecheckingFailed"] = 3] = "TypecheckingFailed";
    Success[Success["VerificationFailed"] = 4] = "VerificationFailed";
    Success[Success["Aborted"] = 5] = "Aborted";
    Success[Success["Error"] = 6] = "Error";
})(exports.Success || (exports.Success = {}));
var Success = exports.Success;
class StateColors {
    static currentState(dark) {
        return dark ? "red" : "red";
    }
    ;
    static previousState(dark) {
        return dark ? "green" : "green";
    }
    ;
    static errorState(dark) {
        return dark ? "yellow" : "orange";
    }
    ;
    static interestingState(dark) {
        return dark ? "yellow" : "orange";
    }
    ;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9WaXBlclByb3RvY29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLG9CQUFvQjs7QUFFcEI7QUF5QkEsQ0FBQztBQXhCVSx3QkFBZSxHQUFHLEVBQUUsTUFBTSxFQUFFLGlCQUFpQixFQUFFLENBQUM7QUFDaEQsYUFBSSxHQUFHLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDO0FBQzFCLGtCQUFTLEdBQUcsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLENBQUM7QUFDcEMsa0JBQVMsR0FBRyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsQ0FBQztBQUNwQyxzQkFBYSxHQUFHLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxDQUFDO0FBQzVDLCtCQUFzQixHQUFHLEVBQUUsTUFBTSxFQUFFLHdCQUF3QixFQUFFLENBQUM7QUFDOUQsNEJBQW1CLEdBQUcsRUFBRSxNQUFNLEVBQUUscUJBQXFCLEVBQUUsQ0FBQztBQUN4RCxvQkFBVyxHQUFHLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxDQUFDO0FBQ3hDLGdCQUFPLEdBQUcsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUM7QUFDaEMsZUFBTSxHQUFHLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDO0FBQzlCLFlBQUcsR0FBRyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQztBQUN4QixjQUFLLEdBQUcsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLENBQUM7QUFDNUIseUJBQWdCLEdBQUcsRUFBRSxNQUFNLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQztBQUNsRCxrQkFBUyxHQUFHLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxDQUFDO0FBQ3BDLHNCQUFhLEdBQUcsRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLENBQUM7QUFDNUMsaUNBQXdCLEdBQUcsRUFBRSxNQUFNLEVBQUUsMEJBQTBCLEVB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