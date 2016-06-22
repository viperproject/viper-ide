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
let getTrace = true;
//for communication with debugger
startIPCServer();
documents.listen(connection);
//starting point (executed once)
connection.onInitialize((params) => {
    Log_1.Log.connection = connection;
    Log_1.Log.log("Viper-IVE-Server is now active!");
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
    settings = change.settings.iveSettings;
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
        startOrRestartVerification(params.textDocument.uri, false);
    }
    else {
        Log_1.Log.log("This system can only verify .sil and .vpr files");
    }
});
//triggered by user command
connection.onRequest(ViperProtocol_1.Commands.Verify, (uri) => {
    startOrRestartVerification(uri, false);
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
function startOrRestartVerification(uri, onlyTypeCheck) {
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
    task.verify(backend, onlyTypeCheck, getTrace);
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
            Log_1.Log.logWithOrigin("Debugger", data);
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
                        if (debuggedVerificationTask.model.values.has(variable.value)) {
                            variable.value = debuggedVerificationTask.model.values.get(variable.value);
                        }
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
            ipc.server.emit(socket, 'evaluateResponse');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBT2Isd0NBT08sdUJBQXVCLENBQUMsQ0FBQTtBQUcvQixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsMkJBQTZDLFlBQVksQ0FBQyxDQUFBO0FBQzFELGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELG1DQUErQixvQkFBb0IsQ0FBQyxDQUFBO0FBQ3BELDRCQUE0QixhQUFhLENBQUMsQ0FBQTtBQUMxQyxnQ0FBMEMsaUJBQWlCLENBQUMsQ0FBQTtBQUc1RCxJQUFJLEdBQUcsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7QUFFOUIsb0ZBQW9GO0FBQ3BGLElBQUksVUFBVSxHQUFnQix3Q0FBZ0IsQ0FBQyxJQUFJLHdDQUFnQixDQUFDLE9BQU8sQ0FBQyxFQUFFLElBQUksd0NBQWdCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUM3RyxnRkFBZ0Y7QUFDaEYsSUFBSSxPQUFnQixDQUFDO0FBQ3JCLElBQUksU0FBUyxHQUFrQixJQUFJLHFDQUFhLEVBQUUsQ0FBQztBQUNuRCxJQUFJLGlCQUFpQixHQUFrQyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQ2pFLElBQUksY0FBOEIsQ0FBQztBQUNuQyxJQUFJLFFBQXFCLENBQUM7QUFDMUIsSUFBSSxhQUFxQixDQUFDO0FBRTFCLElBQUksd0JBQTBDLENBQUM7QUFFL0MsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDO0FBRXBCLGlDQUFpQztBQUNqQyxjQUFjLEVBQUUsQ0FBQztBQUVqQixTQUFTLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBRTdCLGdDQUFnQztBQUNoQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUMsTUFBTTtJQUMzQixTQUFHLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztJQUM1QixT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