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
    static sendInvalidSettingsNotification(reason) {
        this.connection.sendNotification(ViperProtocol_1.Commands.InvalidSettings, reason);
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
}
Server.documents = new vscode_languageserver_1.TextDocuments();
Server.verificationTasks = new Map();
exports.Server = Server;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VydmVyQ2xhc3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NlcnZlckNsYXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQTtBQUVaLHdDQUFtRSx1QkFBdUIsQ0FBQyxDQUFBO0FBQzNGLGdDQUFvTSxpQkFDcE0sQ0FBQyxDQURvTjtBQUdyTixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFFMUI7SUFHSSxPQUFPLEtBQUs7UUFDUixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxJQUFJLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDeEQsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDL0QsQ0FBQztRQUNELElBQUk7WUFBQyxNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ3JCLENBQUM7SUFRRCxPQUFPLGlCQUFpQixDQUFDLEdBQVc7UUFDaEMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRUQsT0FBTyxRQUFRLENBQUMsSUFBc0IsRUFBRSxXQUFtQjtRQUN2RCxNQUFNLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyx3QkFBUSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsdUJBQXVCLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUNqRyxDQUFDO0lBRUQsa0VBQWtFO0lBQ2xFLE9BQU8sMkJBQTJCLENBQUMsTUFBeUI7UUFDeEQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLFdBQVcsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNuRSxDQUFDO0lBQ0QsT0FBTyw0QkFBNEIsQ0FBQyxNQUEwQjtRQUMxRCxJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3BFLENBQUM7SUFDRCxPQUFPLDZCQUE2QjtRQUNoQyxJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDN0QsQ0FBQztJQUNELE9BQU8sNkJBQTZCLENBQUMsSUFBWTtRQUM3QyxJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFDRCxPQUFPLCtCQUErQixDQUFDLE1BQWM7UUFDakQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLGVBQWUsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUN2RSxDQUFDO0lBQ0QsT0FBTyxlQUFlLENBQUMsTUFBZ0M7UUFDbkQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUNELE9BQU8sNEJBQTRCLENBQUMsV0FBMkM7UUFDM0UsU0FBRyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsR0FBRyxXQUFXLENBQUMsaUJBQWlCLENBQUMsTUFBTSxHQUFHLEdBQUcsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3hHLElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyx3QkFBd0IsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUNyRixDQUFDO0lBQ0QsT0FBTyxzQ0FBc0MsQ0FBQyxHQUFXO1FBQ3JELElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUMzRSxDQUFDO0lBQ0QsT0FBTyxTQUFTLENBQUMsR0FBVztRQUN4QixNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsd0JBQVEsQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUE7SUFDL0QsQ0FBQztJQUNELE9BQU8sU0FBUyxDQUFDLElBQVk7UUFDekIsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLHdCQUFRLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFBO0lBQ2hFLENBQUM7SUFDRCxPQUFPLDBCQUEwQixDQUFDLEdBQVc7UUFDekMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUMvRCxDQUFDO0lBQ0QsT0FBTywwQkFBMEIsQ0FBQyxHQUFXO1FBQ3pDLElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDL0QsQ0FBQztBQUNMLENBQUM7QUFwRFUsZ0JBQVMsR0FBa0IsSUFBSSxxQ0FBYSxFQUFFLENBQUM7QUFDL0Msd0JBQWlCLEdBQWtDLElBQUksR0FBRyxFQUFFLENBQUM7QUFYM0QsY0FBTSxTQThEbEIsQ0FBQSJ9