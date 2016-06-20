'use strict';
var ViperProtocol_1 = require('./ViperProtocol');
var Log = (function () {
    function Log() {
    }
    Log.log = function (message) {
        this.connection.sendNotification(ViperProtocol_1.Commands.Log, message);
    };
    Log.error = function (message) {
        this.connection.sendNotification(ViperProtocol_1.Commands.Error, message);
    };
    Log.logWithOrigin = function (origin, message) {
        this.connection.sendNotification(ViperProtocol_1.Commands.Log, origin + ": " + message);
    };
    Log.hint = function (message) {
        this.connection.sendNotification(ViperProtocol_1.Commands.Hint, message);
    };
    return Log;
}());
exports.Log = Log;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9Mb2cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBR2IsOEJBQXVCLGlCQUFpQixDQUFDLENBQUE7QUFFekM7SUFBQTtJQWtCQSxDQUFDO0lBZlUsT0FBRyxHQUFWLFVBQVcsT0FBZTtRQUN0QixJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsR0FBRyxFQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFTSxTQUFLLEdBQVosVUFBYSxPQUFlO1FBQ3hCLElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxLQUFLLEVBQUMsT0FBTyxDQUFDLENBQUM7SUFDN0QsQ0FBQztJQUVNLGlCQUFhLEdBQXBCLFVBQXFCLE1BQWMsRUFBRSxPQUFlO1FBQ2hELElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxHQUFHLEVBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxPQUFPLENBQUMsQ0FBQztJQUMzRSxDQUFDO0lBRU0sUUFBSSxHQUFYLFVBQVksT0FBZTtRQUN2QixJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzdELENBQUM7SUFDTCxVQUFDO0FBQUQsQ0FBQyxBQWxCRCxJQWtCQztBQWxCWSxXQUFHLE1Ba0JmLENBQUEifQ==