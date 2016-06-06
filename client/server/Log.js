'use strict';
var Log = (function () {
    function Log() {
    }
    Log.log = function (message) {
        this.connection.console.log("S: " + message);
    };
    Log.error = function (message) {
        this.connection.console.error("S: " + message);
    };
    Log.logWithOrigin = function (origin, message) {
        this.connection.console.log(origin + ": " + message);
    };
    Log.hint = function (message) {
        this.connection.sendNotification({ method: "Hint" }, message);
    };
    Log.sendNotification = function (method) {
        this.connection.sendNotification({ method: method });
    };
    Log.verificationStart = { method: "VerificationStart" };
    Log.verificationEnd = { method: "VerificationEnd" };
    Log.verificationProgress = { method: "VerificationProgress" };
    return Log;
}());
exports.Log = Log;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9Mb2cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBSWI7SUFBQTtJQTJCQSxDQUFDO0lBckJVLE9BQUcsR0FBVixVQUFXLE9BQWU7UUFDdEIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRU0sU0FBSyxHQUFaLFVBQWEsT0FBZTtRQUN4QixJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFFTSxpQkFBYSxHQUFwQixVQUFxQixNQUFjLEVBQUUsT0FBZTtRQUNoRCxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxPQUFPLENBQUMsQ0FBQztJQUN6RCxDQUFDO0lBRU0sUUFBSSxHQUFYLFVBQVksT0FBZTtRQUN2QixJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ2xFLENBQUM7SUFFTSxvQkFBZ0IsR0FBdkIsVUFBd0IsTUFBYztRQUNsQyxJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDekQsQ0FBQztJQXRCTSxxQkFBaUIsR0FBRyxFQUFFLE1BQU0sRUFBRSxtQkFBbUIsRUFBRSxDQUFBO0lBQ25ELG1CQUFlLEdBQUcsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQTtJQUMvQyx3QkFBb0IsR0FBRyxFQUFFLE1BQU0sRUFBRSxzQkFBc0IsRUFBRSxDQUFBO0lBdUJwRSxVQUFDO0FBQUQsQ0FBQyxBQTNCRCxJQTJCQztBQTNCWSxXQUFHLE1BMkJmLENBQUEifQ==