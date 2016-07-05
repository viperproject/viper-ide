'use strict';
const ViperProtocol_1 = require('./ViperProtocol');
class Log {
    static log(message, logLevel = ViperProtocol_1.LogLevel.Default) {
        if (Log.logLevel >= logLevel)
            this.connection.sendNotification(ViperProtocol_1.Commands.Log, message);
    }
    static toLogFile(message, logLevel = ViperProtocol_1.LogLevel.Default) {
        if (Log.logLevel >= logLevel)
            this.connection.sendNotification(ViperProtocol_1.Commands.ToLogFile, message);
    }
    static error(message, logLevel = ViperProtocol_1.LogLevel.Debug) {
        if (Log.logLevel >= logLevel)
            this.connection.sendNotification(ViperProtocol_1.Commands.Error, message);
    }
    static logWithOrigin(origin, message, logLevel = ViperProtocol_1.LogLevel.Default) {
        if (Log.logLevel >= logLevel)
            this.connection.sendNotification(ViperProtocol_1.Commands.Log, (logLevel >= ViperProtocol_1.LogLevel.Debug ? origin + ": " : "") + message);
    }
    static hint(message) {
        this.connection.sendNotification(ViperProtocol_1.Commands.Hint, message);
    }
}
Log.logLevel = ViperProtocol_1.LogLevel.Default;
exports.Log = Log;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9Mb2cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBR2IsZ0NBQWlDLGlCQUFpQixDQUFDLENBQUE7QUFFbkQ7SUFJSSxPQUFPLEdBQUcsQ0FBQyxPQUFlLEVBQUUsUUFBUSxHQUFhLHdCQUFRLENBQUMsT0FBTztRQUM3RCxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQztZQUN6QixJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFRCxPQUFPLFNBQVMsQ0FBQyxPQUFlLEVBQUUsUUFBUSxHQUFhLHdCQUFRLENBQUMsT0FBTztRQUNuRSxFQUFFLENBQUMsQ0FBRSxHQUFHLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQztZQUMxQixJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3RFLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQyxPQUFlLEVBQUUsUUFBUSxHQUFhLHdCQUFRLENBQUMsS0FBSztRQUM3RCxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQztZQUN6QixJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ2xFLENBQUM7SUFFRCxPQUFPLGFBQWEsQ0FBQyxNQUFjLEVBQUUsT0FBZSxFQUFFLFFBQVEsR0FBYSx3QkFBUSxDQUFDLE9BQU87UUFDdkYsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUM7WUFDekIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsSUFBRSx3QkFBUSxDQUFDLEtBQUssR0FBQyxNQUFNLEdBQUcsSUFBSSxHQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxDQUFDO0lBQzlHLENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQyxPQUFlO1FBQ3ZCLElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDN0QsQ0FBQztBQUNMLENBQUM7QUExQlUsWUFBUSxHQUFhLHdCQUFRLENBQUMsT0FBTyxDQUFDO0FBRHBDLFdBQUcsTUEyQmYsQ0FBQSJ9