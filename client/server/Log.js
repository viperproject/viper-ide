'use strict';
const ViperProtocol_1 = require('./ViperProtocol');
const ServerClass_1 = require('./ServerClass');
class Log {
    static log(message, logLevel = ViperProtocol_1.LogLevel.Default) {
        ServerClass_1.Server.sendLogMessage(ViperProtocol_1.Commands.Log, { data: message, logLevel: logLevel });
    }
    static toLogFile(message, logLevel = ViperProtocol_1.LogLevel.Default) {
        ServerClass_1.Server.sendLogMessage(ViperProtocol_1.Commands.ToLogFile, { data: message, logLevel: logLevel });
    }
    static error(message, logLevel = ViperProtocol_1.LogLevel.Debug) {
        ServerClass_1.Server.sendLogMessage(ViperProtocol_1.Commands.Error, { data: message, logLevel: logLevel });
    }
    static logWithOrigin(origin, message, logLevel = ViperProtocol_1.LogLevel.Default) {
        ServerClass_1.Server.sendLogMessage(ViperProtocol_1.Commands.Log, { data: (logLevel >= ViperProtocol_1.LogLevel.Debug ? "[" + origin + "]: " : "") + message, logLevel: logLevel });
    }
    static hint(message) {
        ServerClass_1.Server.connection.sendNotification(ViperProtocol_1.Commands.Hint, message);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9Mb2cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBRWIsZ0NBQTJDLGlCQUFpQixDQUFDLENBQUE7QUFFN0QsOEJBQXFCLGVBQWUsQ0FBQyxDQUFBO0FBRXJDO0lBR0ksT0FBTyxHQUFHLENBQUMsT0FBZSxFQUFFLFFBQVEsR0FBYSx3QkFBUSxDQUFDLE9BQU87UUFDN0Qsb0JBQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQy9FLENBQUM7SUFFRCxPQUFPLFNBQVMsQ0FBQyxPQUFlLEVBQUUsUUFBUSxHQUFhLHdCQUFRLENBQUMsT0FBTztRQUNuRSxvQkFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLFNBQVMsRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDckYsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDLE9BQWUsRUFBRSxRQUFRLEdBQWEsd0JBQVEsQ0FBQyxLQUFLO1FBQzlELG9CQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUNoRixDQUFDO0lBRUQsT0FBTyxhQUFhLENBQUMsTUFBYyxFQUFFLE9BQWUsRUFBRSxRQUFRLEdBQWEsd0JBQVEsQ0FBQyxPQUFPO1FBQ3ZGLG9CQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsUUFBUSxJQUFJLHdCQUFRLENBQUMsS0FBSyxHQUFHLEdBQUcsR0FBRyxNQUFNLEdBQUcsS0FBSyxHQUFHLEVBQUUsQ0FBQyxHQUFHLE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUMxSSxDQUFDO0lBRUQsT0FBTyxJQUFJLENBQUMsT0FBZTtRQUN2QixvQkFBTSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztJQUMvRCxDQUFDO0lBRUQsT0FBTyxTQUFTLENBQUMsT0FBbUMsRUFBRSxLQUFhO1FBQy9ELE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDLElBQUk7WUFDM0IsR0FBRyxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLHdCQUFRLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDM0QsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJO1lBQzNCLEdBQUcsQ0FBQyxhQUFhLENBQUMsS0FBSyxHQUFHLFFBQVEsRUFBRSxJQUFJLEVBQUUsd0JBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUN0RSxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7QUFDTCxDQUFDO0FBOUJVLFlBQVEsR0FBYSx3QkFBUSxDQUFDLE9BQU8sQ0FBQztBQURwQyxXQUFHLE1BK0JmLENBQUEifQ==