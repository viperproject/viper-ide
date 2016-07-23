'use strict';
const ViperProtocol_1 = require('./ViperProtocol');
const server_1 = require('./server');
class Log {
    static log(message, logLevel = ViperProtocol_1.LogLevel.Default) {
        if (Log.logLevel >= logLevel)
            server_1.Server.connection.sendNotification(ViperProtocol_1.Commands.Log, message);
    }
    static toLogFile(message, logLevel = ViperProtocol_1.LogLevel.Default) {
        if (Log.logLevel >= logLevel)
            server_1.Server.connection.sendNotification(ViperProtocol_1.Commands.ToLogFile, message);
    }
    static error(message, logLevel = ViperProtocol_1.LogLevel.Debug) {
        if (Log.logLevel >= logLevel)
            server_1.Server.connection.sendNotification(ViperProtocol_1.Commands.Error, message);
    }
    static logWithOrigin(origin, message, logLevel = ViperProtocol_1.LogLevel.Default) {
        if (Log.logLevel >= logLevel)
            server_1.Server.connection.sendNotification(ViperProtocol_1.Commands.Log, (logLevel >= ViperProtocol_1.LogLevel.Debug ? "[" + origin + "]: " : "") + message);
    }
    static hint(message) {
        server_1.Server.connection.sendNotification(ViperProtocol_1.Commands.Hint, message);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9Mb2cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBR2IsZ0NBQWlDLGlCQUFpQixDQUFDLENBQUE7QUFFbkQseUJBQXFCLFVBQVUsQ0FBQyxDQUFBO0FBRWhDO0lBR0ksT0FBTyxHQUFHLENBQUMsT0FBZSxFQUFFLFFBQVEsR0FBYSx3QkFBUSxDQUFDLE9BQU87UUFDN0QsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUM7WUFDekIsZUFBTSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNsRSxDQUFDO0lBRUQsT0FBTyxTQUFTLENBQUMsT0FBZSxFQUFFLFFBQVEsR0FBYSx3QkFBUSxDQUFDLE9BQU87UUFDbkUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUM7WUFDekIsZUFBTSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN4RSxDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUMsT0FBZSxFQUFFLFFBQVEsR0FBYSx3QkFBUSxDQUFDLEtBQUs7UUFDN0QsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUM7WUFDekIsZUFBTSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNwRSxDQUFDO0lBRUQsT0FBTyxhQUFhLENBQUMsTUFBYyxFQUFFLE9BQWUsRUFBRSxRQUFRLEdBQWEsd0JBQVEsQ0FBQyxPQUFPO1FBQ3ZGLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLElBQUksUUFBUSxDQUFDO1lBQ3pCLGVBQU0sQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLElBQUksd0JBQVEsQ0FBQyxLQUFLLEdBQUcsR0FBRyxHQUFDLE1BQU0sR0FBRyxLQUFLLEdBQUcsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLENBQUM7SUFDM0gsQ0FBQztJQUVELE9BQU8sSUFBSSxDQUFDLE9BQWU7UUFDdkIsZUFBTSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztJQUMvRCxDQUFDO0lBRUQsT0FBTyxTQUFTLENBQUMsT0FBbUMsRUFBQyxLQUFZO1FBQzdELE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDLElBQUk7WUFDM0IsR0FBRyxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLHdCQUFRLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDM0QsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJO1lBQzNCLEdBQUcsQ0FBQyxhQUFhLENBQUMsS0FBSyxHQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsd0JBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNwRSxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7QUFDTCxDQUFDO0FBbENVLFlBQVEsR0FBYSx3QkFBUSxDQUFDLE9BQU8sQ0FBQztBQURwQyxXQUFHLE1BbUNmLENBQUEifQ==