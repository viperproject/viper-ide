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
        let task = Server.verificationTasks.get(params.uri);
        if (!task) {
            Log_1.Log.error("No verificationTask found for " + params.uri);
            return;
        }
        Server.showHeap(task, params.index);
        //DebugServer.goToState(Server.debuggedVerificationTask.steps[params.index].position, params.index);
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
    Log_1.Log.log("start or restart verification of " + uri);
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