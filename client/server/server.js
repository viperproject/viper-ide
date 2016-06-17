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
    task.verify(backend, onlyTypeCheck);
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
                    Log_1.Log.error("No Debug information available for uri: " + uri);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBQWIsaUJBd2NFO0FBamNGLHNDQU9PLHVCQUF1QixDQUFDLENBQUE7QUFHL0Isb0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBQzFCLHlCQUE2QyxZQUFZLENBQUMsQ0FBQTtBQUMxRCwrQkFBNkIsa0JBQWtCLENBQUMsQ0FBQTtBQUNoRCxpQ0FBK0Isb0JBQW9CLENBQUMsQ0FBQTtBQUNwRCwwQkFBNEIsYUFBYSxDQUFDLENBQUE7QUFDMUMsOEJBQTBDLGlCQUUxQyxDQUFDLENBRjBEO0FBRTNELElBQUksR0FBRyxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUU5QixvRkFBb0Y7QUFDcEYsSUFBSSxVQUFVLEdBQWdCLHdDQUFnQixDQUFDLElBQUksd0NBQWdCLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSx3Q0FBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBQzdHLGdGQUFnRjtBQUNoRixJQUFJLE9BQWdCLENBQUM7QUFDckIsSUFBSSxTQUFTLEdBQWtCLElBQUkscUNBQWEsRUFBRSxDQUFDO0FBQ25ELElBQUksaUJBQWlCLEdBQWtDLElBQUksR0FBRyxFQUFFLENBQUM7QUFDakUsSUFBSSxjQUE4QixDQUFDO0FBQ25DLElBQUksUUFBcUIsQ0FBQztBQUMxQixJQUFJLGFBQXFCLENBQUM7QUFFMUIsSUFBSSx3QkFBMEMsQ0FBQztBQUUvQyxpQ0FBaUM7QUFDakMsY0FBYyxFQUFFLENBQUM7QUFFakIsU0FBUyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUU3QixnQ0FBZ0M7QUFDaEMsVUFBVSxDQUFDLFlBQVksQ0FBQyxVQUFDLE1BQU07SUFDM0IsU0FBRyxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7SUFDNUIsU0FBRyxDQUFDLEdBQUcsQ0FB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