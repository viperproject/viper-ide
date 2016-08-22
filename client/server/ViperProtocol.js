"use strict";
(function (VerificationState) {
    VerificationState[VerificationState["Stopped"] = 0] = "Stopped";
    VerificationState[VerificationState["Starting"] = 1] = "Starting";
    VerificationState[VerificationState["VerificationRunning"] = 2] = "VerificationRunning";
    VerificationState[VerificationState["VerificationPrintingHelp"] = 3] = "VerificationPrintingHelp";
    VerificationState[VerificationState["VerificationReporting"] = 4] = "VerificationReporting";
    VerificationState[VerificationState["Ready"] = 6] = "Ready";
    VerificationState[VerificationState["Stopping"] = 7] = "Stopping";
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
        return dark ? "grey" : "grey";
    }
    ;
}
exports.StateColors = StateColors;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmlwZXJQcm90b2NvbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsV0FBWSxpQkFBaUI7SUFDekIsK0RBQVcsQ0FBQTtJQUNYLGlFQUFZLENBQUE7SUFDWix1RkFBdUIsQ0FBQTtJQUN2QixpR0FBNEIsQ0FBQTtJQUM1QiwyRkFBeUIsQ0FBQTtJQUN6QiwyREFBUyxDQUFBO0lBQ1QsaUVBQVksQ0FBQTtBQUNoQixDQUFDLEVBUlcseUJBQWlCLEtBQWpCLHlCQUFpQixRQVE1QjtBQVJELElBQVksaUJBQWlCLEdBQWpCLHlCQVFYLENBQUE7QUFFRCxXQUFZLFFBQVE7SUFDaEIsdUNBQVEsQ0FBQTtJQUNSLDZDQUFXLENBQUE7SUFDWCx1Q0FBUSxDQUFBO0lBQ1IsNkNBQVcsQ0FBQTtJQUNYLHlDQUFTLENBQUE7SUFDVCx5REFBaUIsQ0FBQTtBQUNyQixDQUFDLEVBUFcsZ0JBQVEsS0FBUixnQkFBUSxRQU9uQjtBQVBELElBQVksUUFBUSxHQUFSLGdCQU9YLENBQUE7QUFFRCxXQUFZLFFBQVE7SUFBRyx1Q0FBSSxDQUFBO0lBQUUsdUNBQUksQ0FBQTtJQUFFLHVDQUFJLENBQUE7SUFBRSxtQ0FBRSxDQUFBO0lBQUUscUNBQUcsQ0FBQTtJQUFFLCtDQUFRLENBQUE7QUFBQyxDQUFDLEVBQWhELGdCQUFRLEtBQVIsZ0JBQVEsUUFBd0M7QUFBNUQsSUFBWSxRQUFRLEdBQVIsZ0JBQWdELENBQUE7QUFFNUQsV0FBWSxPQUFPO0lBQ2YscUNBQVEsQ0FBQTtJQUNSLDJDQUFXLENBQUE7SUFDWCx1REFBaUIsQ0FBQTtJQUNqQixpRUFBc0IsQ0FBQTtJQUN0QixpRUFBc0IsQ0FBQTtJQUN0QiwyQ0FBVyxDQUFBO0lBQ1gsdUNBQVMsQ0FBQTtBQUNiLENBQUMsRUFSVyxlQUFPLEtBQVAsZUFBTyxRQVFsQjtBQVJELElBQVksT0FBTyxHQUFQLGVBUVgs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