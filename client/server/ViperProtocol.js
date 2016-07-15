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
class Commands {
}
Commands.InvalidSettings = { method: "InvalidSettings" };
Commands.Hint = { method: "Hint" };
Commands.UriToPath = { method: "UriToPath" };
Commands.PathToUri = { method: "PathToUri" };
Commands.SelectBackend = { method: "SelectBackend" };
Commands.AskUserToSelectBackend = { method: "AskUserToSelectBackend" };
Commands.RequestBackendSelection = { method: "RequestBackendSelection" };
Commands.StateChange = { method: "StateChange" };
Commands.Dispose = { method: "Dispose" };
Commands.Verify = { method: "Verify" };
Commands.Log = { method: "Log" };
Commands.Error = { method: "Error" };
Commands.StopVerification = { method: "StopVerification" };
Commands.ToLogFile = { method: "ToLogFile" };
Commands.BackendChange = { method: "BackendChange" };
Commands.StepsAsDecorationOptions = { method: "StepsAsDecorationOptions" };
exports.Commands = Commands;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmlwZXJQcm90b2NvbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsV0FBWSxpQkFBaUI7SUFDekIsK0RBQVcsQ0FBQTtJQUNYLGlFQUFZLENBQUE7SUFDWix1RkFBdUIsQ0FBQTtJQUN2QixpR0FBNEIsQ0FBQTtJQUM1QiwyRkFBeUIsQ0FBQTtJQUN6QiwyREFBUyxDQUFBO0lBQ1QsaUVBQVksQ0FBQTtBQUNoQixDQUFDLEVBUlcseUJBQWlCLEtBQWpCLHlCQUFpQixRQVE1QjtBQVJELElBQVksaUJBQWlCLEdBQWpCLHlCQVFYLENBQUE7QUFFRCxXQUFZLFFBQVE7SUFDaEIsdUNBQVEsQ0FBQTtJQUNSLDZDQUFXLENBQUE7SUFDWCx1Q0FBUSxDQUFBO0lBQ1IsNkNBQVcsQ0FBQTtJQUNYLHlDQUFTLENBQUE7SUFDVCx5REFBaUIsQ0FBQTtBQUNyQixDQUFDLEVBUFcsZ0JBQVEsS0FBUixnQkFBUSxRQU9uQjtBQVBELElBQVksUUFBUSxHQUFSLGdCQU9YLENBQUE7QUFFRDtBQWlCQSxDQUFDO0FBaEJVLHdCQUFlLEdBQUcsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztBQUNoRCxhQUFJLEdBQUcsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUM7QUFDMUIsa0JBQVMsR0FBRyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsQ0FBQztBQUNwQyxrQkFBUyxHQUFHLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxDQUFDO0FBQ3BDLHNCQUFhLEdBQUcsRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLENBQUM7QUFDNUMsK0JBQXNCLEdBQUcsRUFBRSxNQUFNLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQztBQUM5RCxnQ0FBdUIsR0FBRyxFQUFFLE1BQU0sRUFBRSx5QkFBeUIsRUFBRSxDQUFDO0FBQ2hFLG9CQUFXLEdBQUcsRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLENBQUM7QUFDeEMsZ0JBQU8sR0FBRyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQztBQUNoQyxlQUFNLEdBQUcsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLENBQUM7QUFDOUIsWUFBRyxHQUFHLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxDQUFDO0FBQ3hCLGNBQUssR0FBRyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsQ0FBQztBQUM1Qix5QkFBZ0IsR0FBRyxFQUFFLE1BQU0sRUFBRSxrQkFBa0IsRUFBRSxDQUFDO0FBQ2xELGtCQUFTLEdBQUcsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLENBQUM7QUFDcEMsc0JBQWEsR0FBRyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsQ0FBQztBQUM1QyxpQ0FBd0IsR0FBRyxFQUFFLE1BQU0sRUFBRSwwQkFBMEIsRUFBRSxDQUFDO0FBaEJoRSxnQkFBUSxXQWlCcEIsQ0FBQTtBQUdELFdBQVksT0FBTztJQUNmLHFDQUFRLENBQUE7SUFDUiwyQ0FBVyxDQUFBO0lBQ1gsdURBQWlCLENBQUE7SUFDakIsaUVBQXNCLENBQUE7SUFDdEIsaUVBQXNCLENBQUE7SUFDdEIsMkNBQVcsQ0FBQTtJQUNYLHVDQUFTLENBQUE7QUFDYixDQUFDLEVBUlcsZUFBTyxLQUFQLGVBQU8sUUFRbEI7QUFSRCxJQUFZLE9BQU8sR0FBUCxlQVFYLENBQUEifQ==