'use strict';
const ViperProtocol_1 = require('./ViperProtocol');
class Log {
    static log(message) {
        this.connection.sendNotification(ViperProtocol_1.Commands.Log, message);
    }
    static toLogFile(message) {
        this.connection.sendNotification(ViperProtocol_1.Commands.ToLogFile, message);
    }
    static error(message) {
        this.connection.sendNotification(ViperProtocol_1.Commands.Error, message);
    }
    static logWithOrigin(origin, message) {
        this.connection.sendNotification(ViperProtocol_1.Commands.Log, origin + ": " + message);
    }
    static hint(message) {
        this.connection.sendNotification(ViperProtocol_1.Commands.Hint, message);
    }
}
exports.Log = Log;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9Mb2cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBR2IsZ0NBQXVCLGlCQUFpQixDQUFDLENBQUE7QUFFekM7SUFHSSxPQUFPLEdBQUcsQ0FBQyxPQUFlO1FBQ3RCLElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxHQUFHLEVBQUMsT0FBTyxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUVELE9BQU8sU0FBUyxDQUFDLE9BQWU7UUFDNUIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLFNBQVMsRUFBQyxPQUFPLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUMsT0FBZTtRQUN4QixJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsS0FBSyxFQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzdELENBQUM7SUFFRCxPQUFPLGFBQWEsQ0FBQyxNQUFjLEVBQUUsT0FBZTtRQUNoRCxJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsR0FBRyxFQUFDLE1BQU0sR0FBRyxJQUFJLEdBQUcsT0FBTyxDQUFDLENBQUM7SUFDM0UsQ0FBQztJQUVELE9BQU8sSUFBSSxDQUFDLE9BQWU7UUFDdkIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztJQUM3RCxDQUFDO0FBQ0wsQ0FBQztBQXRCWSxXQUFHLE1Bc0JmLENBQUEifQ==