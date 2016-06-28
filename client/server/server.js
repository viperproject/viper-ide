'use strict';
const vscode_languageserver_1 = require('vscode-languageserver');
const Log_1 = require('./Log');
const Settings_1 = require('./Settings');
const NailgunService_1 = require('./NailgunService');
const VerificationTask_1 = require('./VerificationTask');
const Statement_1 = require('./Statement');
const ViperProtocol_1 = require('./ViperProtocol');
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
    Log_1.Log.log("Viper-Server is now active!");
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
    Log_1.Log.log("On Exit");
    //nailgunService.stopNailgunServer();
});
connection.onShutdown(() => {
    Log_1.Log.log("On Shutdown");
    nailgunService.stopNailgunServer();
});
// The settings have changed. Is sent on server activation as well.
connection.onDidChangeConfiguration((change) => {
    Log_1.Log.log('configuration changed');
    settings = change.settings.viperSettings;
    //pass the new settings to the verificationService
    nailgunService.changeSettings(settings);
    //check settings
    let error = Settings_1.Settings.checkSettings(settings);
    if (error) {
        connection.sendNotification(ViperProtocol_1.Commands.InvalidSettings, error);
        return;
    }
    Log_1.Log.hint("The settings are ok");
    let backendNames = Settings_1.Settings.getBackendNames(settings);
    if (backendNames.length > 0) {
        Log_1.Log.log("Ask user to select backend");
        connection.sendRequest(ViperProtocol_1.Commands.AskUserToSelectBackend, backendNames);
    }
    else {
        Log_1.Log.error("No backend, even though the setting check succeeded?");
    }
});
connection.onRequest(ViperProtocol_1.Commands.SelectBackend, (selectedBackend) => {
    if (!settings.valid) {
        connection.sendNotification(ViperProtocol_1.Commands.InvalidSettings, "Cannot start backend, fix settings first.");
        return;
    }
    if (!selectedBackend) {
        //select first backend by default;
        backend = settings.verificationBackends[0];
    }
    else {
        for (var i = 0; i < settings.verificationBackends.length; i++) {
            let elem = settings.verificationBackends[i];
            if (elem.name == selectedBackend) {
                backend = elem;
                break;
            }
        }
    }
    nailgunService.restartNailgunServer(connection, backend);
});
connection.onRequest(ViperProtocol_1.Commands.RequestBackendSelection, (args) => {
    let backendNames = Settings_1.Settings.getBackendNames(settings);
    if (backendNames.length > 1) {
        connection.sendRequest(ViperProtocol_1.Commands.AskUserToSelectBackend, backendNames);
    }
    else {
        Log_1.Log.hint("there less than two backends, selecting does not make sense.");
    }
});
connection.onDidChangeWatchedFiles((change) => {
    // Monitored files have change in VSCode
    //Log.log("We recevied an file change event")
});
connection.onDidOpenTextDocument((params) => {
    if (isViperSourceFile(params.textDocument.uri)) {
        let uri = params.textDocument.uri;
        if (!verificationTasks.has(uri)) {
            //create new task for opened file
            let task = new VerificationTask_1.VerificationTask(uri, nailgunService, connection, backend);
            verificationTasks.set(uri, task);
        }
        Log_1.Log.log(`${uri} opened, task created`);
    }
});
connection.onDidCloseTextDocument((params) => {
    if (isViperSourceFile(params.textDocument.uri)) {
        let uri = params.textDocument.uri;
        if (!verificationTasks.has(uri)) {
            //remove no longer needed task
            verificationTasks.delete(uri);
        }
        Log_1.Log.log(`${params.textDocument.uri} closed, task deleted`);
    }
});
connection.onDidChangeTextDocument((params) => {
    //reset the diagnostics for the changed file
    if (isViperSourceFile(params.textDocument.uri)) {
        resetDiagnostics(params.textDocument.uri);
    }
});
connection.onDidSaveTextDocument((params) => {
    if (isViperSourceFile(params.textDocument.uri)) {
        startOrRestartVerification(params.textDocument.uri, false, false);
    }
    else {
        Log_1.Log.log("This system can only verify .sil and .vpr files");
    }
});
//triggered by user command
connection.onRequest(ViperProtocol_1.Commands.Verify, (uri) => {
    startOrRestartVerification(uri, false, true);
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
    return null;
});
connection.onRequest(ViperProtocol_1.Commands.StopVerification, (uri) => {
    let task = verificationTasks.get(uri);
    task.abortVerification();
    connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.Ready, firstTime: true });
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
        Log_1.Log.log("no backend has beed selected, the first was picked by default.");
        backend = settings.verificationBackends[0];
        nailgunService.startNailgunIfNotRunning(connection, backend);
    }
    if (!nailgunService.ready) {
        Log_1.Log.hint("The verification backend is not ready yet.");
        return;
    }
    //check if there is already a verification task for that file
    let task = verificationTasks.get(uri);
    if (!task) {
        Log_1.Log.error("No verification task found for file: " + uri);
        return;
    }
    //stop if needed
    task.abortVerification();
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
            Log_1.Log.log("Debugger: " + data);
        });
        ipc.server.on('launchRequest', function (data, socket) {
            Log_1.Log.log('Debugging was requested for file: ' + data);
            VerificationTask_1.VerificationTask.pathToUri(data).then((uri) => {
                debuggedVerificationTask = verificationTasks.get(uri);
                let response = "true";
                if (!debuggedVerificationTask) {
                    Log_1.Log.hint("Cannot debug file, you have to first verify the file: " + uri);
                    response = "false";
                }
                ipc.server.emit(socket, 'launchResponse', response);
            });
        });
        ipc.server.on('variablesInLineRequest', function (data, socket) {
            Log_1.Log.log('got a variables request for line ' + data);
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
            Log_1.Log.log(`evaluate(context: '${data.context}', '${data.expression}')`);
            let evaluated = debuggedVerificationTask.model.values.has(data.expression)
                ? debuggedVerificationTask.model.values.get(data.expression)
                : "unknown";
            ipc.server.emit(socket, 'evaluateResponse', JSON.stringify(evaluated));
        });
        ipc.server.on('nextLineRequest', function (data, socket) {
            Log_1.Log.log(`get line after ${data}`);
            let nextLine = debuggedVerificationTask.getNextLine(data);
            ipc.server.emit(socket, 'nextLineResponse', nextLine);
        });
        ipc.server.on('stackTraceRequest', function (data, socket) {
            Log_1.Log.log('stack trace request for line ' + data);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBT2Isd0NBT08sdUJBQXVCLENBQUMsQ0FBQTtBQUcvQixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsMkJBQStDLFlBQVksQ0FBQyxDQUFBO0FBQzVELGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELG1DQUErQixvQkFBb0IsQ0FBQyxDQUFBO0FBQ3BELDRCQUE0QixhQUFhLENBQUMsQ0FBQTtBQUMxQyxnQ0FBMEMsaUJBQWlCLENBQUMsQ0FBQTtBQUc1RCxJQUFJLEdBQUcsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7QUFFOUIsb0ZBQW9GO0FBQ3BGLElBQUksVUFBVSxHQUFnQix3Q0FBZ0IsQ0FBQyxJQUFJLHdDQUFnQixDQUFDLE9BQU8sQ0FBQyxFQUFFLElBQUksd0NBQWdCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUM3RyxnRkFBZ0Y7QUFDaEYsSUFBSSxPQUFnQixDQUFDO0FBQ3JCLElBQUksU0FBUyxHQUFrQixJQUFJLHFDQUFhLEVBQUUsQ0FBQztBQUNuRCxJQUFJLGlCQUFpQixHQUFrQyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQ2pFLElBQUksY0FBOEIsQ0FBQztBQUNuQyxJQUFJLFFBQXVCLENBQUM7QUFDNUIsSUFBSSxhQUFxQixDQUFDO0FBRTFCLElBQUksd0JBQTBDLENBQUM7QUFFL0MsaUNBQWlDO0FBQ2pDLGNBQWMsRUFBRSxDQUFDO0FBRWpCLFNBQVMsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7QUFFN0IsZ0NBQWdDO0FBQ2hDLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxNQUFNO0lBQzNCLFNBQUcsQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO0lBQzVCLFNBQUcsQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMs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