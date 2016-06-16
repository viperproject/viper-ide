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
var Commands = (function () {
    function Commands() {
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
    return Commands;
}());
exports.Commands = Commands;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmlwZXJQcm90b2NvbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsV0FBWSxpQkFBaUI7SUFDekIsK0RBQVcsQ0FBQTtJQUNYLGlFQUFZLENBQUE7SUFDWix1RkFBdUIsQ0FBQTtJQUN2QixpR0FBNEIsQ0FBQTtJQUM1QiwyRkFBeUIsQ0FBQTtJQUN6QiwyREFBUyxDQUFBO0lBQ1QsaUVBQVksQ0FBQTtBQUNoQixDQUFDLEVBUlcseUJBQWlCLEtBQWpCLHlCQUFpQixRQVE1QjtBQVJELElBQVksaUJBQWlCLEdBQWpCLHlCQVFYLENBQUE7QUFFRDtJQUFBO0lBVUEsQ0FBQztJQVRVLHdCQUFlLEdBQUcsRUFBQyxNQUFNLEVBQUMsaUJBQWlCLEVBQUMsQ0FBQztJQUM3QyxhQUFJLEdBQUcsRUFBQyxNQUFNLEVBQUMsTUFBTSxFQUFDLENBQUM7SUFDdkIsa0JBQVMsR0FBRyxFQUFDLE1BQU0sRUFBQyxXQUFXLEVBQUMsQ0FBQztJQUNqQyxrQkFBUyxHQUFHLEVBQUMsTUFBTSxFQUFDLFdBQVcsRUFBQyxDQUFDO0lBQ2pDLHNCQUFhLEdBQUcsRUFBQyxNQUFNLEVBQUMsZUFBZSxFQUFDLENBQUM7SUFDekMsK0JBQXNCLEdBQUcsRUFBQyxNQUFNLEVBQUMsd0JBQXdCLEVBQUMsQ0FBQztJQUMzRCxnQ0FBdUIsR0FBRyxFQUFDLE1BQU0sRUFBQyx5QkFBeUIsRUFBQyxDQUFDO0lBQzdELG9CQUFXLEdBQUMsRUFBQyxNQUFNLEVBQUMsYUFBYSxFQUFDLENBQUM7SUFDbkMsZ0JBQU8sR0FBQyxFQUFDLE1BQU0sRUFBQyxTQUFTLEVBQUMsQ0FBQztJQUN0QyxlQUFDO0FBQUQsQ0FBQyxBQVZELElBVUM7QUFWWSxnQkFBUSxXQVVwQixDQUFBIn0=