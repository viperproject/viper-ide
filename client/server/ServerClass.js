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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VydmVyQ2xhc3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NlcnZlckNsYXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQTtBQUVaLHdDQUFtRSx1QkFBdUIsQ0FBQyxDQUFBO0FBQzNGLGdDQUE2TixpQkFDN04sQ0FBQyxDQUQ2TztBQUc5TyxzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFFMUI7SUFHSSxPQUFPLEtBQUs7UUFDUixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxJQUFJLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDeEQsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDL0QsQ0FBQztRQUNELElBQUk7WUFBQyxNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ3JCLENBQUM7SUFRRCxPQUFPLGlCQUFpQixDQUFDLEdBQVc7UUFDaEMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRUQsT0FBTyxRQUFRLENBQUMsSUFBc0IsRUFBRSxXQUFtQjtRQUN2RCxNQUFNLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyx3QkFBUSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsdUJBQXVCLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUNqRyxDQUFDO0lBRUQsa0VBQWtFO0lBQ2xFLE9BQU8sMkJBQTJCLENBQUMsTUFBeUIsRUFBRSxJQUF1QjtRQUNqRixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ1AsSUFBSSxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDO1FBQ2pDLENBQUM7UUFDRCxJ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