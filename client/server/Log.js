'use strict';
var ViperProtocol_1 = require('./ViperProtocol');
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
        this.connection.sendNotification(ViperProtocol_1.Commands.Hint, message);
    };
    return Log;
}());
exports.Log = Log;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9Mb2cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBR2IsOEJBQXVCLGlCQUFpQixDQUFDLENBQUE7QUFFekM7SUFBQTtJQWtCQSxDQUFDO0lBZlUsT0FBRyxHQUFWLFVBQVcsT0FBZTtRQUN0QixJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxDQUFDO0lBQ2pELENBQUM7SUFFTSxTQUFLLEdBQVosVUFBYSxPQUFlO1FBQ3hCLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQUVNLGlCQUFhLEdBQXBCLFVBQXFCLE1BQWMsRUFBRSxPQUFlO1FBQ2hELElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsSUFBSSxHQUFHLE9BQU8sQ0FBQyxDQUFDO0lBQ3pELENBQUM7SUFFTSxRQUFJLEdBQVgsVUFBWSxPQUFlO1FBQ3ZCLElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDN0QsQ0FBQztJQUNMLFVBQUM7QUFBRCxDQUFDLEFBbEJELElBa0JDO0FBbEJZLFdBQUcsTUFrQmYsQ0FBQSJ9