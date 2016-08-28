"use strict";
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
    LogLevel[LogLevel["None"] = 0] = "None";
    LogLevel[LogLevel["Default"] = 1] = "Default";
    LogLevel[LogLevel["Info"] = 2] = "Info";
    LogLevel[LogLevel["Verbose"] = 3] = "Verbose";
    LogLevel[LogLevel["Debug"] = 4] = "Debug";
    LogLevel[LogLevel["LowLevelDebug"] = 5] = "LowLevelDebug";
})(exports.LogLevel || (exports.LogLevel = {}));
var LogLevel = exports.LogLevel;
(function (StepType) {
    StepType[StepType["Stay"] = 0] = "Stay";
    StepType[StepType["Next"] = 1] = "Next";
    StepType[StepType["Back"] = 2] = "Back";
    StepType[StepType["In"] = 3] = "In";
    StepType[StepType["Out"] = 4] = "Out";
    StepType[StepType["Continue"] = 5] = "Continue";
})(exports.StepType || (exports.StepType = {}));
var StepType = exports.StepType;
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
(function (StatementType) {
    StatementType[StatementType["EXECUTE"] = 0] = "EXECUTE";
    StatementType[StatementType["EVAL"] = 1] = "EVAL";
    StatementType[StatementType["CONSUME"] = 2] = "CONSUME";
    StatementType[StatementType["PRODUCE"] = 3] = "PRODUCE";
    StatementType[StatementType["UNKONWN"] = 4] = "UNKONWN";
})(exports.StatementType || (exports.StatementType = {}));
var StatementType = exports.StatementType;
;
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
        return dark ? "grey" : "lightgrey";
    }
    ;
}
exports.StateColors = StateColors;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9WaXBlclByb3RvY29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxXQUFZLGlCQUFpQjtJQUN6QiwrREFBVyxDQUFBO0lBQ1gsaUVBQVksQ0FBQTtJQUNaLHVGQUF1QixDQUFBO0lBQ3ZCLGlHQUE0QixDQUFBO0lBQzVCLDJGQUF5QixDQUFBO0lBQ3pCLDZFQUFrQixDQUFBO0lBQ2xCLDJEQUFTLENBQUE7SUFDVCxpRUFBWSxDQUFBO0lBQ1osMkRBQVMsQ0FBQTtBQUNiLENBQUMsRUFWVyx5QkFBaUIsS0FBakIseUJBQWlCLFFBVTVCO0FBVkQsSUFBWSxpQkFBaUIsR0FBakIseUJBVVgsQ0FBQTtBQUVELFdBQVksUUFBUTtJQUNoQix1Q0FBUSxDQUFBO0lBQ1IsNkNBQVcsQ0FBQTtJQUNYLHVDQUFRLENBQUE7SUFDUiw2Q0FBVyxDQUFBO0lBQ1gseUNBQVMsQ0FBQTtJQUNULHlEQUFpQixDQUFBO0FBQ3JCLENBQUMsRUFQVyxnQkFBUSxLQUFSLGdCQUFRLFFBT25CO0FBUEQsSUFBWSxRQUFRLEdBQVIsZ0JBT1gsQ0FBQTtBQUVELFdBQVksUUFBUTtJQUFHLHVDQUFJLENBQUE7SUFBRSx1Q0FBSSxDQUFBO0lBQUUsdUNBQUksQ0FBQTtJQUFFLG1DQUFFLENBQUE7SUFBRSxxQ0FBRyxDQUFBO0lBQUUsK0NBQVEsQ0FBQTtBQUFDLENBQUMsRUFBaEQsZ0JBQVEsS0FBUixnQkFBUSxRQUF3QztBQUE1RCxJQUFZLFFBQVEsR0FBUixnQkFBZ0QsQ0FBQTtBQUU1RCxXQUFZLE9BQU87SUFDZixxQ0FBUSxDQUFBO0lBQ1IsMkNBQVcsQ0FBQTtJQUNYLHVEQUFpQixDQUFBO0lBQ2pCLGlFQUFzQixDQUFBO0lBQ3RCLGlFQUFzQixDQUFBO0lBQ3RCLDJDQUFXLENBQUE7SUFDWCx1Q0FBUyxDQUFBO0FBQ2IsQ0FBQyxFQVJXLGVBQU8sS0FBUCxlQUFPLFFBUWxCO0FB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