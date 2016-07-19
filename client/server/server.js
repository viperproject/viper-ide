'use strict';
const vscode_languageserver_1 = require('vscode-languageserver');
const Log_1 = require('./Log');
const Settings_1 = require('./Settings');
const ViperProtocol_1 = require('./ViperProtocol');
const NailgunService_1 = require('./NailgunService');
const VerificationTask_1 = require('./VerificationTask');
const Statement_1 = require('./Statement');
var ipc = require('node-ipc');
// Create a connection for the server. The connection uses Node's IPC as a transport
let connection = vscode_languageserver_1.createConnection(new vscode_languageserver_1.IPCMessageReader(process), new vscode_languageserver_1.IPCMessageWriter(process));
//let connection: IConnection = createConnection(process.stdin, process.stdout);
let backend;
let documents = new vscode_languageserver_1.TextDocuments();
let verificationTasks = new Map();
let nailgunService;
let settings;
let workspaceRoot;
let debuggedVerificationTask;
//for communication with debugger
startIPCServer();
documents.listen(connection);
//starting point (executed once)
connection.onInitialize((params) => {
    Log_1.Log.connection = connection;
    workspaceRoot = params.rootPath;
    nailgunService = new NailgunService_1.NailgunService();
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: documents.syncKind,
            // Tell the client that the server support code complete
            completionProvider: {
                resolveProvider: true
            }
        }
    };
});
// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
    Log_1.Log.error("TODO: never happened before: Content Change detected");
});
connection.onExit(() => {
    Log_1.Log.log("On Exit", ViperProtocol_1.LogLevel.Debug);
    //nailgunService.stopNailgunServer();
});
connection.onShutdown(() => {
    Log_1.Log.log("On Shutdown", ViperProtocol_1.LogLevel.Debug);
    nailgunService.stopNailgunServer();
});
// The settings have changed. Is sent on server activation as well.
connection.onDidChangeConfiguration((change) => {
    settings = change.settings.viperSettings;
    //after this line, Logging works
    Log_1.Log.logLevel = settings.logLevel;
    Log_1.Log.log('configuration changed', ViperProtocol_1.LogLevel.Info);
    //check settings
    let error = Settings_1.Settings.checkSettings(settings);
    if (error) {
        connection.sendNotification(ViperProtocol_1.Commands.InvalidSettings, error);
        return;
    }
    Log_1.Log.log("The settings are ok", ViperProtocol_1.LogLevel.Info);
    //pass the new settings to the verificationService and the Log
    nailgunService.changeSettings(settings);
    //stop all running verifications
    Log_1.Log.log("Stop all running verificationTasks", ViperProtocol_1.LogLevel.Debug);
    verificationTasks.forEach(task => { task.abortVerification(); });
    backend = Settings_1.Settings.autoselectBackend(settings);
    nailgunService.restartNailgunServer(connection, backend);
    // let backendNames = Settings.getBackendNames(settings);
    // if (backendNames.length > 0) {
    //     Log.log("Ask user to select backend", LogLevel.Info);
    //     connection.sendRequest(Commands.AskUserToSelectBackend, backendNames);
    // } else {
    //     Log.error("No backend, even though the setting check succeeded?");
    // }
    //Log.log("Test Graphviz Package");
    //Statement.buildGraphVizExampleGraph()
});
connection.onRequest(ViperProtocol_1.Commands.SelectBackend, (selectedBackend) => {
    if (!settings.valid) {
        connection.sendNotification(ViperProtocol_1.Commands.InvalidSettings, "Cannot start backend, fix settings first.");
        return;
    }
    if (selectedBackend) {
        Settings_1.Settings.selectedBackend = selectedBackend;
    }
    Log_1.Log.log("Stop all running verificationTasks", ViperProtocol_1.LogLevel.Debug);
    verificationTasks.forEach(task => { task.abortVerification(); });
    backend = Settings_1.Settings.autoselectBackend(settings);
    nailgunService.restartNailgunServer(connection, backend);
});
connection.onRequest(ViperProtocol_1.Commands.RequestBackendSelection, (args) => {
    let backendNames = Settings_1.Settings.getBackendNames(settings);
    if (backendNames.length > 1) {
        connection.sendRequest(ViperProtocol_1.Commands.AskUserToSelectBackend, backendNames);
    }
    else {
        Log_1.Log.hint("There are less than two backends, selecting does not make sense.");
    }
});
connection.onDidChangeWatchedFiles((change) => {
    Log_1.Log.log("We recevied a file change event", ViperProtocol_1.LogLevel.Debug);
});
connection.onDidOpenTextDocument((params) => {
    if (isViperSourceFile(params.textDocument.uri)) {
        let uri = params.textDocument.uri;
        if (!verificationTasks.has(uri)) {
            //create new task for opened file
            let task = new VerificationTask_1.VerificationTask(uri, nailgunService, connection, backend);
            verificationTasks.set(uri, task);
            Log_1.Log.log(`${uri} opened, task created`, ViperProtocol_1.LogLevel.Debug);
            if (nailgunService.ready) {
                Log_1.Log.log("Opened Text Document", ViperProtocol_1.LogLevel.Debug);
                startOrRestartVerification(uri, false, false);
            }
        }
    }
});
connection.onDidCloseTextDocument((params) => {
    if (isViperSourceFile(params.textDocument.uri)) {
        let uri = params.textDocument.uri;
        if (verificationTasks.has(uri)) {
            //remove no longer needed task
            verificationTasks.delete(uri);
            Log_1.Log.log(`${params.textDocument.uri} closed, task deleted`, ViperProtocol_1.LogLevel.Debug);
        }
    }
});
connection.onDidChangeTextDocument((params) => {
    // //reset the diagnostics for the changed file
    // if (isViperSourceFile(params.textDocument.uri)) {
    //     resetDiagnostics(params.textDocument.uri);
    // }
});
connection.onDidSaveTextDocument((params) => {
    //handled in client
});
connection.onRequest(ViperProtocol_1.Commands.Verify, (data) => {
    if (isViperSourceFile(data.uri)) {
        let alreadyRunning = false;
        if (data.manuallyTriggered) {
            //it does not make sense to reverify if no changes were made and the verification is already running
            verificationTasks.forEach(task => {
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
connection.onRequest({ method: 'variablesInLine' }, (lineNumber) => {
    let variables = [];
    this.steps.forEach(element => {
        if (element.position.line === lineNumber) {
            element.store.forEach(variable => {
                variables.push({
                    name: variable,
                    value: variable,
                    variablesReference: 0
                });
            });
        }
    });
});
connection.onRequest(ViperProtocol_1.Commands.Dispose, (lineNumber) => {
    nailgunService.stopNailgunServer();
    nailgunService.killNgDeamon();
    return null;
});
connection.onRequest(ViperProtocol_1.Commands.StopVerification, (uri) => {
    let task = verificationTasks.get(uri);
    task.abortVerification();
    connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.Ready, firstTime: true, verificationNeeded: false });
});
connection.onRequest(ViperProtocol_1.Commands.ShowHeap, (params) => {
    let task = verificationTasks.get(params.uri);
    if (!task) {
        Log_1.Log.error("No verificationTask found for " + params.uri);
        return;
    }
    connection.sendRequest(ViperProtocol_1.Commands.HeapGraph, task.getHeapGraphDescription(params.index));
});
// Listen on the connection
connection.listen();
function resetDiagnostics(uri) {
    let task = verificationTasks.get(uri);
    if (!task) {
        Log_1.Log.error("no verification Task for file: " + uri);
        return;
    }
    task.resetDiagnostics();
}
function startOrRestartVerification(uri, onlyTypeCheck, manuallyTriggered) {
    Log_1.Log.log("start or restart verification of " + uri);
    //only verify if the settings are right
    if (!settings.valid) {
        connection.sendNotification(ViperProtocol_1.Commands.InvalidSettings, "Cannot verify, fix the settings first.");
        return;
    }
    //only verify viper source code files
    if (!isViperSourceFile(uri)) {
        Log_1.Log.hint("Only viper source files can be verified.");
        return;
    }
    //only verify if the settings are right
    if (!backend) {
        Log_1.Log.log("no backend has beed selected, the first was picked by default.", ViperProtocol_1.LogLevel.Debug);
        backend = settings.verificationBackends[0];
        nailgunService.startNailgunIfNotRunning(connection, backend);
    }
    if (!nailgunService.ready) {
        Log_1.Log.hint("The verification backend is not ready yet");
        return;
    }
    //check if there is already a verification task for that file
    let task = verificationTasks.get(uri);
    if (!task) {
        Log_1.Log.error("No verification task found for file: " + uri);
        return;
    }
    //stop all other verifications because the backend crashes if multiple verifications are run in parallel
    verificationTasks.forEach(task => { task.abortVerification(); });
    //start verification
    task.verify(backend, onlyTypeCheck, manuallyTriggered);
}
function isViperSourceFile(uri) {
    return uri.endsWith(".sil") || uri.endsWith(".vpr");
}
//communication with debugger
function startIPCServer() {
    ipc.config.id = 'viper';
    ipc.config.retry = 1500;
    ipc.serve(function () {
        ipc.server.on('log', function (data, socket) {
            Log_1.Log.log("Debugger: " + data, ViperProtocol_1.LogLevel.LowLevelDebug);
        });
        ipc.server.on('launchRequest', function (data, socket) {
            Log_1.Log.log('Debugging was requested for file: ' + data, ViperProtocol_1.LogLevel.Debug);
            VerificationTask_1.VerificationTask.pathToUri(data).then((uri) => {
                debuggedVerificationTask = verificationTasks.get(uri);
                let response = "true";
                if (!debuggedVerificationTask) {
                    //TODO: use better criterion to detect a missing verification
                    Log_1.Log.hint("Cannot debug file, you must first verify the file: " + uri);
                    response = "false";
                }
                ipc.server.emit(socket, 'launchResponse', response);
            });
        });
        ipc.server.on('variablesInLineRequest', function (data, socket) {
            Log_1.Log.log('got a variables request for line ' + data, ViperProtocol_1.LogLevel.Debug);
            let lineNumber;
            try {
                lineNumber = data - 0;
            }
            catch (error) {
                Log_1.Log.error("Wrong format");
            }
            let variables = [];
            if (debuggedVerificationTask) {
                let steps = debuggedVerificationTask.getStepsOnLine(lineNumber);
                if (steps.length > 0) {
                    steps[0].store.forEach((variable) => {
                        variables.push(variable);
                    });
                }
            }
            else {
                Log_1.Log.error("no debuggedVerificationTask available");
            }
            ipc.server.emit(socket, 'variablesInLineResponse', JSON.stringify(variables));
        });
        ipc.server.on('evaluateRequest', function (data, socket) {
            Log_1.Log.log(`evaluate(context: '${data.context}', '${data.expression}')`, ViperProtocol_1.LogLevel.LowLevelDebug);
            let evaluated = debuggedVerificationTask.model.values.has(data.expression)
                ? debuggedVerificationTask.model.values.get(data.expression)
                : "unknown";
            ipc.server.emit(socket, 'evaluateResponse', JSON.stringify(evaluated));
        });
        ipc.server.on('nextLineRequest', function (data, socket) {
            Log_1.Log.log(`get line after ${data}`, ViperProtocol_1.LogLevel.LowLevelDebug);
            let nextLine = debuggedVerificationTask.getNextLine(data);
            ipc.server.emit(socket, 'nextLineResponse', nextLine);
        });
        ipc.server.on('stackTraceRequest', function (data, socket) {
            Log_1.Log.log('stack trace request for line ' + data, ViperProtocol_1.LogLevel.Debug);
            let lineNumber;
            try {
                lineNumber = data - 0;
            }
            catch (error) {
                Log_1.Log.error("Wrong format");
            }
            let stepsOnLine = [];
            if (debuggedVerificationTask) {
                let steps = debuggedVerificationTask.getStepsOnLine(lineNumber);
                steps.forEach((step) => {
                    stepsOnLine.push({ "type": Statement_1.StatementType[step.type], position: step.position });
                });
            }
            ipc.server.emit(socket, 'stackTraceResponse', JSON.stringify(stepsOnLine));
        });
    });
    ipc.server.start();
}
/*
// This handler provides the initial list of the completion items.
connection.onCompletion((textPositionParams): CompletionItem[] => {
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
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBTWIsd0NBT08sdUJBQXVCLENBQUMsQ0FBQTtBQUcvQixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsMkJBQXVCLFlBQ3ZCLENBQUMsQ0FEa0M7QUFDbkMsZ0NBQTBHLGlCQUMxRyxDQUFDLENBRDBIO0FBQzNILGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELG1DQUErQixvQkFBb0IsQ0FBQyxDQUFBO0FBQ3BELDRCQUF1QyxhQUFhLENBQUMsQ0FBQTtBQUdyRCxJQUFJLEdBQUcsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7QUFFOUIsb0ZBQW9GO0FBQ3BGLElBQUksVUFBVSxHQUFnQix3Q0FBZ0IsQ0FBQyxJQUFJLHdDQUFnQixDQUFDLE9BQU8sQ0FBQyxFQUFFLElBQUksd0NBQWdCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUM3RyxnRkFBZ0Y7QUFDaEYsSUFBSSxPQUFnQixDQUFDO0FBQ3JCLElBQUksU0FBUyxHQUFrQixJQUFJLHFDQUFhLEVBQUUsQ0FBQztBQUNuRCxJQUFJLGlCQUFpQixHQUFrQyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQ2pFLElBQUksY0FBOEIsQ0FBQztBQUNuQyxJQUFJLFFBQXVCLENBQUM7QUFDNUIsSUFBSSxhQUFxQixDQUFDO0FBRTFCLElBQUksd0JBQTBDLENBQUM7QUFFL0MsaUNBQWlDO0FBQ2pDLGNBQWMsRUFBRSxDQUFDO0FBRWpCLFNBQVMsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7QUFFN0IsZ0NBQWdDO0FBQ2hDLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxNQUFNO0lBQzNCLFNBQUcsQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO0lBQzVCLGFBQWEsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFD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