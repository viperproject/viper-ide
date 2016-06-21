'use strict';
const ViperProtocol_1 = require('./ViperProtocol');
class Log {
    static log(message) {
        this.connection.sendNotification(ViperProtocol_1.Commands.Log, message);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9Mb2cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBR2IsZ0NBQXVCLGlCQUFpQixDQUFDLENBQUE7QUFFekM7SUFHSSxPQUFPLEdBQUcsQ0FBQyxPQUFlO1FBQ3RCLElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxHQUFHLEVBQUMsT0FBTyxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDLE9BQWU7UUFDeEIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLEtBQUssRUFBQyxPQUFPLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBRUQsT0FBTyxhQUFhLENBQUMsTUFBYyxFQUFFLE9BQWU7UUFDaEQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLEdBQUcsRUFBQyxNQUFNLEdBQUcsSUFBSSxHQUFHLE9BQU8sQ0FBQyxDQUFDO0lBQzNFLENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQyxPQUFlO1FBQ3ZCLElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDN0QsQ0FBQztBQUNMLENBQUM7QUFsQlksV0FBRyxNQWtCZixDQUFBIn0=