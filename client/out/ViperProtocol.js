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
exports.Commands = Commands;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9WaXBlclByb3RvY29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxXQUFZLGlCQUFpQjtJQUN6QiwrREFBVyxDQUFBO0lBQ1gsaUVBQVksQ0FBQTtJQUNaLHVGQUF1QixDQUFBO0lBQ3ZCLGlHQUE0QixDQUFBO0lBQzVCLDJGQUF5QixDQUFBO0lBQ3pCLDJEQUFTLENBQUE7SUFDVCxpRUFBWSxDQUFBO0FBQ2hCLENBQUMsRUFSVyx5QkFBaUIsS0FBakIseUJBQWlCLFFBUTVCO0FBUkQsSUFBWSxpQkFBaUIsR0FBakIseUJBUVgsQ0FBQTtBQUVEO0FBV0EsQ0FBQztBQVZVLHdCQUFlLEdBQUcsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztBQUNoRCxhQUFJLEdBQUcsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUM7QUFDMUIsa0JBQVMsR0FBRyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsQ0FBQztBQUNwQyxrQkFBUyxHQUFHLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxDQUFDO0FBQ3BDLHNCQUFhLEdBQUcsRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLENBQUM7QUFDNUMsK0JBQXNCLEdBQUcsRUFBRSxNQUFNLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQztBQUM5RCxnQ0FBdUIsR0FBRyxFQUFFLE1BQU0sRUFBRSx5QkFBeUIsRUFBRSxDQUFDO0FBQ2hFLG9CQUFXLEdBQUcsRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLENBQUM7QUFDeEMsZ0JBQU8sR0FBRyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQztBQUNoQyxlQUFNLEdBQUcsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLENBQUM7QUFWNUIsZ0JBQVEsV0FXcEIsQ0FBQSJ9