'use strict';
var _this = this;
var vscode_languageserver_1 = require('vscode-languageserver');
var Log_1 = require('./Log');
var Settings_1 = require('./Settings');
var NailgunService_1 = require('./NailgunService');
var VerificationTask_1 = require('./VerificationTask');
var Statement_1 = require('./Statement');
var ViperProtocol_1 = require('./ViperProtocol');
var ipc = require('node-ipc');
// Create a connection for the server. The connection uses Node's IPC as a transport
var connection = vscode_languageserver_1.createConnection(new vscode_languageserver_1.IPCMessageReader(process), new vscode_languageserver_1.IPCMessageWriter(process));
//let connection: IConnection = createConnection(process.stdin, process.stdout);
var backend;
var documents = new vscode_languageserver_1.TextDocuments();
var verificationTasks = new Map();
var nailgunService;
var settings;
var workspaceRoot;
var debuggedVerificationTask;
var getTrace = true;
//for communication with debugger
startIPCServer();
documents.listen(connection);
//starting point (executed once)
connection.onInitialize(function (params) {
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
documents.onDidChangeContent(function (change) {
    Log_1.Log.error("TODO: never happened before: Content Change detected");
});
connection.onExit(function () {
    Log_1.Log.log("On Exit");
    //nailgunService.stopNailgunServer();
});
connection.onShutdown(function () {
    Log_1.Log.log("On Shutdown");
    nailgunService.stopNailgunServer();
});
// The settings have changed. Is sent on server activation as well.
connection.onDidChangeConfiguration(function (change) {
    Log_1.Log.log('configuration changed');
    settings = change.settings.iveSettings;
    //pass the new settings to the verificationService
    nailgunService.changeSettings(settings);
    //check settings
    var error = Settings_1.Settings.checkSettings(settings);
    if (error) {
        Log_1.Log.log("Invalid Settings detected");
        connection.sendNotification(ViperProtocol_1.Commands.InvalidSettings, error);
        return;
    }
    Log_1.Log.log("Ask user to select backend");
    var backendNames = Settings_1.Settings.getBackendNames(settings);
    if (backendNames.length > 0) {
        connection.sendRequest(ViperProtocol_1.Commands.AskUserToSelectBackend, backendNames);
    }
    else {
        Log_1.Log.error("No backend, even though the setting check succeeded?");
    }
});
connection.onRequest(ViperProtocol_1.Commands.SelectBackend, function (selectedBackend) {
    if (!selectedBackend) {
        //select first backend by default;
        backend = settings.verificationBackends[0];
    }
    else {
        for (var i = 0; i < settings.verificationBackends.length; i++) {
            var elem = settings.verificationBackends[i];
            if (elem.name == selectedBackend) {
                backend = elem;
                break;
            }
        }
    }
    nailgunService.restartNailgunServer(connection, backend);
});
connection.onRequest(ViperProtocol_1.Commands.RequestBackendSelection, function (args) {
    connection.sendRequest(ViperProtocol_1.Commands.AskUserToSelectBackend, Settings_1.Settings.getBackendNames(settings));
});
connection.onDidChangeWatchedFiles(function (change) {
    // Monitored files have change in VSCode
    //Log.log("We recevied an file change event")
});
connection.onDidOpenTextDocument(function (params) {
    if (isSiliconFile(params.textDocument)) {
        var uri = params.textDocument.uri;
        if (!verificationTasks.has(uri)) {
            //create new task for opened file
            var task = new VerificationTask_1.VerificationTask(uri, nailgunService, connection, backend);
            verificationTasks.set(uri, task);
        }
        Log_1.Log.log(uri + " opened, task created");
    }
});
connection.onDidCloseTextDocument(function (params) {
    if (isSiliconFile(params.textDocument)) {
        var uri = params.textDocument.uri;
        if (!verificationTasks.has(uri)) {
            //remove no longer needed task
            verificationTasks.delete(uri);
        }
        Log_1.Log.log(params.textDocument.uri + " closed, task deleted");
    }
});
connection.onDidChangeTextDocument(function (params) {
    //reset the diagnostics for the changed file
    if (isSiliconFile(params.textDocument)) {
        resetDiagnostics(params.textDocument.uri);
    }
});
connection.onDidSaveTextDocument(function (params) {
    if (isSiliconFile(params.textDocument)) {
        startOrRestartVerification(params.textDocument.uri, false);
    }
    else {
        Log_1.Log.log("This system can only verify .sil and .vpr files");
    }
});
//triggered by user command
connection.onRequest(ViperProtocol_1.Commands.Verify, function (uri) {
    startOrRestartVerification(uri, false);
});
connection.onRequest({ method: 'variablesInLine' }, function (lineNumber) {
    var variables = [];
    _this.steps.forEach(function (element) {
        if (element.position.line === lineNumber) {
            element.store.forEach(function (variable) {
                variables.push({
                    name: variable,
                    value: variable,
                    variablesReference: 0
                });
            });
        }
    });
});
connection.onRequest(ViperProtocol_1.Commands.Dispose, function (lineNumber) {
    nailgunService.stopNailgunServer();
    return null;
});
// Listen on the connection
connection.listen();
function resetDiagnostics(uri) {
    var task = verificationTasks.get(uri);
    if (!task) {
        Log_1.Log.error("no verification Task for file: " + uri);
        return;
    }
    task.resetDiagnostics();
}
function startOrRestartVerification(uri, onlyTypeCheck) {
    //if no backend was selected
    if (!backend) {
        Log_1.Log.log("no backend has beed selected, the first was picked by default.");
        backend = settings.verificationBackends[0];
        nailgunService.startNailgunIfNotRunning(connection, backend);
    }
    if (!nailgunService.ready) {
        Log_1.Log.hint("The verification backend is not ready yet.");
        return;
    }
    var task = verificationTasks.get(uri);
    if (!task) {
        Log_1.Log.error("No verification task found for file: " + uri);
        return;
    }
    if (task.running) {
        Log_1.Log.log("verification already running -> abort and restart.");
        task.abortVerification();
    }
    task.verify(backend, onlyTypeCheck, getTrace);
}
function isSiliconFile(document) {
    return document.uri.endsWith(".sil") || document.uri.endsWith(".vpr");
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
            VerificationTask_1.VerificationTask.pathToUri(data).then(function (uri) {
                debuggedVerificationTask = verificationTasks.get(uri);
                var response = "true";
                if (!debuggedVerificationTask) {
                    Log_1.Log.hint("Cannot debug file, you have to first verify the file: " + uri);
                    response = "false";
                }
                ipc.server.emit(socket, 'launchResponse', response);
            });
        });
        ipc.server.on('variablesInLineRequest', function (data, socket) {
            Log_1.Log.log('got a variables request for line ' + data);
            var lineNumber;
            try {
                lineNumber = data - 0;
            }
            catch (error) {
                Log_1.Log.error("Wrong format");
            }
            var variables = [];
            if (debuggedVerificationTask) {
                var steps = debuggedVerificationTask.getStepsOnLine(lineNumber);
                if (steps.length > 0) {
                    steps[0].store.forEach(function (variable) {
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
            Log_1.Log.log("evaluate(context: '" + data.context + "', '" + data.expression + "')");
            ipc.server.emit(socket, 'evaluateResponse');
        });
        ipc.server.on('stackTraceRequest', function (data, socket) {
            Log_1.Log.log('stack trace request for line ' + data);
            var lineNumber;
            try {
                lineNumber = data - 0;
            }
            catch (error) {
                Log_1.Log.error("Wrong format");
            }
            var stepsOnLine = [];
            if (debuggedVerificationTask) {
                var steps = debuggedVerificationTask.getStepsOnLine(lineNumber);
                steps.forEach(function (step) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBQWIsaUJBMmNFO0FBcGNGLHNDQU9PLHVCQUF1QixDQUFDLENBQUE7QUFHL0Isb0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBQzFCLHlCQUE2QyxZQUFZLENBQUMsQ0FBQTtBQUMxRCwrQkFBNkIsa0JBQWtCLENBQUMsQ0FBQTtBQUNoRCxpQ0FBK0Isb0JBQW9CLENBQUMsQ0FBQTtBQUNwRCwwQkFBNEIsYUFBYSxDQUFDLENBQUE7QUFDMUMsOEJBQTBDLGlCQUUxQyxDQUFDLENBRjBEO0FBRTNELElBQUksR0FBRyxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUU5QixvRkFBb0Y7QUFDcEYsSUFBSSxVQUFVLEdBQWdCLHdDQUFnQixDQUFDLElBQUksd0NBQWdCLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSx3Q0FBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBQzdHLGdGQUFnRjtBQUNoRixJQUFJLE9BQWdCLENBQUM7QUFDckIsSUFBSSxTQUFTLEdBQWtCLElBQUkscUNBQWEsRUFBRSxDQUFDO0FBQ25ELElBQUksaUJBQWlCLEdBQWtDLElBQUksR0FBRyxFQUFFLENBQUM7QUFDakUsSUFBSSxjQUE4QixDQUFDO0FBQ25DLElBQUksUUFBcUIsQ0FBQztBQUMxQixJQUFJLGFBQXFCLENBQUM7QUFFMUIsSUFBSSx3QkFBMEMsQ0FBQztBQUcvQyxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUM7QUFFcEIsaUNBQWlDO0FBQ2pDLGNBQWMsRUFBRSxDQUFDO0FBRWpCLFNBQVMsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7QUFFN0IsZ0NBQWdDO0FBQ2hDLFVBQVUsQ0FBQyxZQUFZLENBQUMsVUFBQyxNQUFNO0lBQzNCLFNBQUcsQ0FBQyxVQUFVLEdBQUcsVUFB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