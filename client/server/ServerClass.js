'use strict';
const vscode_languageserver_1 = require('vscode-languageserver');
const ViperProtocol_1 = require('./ViperProtocol');
const Log_1 = require('./Log');
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
    static showHeap(task, clientIndex) {
        Server.connection.sendRequest(ViperProtocol_1.Commands.HeapGraph, task.getHeapGraphDescription(clientIndex));
    }
    //Communication requests and notifications sent to language client
    static sendStateChangeNotification(params) {
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
    static sendInvalidSettingsNotification(errors) {
        this.connection.sendNotification(ViperProtocol_1.Commands.InvalidSettings, errors);
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
    static uriToPath(uri) {
        return this.connection.sendRequest(ViperProtocol_1.Commands.UriToPath, uri);
    }
    static pathToUri(path) {
        return this.connection.sendRequest(ViperProtocol_1.Commands.PathToUri, path);
    }
    static sendFileOpenedNotification(uri) {
        this.connection.sendNotification(ViperProtocol_1.Commands.FileOpened, uri);
    }
    static sendFileClosedNotification(uri) {
        this.connection.sendNotification(ViperProtocol_1.Commands.FileClosed, uri);
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
Server.documents = new vscode_languageserver_1.TextDocuments();
Server.verificationTasks = new Map();
exports.Server = Server;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VydmVyQ2xhc3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NlcnZlckNsYXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQTtBQUVaLHdDQUFtRSx1QkFBdUIsQ0FBQyxDQUFBO0FBQzNGLGdDQUE2TixpQkFDN04sQ0FBQyxDQUQ2TztBQUc5TyxzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFFMUI7SUFHSSxPQUFPLEtBQUs7UUFDUixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxJQUFJLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDeEQsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDL0QsQ0FBQztRQUNELElBQUk7WUFBQyxNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ3JCLENBQUM7SUFRRCxPQUFPLGlCQUFpQixDQUFDLEdBQVc7UUFDaEMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRUQsT0FBTyxRQUFRLENBQUMsSUFBc0IsRUFBRSxXQUFtQjtRQUN2RCxNQUFNLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyx3QkFBUSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsdUJBQXVCLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUNqRyxDQUFDO0lBRUQsa0VBQWtFO0lBQ2xFLE9BQU8sMkJBQTJCLENBQUMsTUFBeUI7UUFDeEQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLFdBQVcsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNuRSxDQUFDO0lBQ0QsT0FBTyw0QkFBNEIsQ0FBQyxNQUEwQjtR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