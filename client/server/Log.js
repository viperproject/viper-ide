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
            this.connection.sendNotification(ViperProtocol_1.Commands.Log, (logLevel >= ViperProtocol_1.LogLevel.Debug ? "[" + origin + "]: " : "") + message);
    }
    static hint(message) {
        this.connection.sendNotification(ViperProtocol_1.Commands.Hint, message);
    }
    static logOutput(process, label) {
        process.stdout.on('data', (data) => {
            Log.logWithOrigin(label, data, ViperProtocol_1.LogLevel.LowLevelDebug);
        });
        process.stdout.on('data', (data) => {
            Log.logWithOrigin(label + " error", data, ViperProtocol_1.LogLevel.LowLevelDebug);
        });
    }
}
Log.logLevel = ViperProtocol_1.LogLevel.Default;
exports.Log = Log;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9Mb2cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBR2IsZ0NBQWlDLGlCQUFpQixDQUFDLENBQUE7QUFHbkQ7SUFJSSxPQUFPLEdBQUcsQ0FBQyxPQUFlLEVBQUUsUUFBUSxHQUFhLHdCQUFRLENBQUMsT0FBTztRQUM3RCxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQztZQUN6QixJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFRCxPQUFPLFNBQVMsQ0FBQyxPQUFlLEVBQUUsUUFBUSxHQUFhLHdCQUFRLENBQUMsT0FBTztRQUNuRSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQztZQUN6QixJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3RFLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQyxPQUFlLEVBQUUsUUFBUSxHQUFhLHdCQUFRLENBQUMsS0FBSztRQUM3RCxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQztZQUN6QixJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ2xFLENBQUM7SUFFRCxPQUFPLGFBQWEsQ0FBQyxNQUFjLEVBQUUsT0FBZSxFQUFFLFFBQVEsR0FBYSx3QkFBUSxDQUFDLE9BQU87UUFDdkYsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUM7WUFDekIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsSUFBSSx3QkFBUSxDQUFDLEtBQUssR0FBRyxHQUFHLEdBQUMsTUFBTSxHQUFHLEtBQUssR0FBRyxFQUFFLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQztJQUN6SCxDQUFDO0lBRUQsT0FBTyxJQUFJLENBQUMsT0FBZTtRQUN2QixJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzdELENBQUM7SUFFRCxPQUFPLFNBQVMsQ0FBQyxPQUFtQyxFQUFDLEtBQVk7UUFDN0QsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSTtZQUMzQixHQUFHLENBQUMsYUFBYSxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsd0JBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUMzRCxDQUFDLENBQUMsQ0FBQztRQUNILE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDLElBQUk7WUFDM0IsR0FBRyxDQUFDLGFBQWEsQ0FBQyxLQUFLLEdBQUMsUUFBUSxFQUFFLElBQUksRUFBRSx3QkFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3BFLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztBQUNMLENBQUM7QUFuQ1UsWUFBUSxHQUFhLHdCQUFRLENBQUMsT0FBTyxDQUFDO0FBRHBDLFdBQUcsTUFvQ2YsQ0FBQSJ9