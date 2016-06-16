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
exports.Commands = Commands;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9WaXBlclByb3RvY29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxXQUFZLGlCQUFpQjtJQUN6QiwrREFBVyxDQUFBO0lBQ1gsaUVBQVksQ0FBQTtJQUNaLHVGQUF1QixDQUFBO0lBQ3ZCLGlHQUE0QixDQUFBO0lBQzVCLDJGQUF5QixDQUFBO0lBQ3pCLDJEQUFTLENBQUE7SUFDVCxpRUFBWSxDQUFBO0FBQ2hCLENBQUMsRUFSVyx5QkFBaUIsS0FBakIseUJBQWlCLFFBUTVCO0FBUkQsSUFBWSxpQkFBaUIsR0FBakIseUJBUVgsQ0FBQTtBQUVEO0FBVUEsQ0FBQztBQVRVLHdCQUFlLEdBQUcsRUFBQyxNQUFNLEVBQUMsaUJBQWlCLEVBQUMsQ0FBQztBQUM3QyxhQUFJLEdBQUcsRUFBQyxNQUFNLEVBQUMsTUFBTSxFQUFDLENBQUM7QUFDdkIsa0JBQVMsR0FBRyxFQUFDLE1BQU0sRUFBQyxXQUFXLEVBQUMsQ0FBQztBQUNqQyxrQkFBUyxHQUFHLEVBQUMsTUFBTSxFQUFDLFdBQVcsRUFBQyxDQUFDO0FBQ2pDLHNCQUFhLEdBQUcsRUFBQyxNQUFNLEVBQUMsZUFBZSxFQUFDLENBQUM7QUFDekMsK0JBQXNCLEdBQUcsRUFBQyxNQUFNLEVBQUMsd0JBQXdCLEVBQUMsQ0FBQztBQUMzRCxnQ0FBdUIsR0FBRyxFQUFDLE1BQU0sRUFBQyx5QkFBeUIsRUFBQyxDQUFDO0FBQzdELG9CQUFXLEdBQUMsRUFBQyxNQUFNLEVBQUMsYUFBYSxFQUFDLENBQUM7QUFDbkMsZ0JBQU8sR0FBQyxFQUFDLE1BQU0sRUFBQyxTQUFTLEVBQUMsQ0FBQztBQVR6QixnQkFBUSxXQVVwQixDQUFBIn0=