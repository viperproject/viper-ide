'use strict';
const vscode = require("vscode");
class Log {
    static log(message) {
        this.outputChannel.append(message + "\n");
        console.log(message);
    }
    static error(message) {
        this.outputChannel.append("ERROR: " + message + "\n");
        console.error(message);
    }
}
Log.outputChannel = vscode.window.createOutputChannel('ViperIVE');
exports.Log = Log;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0xvZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixNQUFZLE1BQU0sV0FBTSxRQUFRLENBQUMsQ0FBQTtBQUVqQztJQUlJLE9BQWMsR0FBRyxDQUFDLE9BQWM7UUFDNUIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxDQUFDO1FBQzFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDekIsQ0FBQztJQUVELE9BQWMsS0FBSyxDQUFDLE9BQWM7UUFDOUIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsU0FBUyxHQUFHLE9BQU8sR0FBRyxJQUFJLENBQUMsQ0FBQztRQUN0RCxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzNCLENBQUM7QUFDTCxDQUFDO0FBWFUsaUJBQWEsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBRjVELFdBQUcsTUFhZixDQUFBIn0=