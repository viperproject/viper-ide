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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9WaXBlclByb3RvY29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxXQUFZLGlCQUFpQjtJQUN6QiwrREFBVyxDQUFBO0lBQ1gsaUVBQVksQ0FBQTtJQUNaLHVGQUF1QixDQUFBO0lBQ3ZCLGlHQUE0QixDQUFBO0lBQzVCLDJGQUF5QixDQUFBO0lBQ3pCLDJEQUFTLENBQUE7SUFDVCxpRUFBWSxDQUFBO0FBQ2hCLENBQUMsRUFSVyx5QkFBaUIsS0FBakIseUJBQWlCLFFBUTVCO0FBUkQsSUFBWSxpQkFBaUIsR0FBakIseUJBUVgsQ0FBQTtBQUVELFdBQVksUUFBUTtJQUNoQix1Q0FBUSxDQUFBO0lBQ1IsNkNBQVcsQ0FBQTtJQUNYLHVDQUFRLENBQUE7SUFDUiw2Q0FBVyxDQUFBO0lBQ1gseUNBQVMsQ0FBQTtJQUNULHlEQUFpQixDQUFBO0FBQ3JCLENBQUMsRUFQVyxnQkFBUSxLQUFSLGdCQUFRLFFBT25CO0FBUEQsSUFBWSxRQUFRLEdBQVIsZ0JBT1gsQ0FBQTtBQUVEO0FBZ0JBLENBQUM7QUFmVSx3QkFBZSxHQUFHLEVBQUUsTUFBTSxFQUFFLGlCQUFpQixFQUFFLENBQUM7QUFDaEQsYUFBSSxHQUFHLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDO0FBQzFCLGtCQUFTLEdBQUcsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLENBQUM7QUFDcEMsa0JBQVMsR0FBRyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsQ0FBQztBQUNwQyxzQkFBYSxHQUFHLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxDQUFDO0FBQzVDLCtCQUFzQixHQUFHLEVBQUUsTUFBTSxFQUFFLHdCQUF3QixFQUFFLENBQUM7QUFDOUQsZ0NBQXVCLEdBQUcsRUFBRSxNQUFNLEVBQUUseUJBQXlCLEVBQUUsQ0FBQztBQUNoRSxvQkFBVyxHQUFHLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxDQUFDO0FBQ3hDLGdCQUFPLEdBQUcsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUM7QUFDaEMsZUFBTSxHQUFHLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDO0FBQzlCLFlBQUcsR0FBRyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQztBQUN4QixjQUFLLEdBQUcsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLENBQUM7QUFDNUIseUJBQWdCLEdBQUcsRUFBRSxNQUFNLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQztBQUNsRCxrQkFBUyxHQUFHLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxDQUFDO0FBQ3BDLHNCQUFhLEdBQUcsRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLENBQUM7QUFmMUMsZ0JBQVEsV0FnQnBCLENBQUE7QUFFRCxXQUFZLE9BQU87SUFDZixxQ0FBUSxDQUFBO0lBQ1IsMkNBQVcsQ0FBQTtJQUNYLHVEQUFpQixDQUFBO0lBQ2pCLGlFQUFzQixDQUFBO0lBQ3RCLGlFQUFzQixDQUFBO0lBQ3RCLDJDQUFXLENBQUE7SUFDWCx1Q0FBUyxDQUFBO0FBQ2IsQ0FBQyxFQVJXLGVBQU8sS0FBUCxlQUFPLFFBUWxCO0FBUkQsSUFBWSxPQUFPLEdBQVAsZUFRWCxDQUFBIn0=