'use strict';
const vscode_languageserver_1 = require('vscode-languageserver');
const Log_1 = require('./Log');
const Settings_1 = require('./Settings');
const ViperProtocol_1 = require('./ViperProtocol');
const NailgunService_1 = require('./NailgunService');
const VerificationTask_1 = require('./VerificationTask');
const DebugServer_1 = require('./DebugServer');
var ipc = require('node-ipc');
class Server {
    static isViperSourceFile(uri) {
        return uri.endsWith(".sil") || uri.endsWith(".vpr");
    }
    static showHeap(task, index) {
        Server.connection.sendRequest(ViperProtocol_1.Commands.HeapGraph, task.getHeapGraphDescription(index));
    }
}
Server.documents = new vscode_languageserver_1.TextDocuments();
Server.verificationTasks = new Map();
exports.Server = Server;
// Create a connection for the server. The connection uses Node's IPC as a transport
Server.connection = vscode_languageserver_1.createConnection(new vscode_languageserver_1.IPCMessageReader(process), new vscode_languageserver_1.IPCMessageWriter(process));
Server.documents.listen(Server.connection);
registerHandlers();
function registerHandlers() {
    //starting point (executed once)
    Server.connection.onInitialize((params) => {
        DebugServer_1.DebugServer.initialize();
        Server.workspaceRoot = params.rootPath;
        Server.nailgunService = new NailgunService_1.NailgunService();
        return {
            capabilities: {
                // Tell the client that the server works in FULL text document sync mode
                textDocumentSync: Server.documents.syncKind,
                // Tell the client that the server support code complete
                completionProvider: {
                    resolveProvider: true
                }
            }
        };
    });
    Server.connection.onExit(() => {
        Log_1.Log.log("On Exit", ViperProtocol_1.LogLevel.Debug);
    });
    Server.connection.onShutdown(() => {
        Log_1.Log.log("On Shutdown", ViperProtocol_1.LogLevel.Debug);
        Server.nailgunService.stopNailgunServer();
    });
    Server.connection.onDidChangeConfiguration((change) => {
        try {
            Server.settings = change.settings.viperSettings;
            //after this line, Logging works
            Log_1.Log.logLevel = Server.settings.logLevel;
            Log_1.Log.log('configuration changed', ViperProtocol_1.LogLevel.Info);
            //check settings
            let error = Settings_1.Settings.checkSettings(Server.settings);
            if (error) {
                Server.connection.sendNotification(ViperProtocol_1.Commands.InvalidSettings, error);
                return;
            }
            else {
                Log_1.Log.log("The settings are ok", ViperProtocol_1.LogLevel.Info);
            }
            //pass the new settings to the verificationService and the Log
            Server.nailgunService.changeSettings(Server.settings);
            //stop all running verifications
            Log_1.Log.log("Stop all running verificationTasks", ViperProtocol_1.LogLevel.Debug);
            Server.verificationTasks.forEach(task => { task.abortVerification(); });
            Server.backend = Settings_1.Settings.autoselectBackend(Server.settings);
            Server.nailgunService.restartNailgunServer(Server.connection, Server.backend);
        }
        catch (e) {
            Log_1.Log.error("Error handling configuration change: " + e);
        }
    });
    Server.connection.onRequest(ViperProtocol_1.Commands.SelectBackend, (selectedBackend) => {
        if (!Server.settings.valid) {
            Server.connection.sendNotification(ViperProtocol_1.Commands.InvalidSettings, "Cannot start backend, fix settings first.");
            return;
        }
        if (selectedBackend) {
            Settings_1.Settings.selectedBackend = selectedBackend;
        }
        Log_1.Log.log("Stop all running verificationTasks", ViperProtocol_1.LogLevel.Debug);
        Server.verificationTasks.forEach(task => { task.abortVerification(); });
        Server.backend = Settings_1.Settings.autoselectBackend(Server.settings);
        Server.nailgunService.restartNailgunServer(Server.connection, Server.backend);
    });
    Server.connection.onRequest(ViperProtocol_1.Commands.RequestBackendSelection, (args) => {
        let backendNames = Settings_1.Settings.getBackendNames(Server.settings);
        if (backendNames.length > 1) {
            Server.connection.sendRequest(ViperProtocol_1.Commands.AskUserToSelectBackend, backendNames);
        }
        else {
            Log_1.Log.hint("There are less than two backends, selecting does not make sense.");
        }
    });
    Server.connection.onDidChangeWatchedFiles((change) => {
        Log_1.Log.log("We recevied a file change event", ViperProtocol_1.LogLevel.Debug);
    });
    Server.connection.onDidOpenTextDocument((params) => {
        if (Server.isViperSourceFile(params.textDocument.uri)) {
            let uri = params.textDocument.uri;
            if (!Server.verificationTasks.has(uri)) {
                //create new task for opened file
                let task = new VerificationTask_1.VerificationTask(uri, Server.nailgunService, Server.connection);
                Server.verificationTasks.set(uri, task);
                Log_1.Log.log(`${uri} opened, task created`, ViperProtocol_1.LogLevel.Debug);
                if (Server.nailgunService.ready) {
                    Log_1.Log.log("Opened Text Document", ViperProtocol_1.LogLevel.Debug);
                    startOrRestartVerification(uri, false, false);
                }
            }
        }
    });
    Server.connection.onDidCloseTextDocument((params) => {
        if (Server.isViperSourceFile(params.textDocument.uri)) {
            let uri = params.textDocument.uri;
            if (Server.verificationTasks.has(uri)) {
                //remove no longer needed task
                Server.verificationTasks.delete(uri);
                Log_1.Log.log(`${params.textDocument.uri} closed, task deleted`, ViperProtocol_1.LogLevel.Debug);
            }
        }
    });
    Server.connection.onRequest(ViperProtocol_1.Commands.Verify, (data) => {
        if (Server.isViperSourceFile(data.uri)) {
            let alreadyRunning = false;
            if (data.manuallyTriggered) {
                //it does not make sense to reverify if no changes were made and the verification is already running
                Server.verificationTasks.forEach(task => {
                    if (task.running && task.fileUri === data.uri) {
                        alreadyRunning = true;
                    }
                });
            }
            if (!alreadyRunning) {
                Settings_1.Settings.workspace = data.workspace;
                startOrRestartVerification(data.uri, false, data.manuallyTriggered);
            }
        }
        else if (data.manuallyTriggered) {
            Log_1.Log.hint("This system can only verify .sil and .vpr files");
        }
    });
    Server.connection.onRequest(ViperProtocol_1.Commands.Dispose, (lineNumber) => {
        Server.nailgunService.stopNailgunServer();
        Server.nailgunService.killNgDeamon();
        return null;
    });
    Server.connection.onRequest(ViperProtocol_1.Commands.StopVerification, (uri) => {
        let task = Server.verificationTasks.get(uri);
        task.abortVerification();
        Server.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.Ready, firstTime: true, verificationNeeded: false });
    });
    Server.connection.onRequest(ViperProtocol_1.Commands.ShowHeap, (params) => {
        try {
            let task = Server.verificationTasks.get(params.uri);
            if (!task) {
                Log_1.Log.error("No verificationTask found for " + params.uri);
                return;
            }
            Server.showHeap(task, params.index);
        }
        catch (e) {
            Log_1.Log.error("Error showing heap: " + e);
        }
    });
    // Server.documents.onDidChangeContent((change) => {Log.error("TODO: never happened before: Content Change detected")});
    // Server.connection.onDidChangeTextDocument((params) => {});
    // Server.connection.onDidSaveTextDocument((params) => {})
    // Listen on the connection
    Server.connection.listen();
}
function resetDiagnostics(uri) {
    let task = Server.verificationTasks.get(uri);
    if (!task) {
        Log_1.Log.error("no verification Task for file: " + uri);
        return;
    }
    task.resetDiagnostics();
}
function startOrRestartVerification(uri, onlyTypeCheck, manuallyTriggered) {
    Log_1.Log.log("start or restart verification of " + uri, ViperProtocol_1.LogLevel.Info);
    //only verify if the settings are right
    if (!Server.settings.valid) {
        Server.connection.sendNotification(ViperProtocol_1.Commands.InvalidSettings, "Cannot verify, fix the settings first.");
        return;
    }
    //only verify viper source code files
    if (!Server.isViperSourceFile(uri)) {
        Log_1.Log.hint("Only viper source files can be verified.");
        return;
    }
    //only verify if the settings are right
    if (!Server.backend) {
        Log_1.Log.log("no backend has beed selected, the first was picked by default.", ViperProtocol_1.LogLevel.Debug);
        Server.backend = Server.settings.verificationBackends[0];
        Server.nailgunService.startNailgunIfNotRunning(Server.connection, Server.backend);
    }
    if (!Server.nailgunService.ready) {
        Log_1.Log.hint("The verification backend is not ready yet");
        return;
    }
    //check if there is already a verification task for that file
    let task = Server.verificationTasks.get(uri);
    if (!task) {
        Log_1.Log.error("No verification task found for file: " + uri);
        return;
    }
    //stop all other verifications because the backend crashes if multiple verifications are run in parallel
    Server.verificationTasks.forEach(task => { task.abortVerification(); });
    //start verification
    task.verify(onlyTypeCheck, manuallyTriggered);
}
/*
// This handler provides the initial list of the completion items.
Server.connection.onCompletion((textPositionParams): CompletionItem[] => {
    // The pass parameter contains the position of the text document in
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.
    var res = [];
    let completionItem: CompletionItem = {
        label: 'invariant',
        kind: CompletionItemKind.Text,
        data: 1
    };
    res.push(completionItem);
    return res;
});
// This handler resolve additional information for the item selected in
// the completion list.
Server.connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    //Log.log('onCompletionResolve');
    if (item.data === 1) {
        item.detail = 'add an invariant',
            item.documentation = 'The invariant needs to hold before and after the loop body'
    }
    return item;
});
*/
/*
function readZ3LogFile(path: string): LogEntry[] {
    let res: LogEntry[] = new Array<LogEntry>();
    if (!fs.existsSync(path)) {
        Log.error("cannot find log file at: " + path);
        return;
    }
    let content = fs.readFileSync(path, "utf8").split(/\n(?!\s)/g);

    for (var i = 0; i < content.length; i++) {
        var line = content[i].replace("\n", "").trim();

        if (line == '') {
            continue;
        }
        let prefix = ';';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry(LogType.Comment, line.substring(prefix.length)));
            continue;
        }
        prefix = '(push)';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry(LogType.Push, line.substring(prefix.length)));
            continue;
        }
        prefix = '(pop)';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry(LogType.Pop, line.substring(prefix.length)));
            continue;
        }
        prefix = '(set-option';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry(LogType.SetOption, line));
            continue;
        }
        prefix = '(declare-const';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry(LogType.DeclareConst, line));
            continue;
        }
        prefix = '(declare-fun';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry(LogType.DeclareFun, line));
            continue;
        }
        prefix = '(declare-datatypes';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry(LogType.DeclareDatatypes, line));
            continue;
        }
        prefix = '(declare-sort';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry(LogType.DeclareSort, line));
            continue;
        }
        prefix = '(define-const';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry(LogType.DefineConst, line));
            continue;
        }
        prefix = '(define-fun';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry(LogType.DefineFun, line));
            continue;
        }
        prefix = '(define-datatypes';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry(LogType.DefineDatatypes, line));
            continue;
        }
        prefix = '(define-sort';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry(LogType.DefineSort, line));
            continue;
        }
        prefix = '(assert';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry(LogType.Assert, line));
            continue;
        }
        prefix = '(check-sat)';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry(LogType.CheckSat, line.substring(prefix.length)));
            continue;
        }
        prefix = '(get-info';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry(LogType.GetInfo, line));
            continue;
        }
        Log.error("unknown log-entry-type detected: " + line);
    }
    return res;
}
*/ 
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBTWIsd0NBT08sdUJBQXVCLENBQUMsQ0FBQTtBQUcvQixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsMkJBQXVCLFlBQ3ZCLENBQUMsQ0FEa0M7QUFDbkMsZ0NBQTJHLGlCQUMzRyxDQUFDLENBRDJIO0FBQzVILGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELG1DQUErQixvQkFBb0IsQ0FBQyxDQUFBO0FBR3BELDhCQUEwQixlQUFlLENBQUMsQ0FBQTtBQUMxQyxJQUFJLEdBQUcsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7QUFFOUI7SUFVSSxPQUFPLGlCQUFpQixDQUFDLEdBQVc7UUFDaEMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRUQsT0FBTyxRQUFRLENBQUMsSUFBc0IsRUFBRSxLQUFhO1FBQ2pELE1BQU0sQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLHdCQUFRLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQzNGLENBQUM7QUFDTCxDQUFDO0FBYlUsZ0JBQVMsR0FBa0IsSUFBSSxxQ0FBYSxFQUFFLENBQUM7QUFDL0Msd0JBQWlCLEdBQWtDLElBQUksR0FBRyxFQUFFLENBQUM7QUFMM0QsY0FBTSxTQWlCbEIsQ0FBQTtBQUVELG9GQUFvRjtBQUNwRixNQUFNLENBQUMsVUFBVSxHQUFHLHdDQUFnQixDQUFDLElBQUksd0NBQWdCLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSx3Q0FBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBQ25HLE1BQU0sQ0FBQyxT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