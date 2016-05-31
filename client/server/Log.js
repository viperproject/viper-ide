'use strict';
class Log {
    static log(message) {
        this.connection.console.log("S: " + message);
    }
    static error(message) {
        this.connection.console.error("S: " + message);
    }
    static logWithOrigin(origin, message) {
        this.connection.console.log(origin + ": " + message);
    }
}
exports.Log = Log;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9Mb2cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBSWI7SUFHSSxPQUFPLEdBQUcsQ0FBQyxPQUFlO1FBQ3RCLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDLENBQUM7SUFDakQsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDLE9BQWU7UUFDeEIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBRUQsT0FBTyxhQUFhLENBQUMsTUFBYyxFQUFFLE9BQWU7UUFDaEQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxJQUFJLEdBQUcsT0FBTyxDQUFDLENBQUM7SUFDekQsQ0FBQztBQUNMLENBQUM7QUFkWSxXQUFHLE1BY2YsQ0FBQSJ9