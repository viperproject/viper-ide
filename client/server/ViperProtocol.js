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
    Commands.Verify = { method: "Verify" };
    return Commands;
}());
exports.Commands = Commands;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmlwZXJQcm90b2NvbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsV0FBWSxpQkFBaUI7SUFDekIsK0RBQVcsQ0FBQTtJQUNYLGlFQUFZLENBQUE7SUFDWix1RkFBdUIsQ0FBQTtJQUN2QixpR0FBNEIsQ0FBQTtJQUM1QiwyRkFBeUIsQ0FBQTtJQUN6QiwyREFBUyxDQUFBO0lBQ1QsaUVBQVksQ0FBQTtBQUNoQixDQUFDLEVBUlcseUJBQWlCLEtBQWpCLHlCQUFpQixRQVE1QjtBQVJELElBQVksaUJBQWlCLEdBQWpCLHlCQVFYLENBQUE7QUFFRDtJQUFBO0lBV0EsQ0FBQztJQVZVLHdCQUFlLEdBQUcsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztJQUNoRCxhQUFJLEdBQUcsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUM7SUFDMUIsa0JBQVMsR0FBRyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsQ0FBQztJQUNwQyxrQkFBUyxHQUFHLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxDQUFDO0lBQ3BDLHNCQUFhLEdBQUcsRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLENBQUM7SUFDNUMsK0JBQXNCLEdBQUcsRUFBRSxNQUFNLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQztJQUM5RCxnQ0FBdUIsR0FBRyxFQUFFLE1BQU0sRUFBRSx5QkFBeUIsRUFBRSxDQUFDO0lBQ2hFLG9CQUFXLEdBQUcsRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLENBQUM7SUFDeEMsZ0JBQU8sR0FBRyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQztJQUNoQyxlQUFNLEdBQUcsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLENBQUM7SUFDekMsZUFBQztBQUFELENBQUMsQUFYRCxJQVdDO0FBWFksZ0JBQVEsV0FXcEIsQ0FBQSJ9