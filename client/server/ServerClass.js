'use strict';
const vscode_languageserver_1 = require('vscode-languageserver');
const ViperProtocol_1 = require('./ViperProtocol');
const Log_1 = require('./Log');
const pathHelper = require('path');
const os = require('os');
class Server {
    static stage() {
        if (this.executedStages && this.executedStages.length > 0) {
            return this.executedStages[this.executedStages.length - 1];
        }
        else
            return null;
    }
    static isViperSourceFile(uri) {
        return uri.endsWith(".sil") || uri.endsWith(".vpr");
    }
    static showHeap(task, clientIndex, isHeapNeeded) {
        Server.connection.sendRequest(ViperProtocol_1.Commands.HeapGraph, task.getHeapGraphDescription(clientIndex, isHeapNeeded));
    }
    //Communication requests and notifications sent to language client
    static sendStateChangeNotification(params, task) {
        if (task) {
            task.state = params.newState;
        }
        this.connection.sendNotification(ViperProtocol_1.Commands.StateChange, params);
    }
    static sendBackendReadyNotification(params) {
        this.connection.sendNotification(ViperProtocol_1.Commands.BackendReady, params);
    }
    static sendStopDebuggingNotification() {
        this.connection.sendNotification(ViperProtocol_1.Commands.StopDebugging);
    }
    static sendBackendChangeNotification(name) {
        this.connection.sendNotification(ViperProtocol_1.Commands.BackendChange, name);
    }
    static sendSettingsCheckedNotification(errors) {
        this.connection.sendNotification(ViperProtocol_1.Commands.SettingsChecked, errors);
    }
    static sendDiagnostics(params) {
        this.connection.sendDiagnostics(params);
    }
    static sendStepsAsDecorationOptions(decorations) {
        Log_1.Log.log("Update the decoration options (" + decorations.decorationOptions.length + ")", ViperProtocol_1.LogLevel.Debug);
        this.connection.sendNotification(ViperProtocol_1.Commands.StepsAsDecorationOptions, decorations);
    }
    static sendVerificationNotStartedNotification(uri) {
        this.connection.sendNotification(ViperProtocol_1.Commands.VerificationNotStarted, uri);
    }
    static sendFileOpenedNotification(uri) {
        this.connection.sendNotification(ViperProtocol_1.Commands.FileOpened, uri);
    }
    static sendFileClosedNotification(uri) {
        this.connection.sendNotification(ViperProtocol_1.Commands.FileClosed, uri);
    }
    static sendLogMessage(command, params) {
        this.connection.sendNotification(command, params);
    }
    static containsNumber(s) {
        if (!s || s.length == 0)
            return false;
        let match = s.match("^.*?(\d).*$");
        return (match && match[1]) ? true : false;
    }
    //regex helper methods
    static extractNumber(s) {
        try {
            let match = /^.*?(\d+)([\.,](\d+))?.*$/.exec(s);
            if (match && match[1] && match[3]) {
                return Number.parseFloat(match[1] + "." + match[3]);
            }
            else if (match && match[1]) {
                return Number.parseInt(match[1]);
            }
            Log_1.Log.error(`Error extracting number from  "${s}"`);
            return 0;
        }
        catch (e) {
            Log_1.Log.error(`Error extracting number from  "${s}": ${e}`);
        }
    }
    static extractPosition(s) {
        let before = "";
        let after = "";
        if (!s)
            return { before: before, pos: null, after: after };
        let pos;
        try {
            if (s) {
                let regex = /^(.*?)(\(.*?@(\d+)\.(\d+)\)|(\d+):(\d+)|<.*>):?(.*)$/.exec(s);
                if (regex && regex[3] && regex[4]) {
                    //subtract 1 to confirm with VS Codes 0-based numbering
                    let lineNr = Math.max(0, +regex[3] - 1);
                    let charNr = Math.max(0, +regex[4] - 1);
                    pos = { line: lineNr, character: charNr };
                }
                else if (regex && regex[5] && regex[6]) {
                    //subtract 1 to confirm with VS Codes 0-based numbering
                    let lineNr = Math.max(0, +regex[5] - 1);
                    let charNr = Math.max(0, +regex[6] - 1);
                    pos = { line: lineNr, character: charNr };
                }
                if (regex && regex[1]) {
                    before = regex[1].trim();
                }
                if (regex && regex[7]) {
                    after = regex[7].trim();
                }
            }
        }
        catch (e) {
            Log_1.Log.error("Error extracting number out of: " + s);
        }
        return { before: before, pos: pos, after: after };
    }
    static extractRange(startString, endString) {
        let start = Server.extractPosition(startString).pos;
        let end = Server.extractPosition(endString).pos;
        //handle uncomplete positions
        if (!end && start) {
            end = start;
        }
        else if (!start && end) {
            start = end;
        }
        else if (!start && !end) {
            start = { line: 0, character: 0 };
            end = start;
        }
        return { start: start, end: end };
    }
}
Server.tempDirectory = pathHelper.join(os.tmpDir(), ".vscode");
Server.backendOutputDirectory = os.tmpDir();
Server.documents = new vscode_languageserver_1.TextDocuments();
Server.verificationTasks = new Map();
exports.Server = Server;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VydmVyQ2xhc3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NlcnZlckNsYXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQTtBQUVaLHdDQUFtRSx1QkFBdUIsQ0FBQyxDQUFBO0FBQzNGLGdDQUE2SyxpQkFDN0ssQ0FBQyxDQUQ2TDtBQUc5TCxzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsTUFBWSxVQUFVLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFDbkMsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBRXpCO0lBS0ksT0FBTyxLQUFLO1FBQ1IsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsSUFBSSxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hELE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQy9ELENBQUM7UUFDRCxJQUFJO1lBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNyQixDQUFDO0lBT0QsT0FBTyxpQkFBaUIsQ0FBQyxHQUFXO1FBQ2hDLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEdBQUcsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUVELE9BQU8sUUFBUSxDQUFDLElBQXNCLEVBQUUsV0FBbUIsRUFBRSxZQUFxQjtRQUM5RSxNQUFNLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyx3QkFBUSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsdUJBQXVCLENBQUMsV0FBVyxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUM7SUFDL0csQ0FBQztJQUVELGtFQUFrRTtJQUNsRSxPQUFPLDJCQUEyQixDQUFDLE1BQXlCLEVBQUUsSUFBdUI7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