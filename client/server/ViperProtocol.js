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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmlwZXJQcm90b2NvbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxvQkFBb0I7O0FBRXBCO0FBeUJBLENBQUM7QUF4QlUsd0JBQWUsR0FBRyxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsRUFBRSxDQUFDO0FBQ2hELGFBQUksR0FBRyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsQ0FBQztBQUMxQixrQkFBUyxHQUFHLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxDQUFDO0FBQ3BDLGtCQUFTLEdBQUcsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLENBQUM7QUFDcEMsc0JBQWEsR0FBRyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsQ0FBQztBQUM1QywrQkFBc0IsR0FBRyxFQUFFLE1BQU0sRUFBRSx3QkFBd0IsRUFBRSxDQUFDO0FBQzlELDRCQUFtQixHQUFHLEVBQUUsTUFBTSxFQUFFLHFCQUFxQixFQUFFLENBQUM7QUFDeEQsb0JBQVcsR0FBRyxFQUFFLE1BQU0sRUFBRSxhQUFhLEVBQUUsQ0FBQztBQUN4QyxnQkFBTyxHQUFHLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxDQUFDO0FBQ2hDLGVBQU0sR0FBRyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsQ0FBQztBQUM5QixZQUFHLEdBQUcsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUM7QUFDeEIsY0FBSyxHQUFHLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxDQUFDO0FBQzVCLHlCQUFnQixHQUFHLEVBQUUsTUFBTSxFQUFFLGtCQUFrQixFQUFFLENBQUM7QUFDbEQsa0JBQVMsR0FBRyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsQ0FBQztBQUNwQyxzQkFBYSxHQUFHLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxDQUFDO0FBQzVDLGlDQUF3QixHQUFHLEVBQUUsTUFBTSxFQUFF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