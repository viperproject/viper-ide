'use strict';
var _this = this;
var vscode_languageserver_1 = require('vscode-languageserver');
var Log_1 = require('./Log');
var Settings_1 = require('./Settings');
var NailgunService_1 = require('./NailgunService');
var VerificationTask_1 = require('./VerificationTask');
var Statement_1 = require('./Statement');
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
        connection.sendNotification({ method: "InvalidSettings" }, error);
        return;
    }
    backend = settings.verificationBackends[0];
    nailgunService.startNailgunIfNotRunning(connection);
    //TODO: decide whether to restart Nailgun or not
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
        Log_1.Log.log("This system can only verify .sil files");
    }
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
connection.onRequest({ method: 'Dispose' }, function (lineNumber) {
    nailgunService.stopNailgunServer();
    return null;
});
// connection.onRequest({ method: 'uriToTextDocument' }, (uri) => {
//     let doc  = Text
// });
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
    if (!nailgunService.ready) {
        Log_1.Log.log("nailgun not ready yet");
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
    return document.uri.endsWith(".sil");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBQWIsaUJBc2FFO0FBL1pGLHNDQU9PLHVCQUF1QixDQUFDLENBQUE7QUFHL0Isb0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBQzFCLHlCQUE2QyxZQUFZLENBQUMsQ0FBQTtBQUMxRCwrQkFBNkIsa0JBQWtCLENBQUMsQ0FBQTtBQUNoRCxpQ0FBK0Isb0JBQW9CLENBQUMsQ0FBQTtBQUNwRCwwQkFBNEIsYUFBYSxDQUFDLENBQUE7QUFDMUMsSUFBSSxHQUFHLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBRTlCLG9GQUFvRjtBQUNwRixJQUFJLFVBQVUsR0FBZ0Isd0NBQWdCLENBQUMsSUFBSSx3Q0FBZ0IsQ0FBQyxPQUFPLENBQUMsRUFBRSxJQUFJLHdDQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFDN0csZ0ZBQWdGO0FBQ2hGLElBQUksT0FBZ0IsQ0FBQztBQUNyQixJQUFJLFNBQVMsR0FBa0IsSUFBSSxxQ0FBYSxFQUFFLENBQUM7QUFDbkQsSUFBSSxpQkFBaUIsR0FBa0MsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUNqRSxJQUFJLGNBQThCLENBQUM7QUFDbkMsSUFBSSxRQUFxQixDQUFDO0FBQzFCLElBQUksYUFBcUIsQ0FBQztBQUUxQixJQUFJLHdCQUEwQyxDQUFDO0FBRS9DLGlDQUFpQztBQUNqQyxjQUFjLEVBQUUsQ0FBQztBQUVqQixTQUFTLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBRTdCLGdDQUFnQztBQUNoQyxVQUFVLENBQUMsWUFBWSxDQUFDLFVBQUMsTUFBTTtJQUMzQixTQUFHLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztJQUM1QixTQUFHLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7SUFDM0MsYUFBYSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUM7SUFDaEMsY0FBYyxHQUFHLElBQUksK0JBQWMsRUFBRSxDQUFDO0lBQ3RDLE1BQU0sQ0FBQztRQUNILFlBQVksRUFBRTtZQUNWLHdFQUF3RTtZQUN4RSxnQkFBZ0IsRUFBRSxTQUFTLENBQUMsUUFBUTtZQUNwQyx3REFBd0Q7WUFDeEQsa0JBQWtCLEVBQUU7Z0JBQ2hCLGVBQWUsRUFBRSxJQUFJO2FBQ3hCO1NBQ0o7S0FDSixDQUFBO0FBQ0wsQ0FBQyxDQUFDLENBQUM7QUFFSCxvRUFBb0U7QUFDcEUsdUVBQXVFO0FBQ3ZFLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQyxVQUFDLE1BQU07SUFDaEMsU0FBRyxDQUFDLEtBQUssQ0FBQyxzREFBc0QsQ0FBQyxDQUFBO0FBQ3JFLENBQUMsQ0FBQyxDQUFDO0FBRUgsVUFBVSxDQUFDLE1BQU0sQ0FBQztJQUNkLFNBQUcsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDbkIscUNBQXFDO0FBQ3pDLENBQUMsQ0FBQyxDQUFBO0FBRUYsVUFBVSxDQUFDLFVBQVUsQ0FBQztJQUNsQixTQUFHLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ3ZCLGNBQWMsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0FBQ3ZDLENBQUMsQ0FBQyxDQUFBO0FBRUYsbUVBQW1FO0FBQ25FLFVBQVUsQ0FBQyx3QkFBd0IsQ0FBQyxVQUFDLE1BQU07SUFDdkMsU0FBRyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0lBQ2pDLFFBQVEsR0FBZ0IsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUM7SUFFcEQsa0RBQWtEO0lBQ2xELGNBQWMsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUM7SUFFeEMsZ0JBQWdCO0lBQ2hCLElBQUksS0FBSyxHQUFHLG1CQUFRLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzdDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDUixVQUFVLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNsRSxNQUFNLENBQUM7SUFDWCxDQUFDO0lBQ0QsT0FBTyxHQUFHLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUUzQyxjQUFjLENBQUMsd0JBQXdCLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDcEQsZ0RBQWdEO0FBQ3BELENBQUMsQ0FBQyxDQUFDO0FBRUgsVUFBVSxDQUFDLHVCQUF1QixDQUFDLFVBQUMsTUFBTTtJQUN0Qyx3Q0FBd0M7SUFDeEMsNkNBQTZDO0FBQ2pELENBQUMsQ0FBQyxDQUFDO0FBRUgsVUFBVSxDQUFDLHFCQUFxQixDQUFDLFVBQUMsTUFBTTtJQUNwQyxFQUFFLENBQUMsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyQyxJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQztRQUNsQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDOUIsaUNBQWlDO1lBQ2pDLElBQUksSUFBSSxHQUFHLElBQUksbUNBQWdCLENBQUMsR0FBRyxFQUFFLGNBQWMsRUFBRSxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDMUUsaUJBQWlCLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNyQyxDQUFDO1FBQ0QsU0FBRyxDQUFDLEdBQUcsQ0FBSSxHQUFHLDBCQUF1QixDQUFDLENBQUM7SUFDM0MsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDO0FBRUgsVUFBVSxDQUFDLHNCQUFzQixDQUFDLFVBQUMsTUFBTTtJQUNyQyxFQUFFLENBQUMsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyQyxJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQztRQUNsQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDOUIsOEJBQThCO1lBQzlCLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsQyxDQUFDO1FBQ0QsU0FBRyxDQUFDLEdBQUcsQ0FBSSxNQUFNLENBQUMsWUFBWSxDQUFDLEdBQUcsMEJBQXVCLENBQUMsQ0FBQztJQUMvRCxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUM7QUFFSCxVQUFVLENBQUMsdUJBQXVCLENBQUMsVUFBQyxNQUFNO0lBQ3RDLDRDQUE0QztJQUM1QyxFQUFFLENBQUMsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzlDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQztBQUVILFVBQVUsQ0FBQyxxQkFBcUIsQ0FBQyxVQUFDLE1BQU07SUFDcEMsRUFBRSxDQUFDLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckMsMEJBQTBCLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUE7SUFDOUQsQ0FBQztJQUFDLElBQUksQ0FBQyxDQUFDO1FBQ0osU0FBRyxDQUFDLEdBQUcsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO0lBQ3RELENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQTtBQUVGLFVBQVUsQ0FBQyxTQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxVQUFDLFVBQVU7SUFDM0QsSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO0lBQ25CLEtBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFVBQUEsT0FBTztRQUN0QixFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQ3ZDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFVBQUEsUUFBUTtnQkFDMUIsU0FBUyxDQUFDLElBQUksQ0FBQztvQkFDWCxJQUFJLEVBQUUsUUFBUTtvQkFDZCxLQUFLLEVBQUUsUUFBUTtvQkFDZixrQkFBa0IsRUFBRSxDQUFDO2lCQUN4QixDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQTtRQUNOLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNQLENBQUMsQ0FBQyxDQUFDO0FBRUgsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsRUFBRSxVQUFDLFVBQVU7SUFDbkQsY0FBYyxDQUFDLGlCQUFpQixFQUFFLENBQUM7SUFDbkMsTUFBTSxDQUFDLElBQUksQ0FBQztBQUNoQixDQUFDLENBQUMsQ0FBQztBQUVILG1FQUFtRTtBQUNuRSxzQkFBc0I7QUFDdEIsTUFBTTtBQUdOLDJCQUEyQjtBQUMzQixVQUFVLENBQUMsTUFBTSxFQUFFLENBQUM7QUFFcEIsMEJBQTBCLEdBQVc7SUFDakMsSUFBSSxJQUFJLEdBQUcsaUJBQWlCLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3RDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNSLFNBQUcsQ0FBQyxLQUFLLENBQUMsaUNBQWlDLEdBQUcsR0FBRyxDQUFDLENBQUM7UUFDbkQsTUFBTSxDQUFDO0lBQ1gsQ0FBQztJQUNELElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO0FBQzVCLENBQUM7QUFFRCxvQ0FBb0MsR0FBVyxFQUFFLGFBQXNCO0lBRW5FLEVBQUUsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDeEIsU0FBRyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sQ0FBQztJQUNYLENBQUM7SUFFRCxJQUFJLElBQUksR0FBRyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDdEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ1IsU0FBRyxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsR0FBRyxHQUFHLENBQUMsQ0FBQztRQUN6RCxNQUFNLENBQUM7SUFDWCxDQUFDO0lBQ0QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDZixTQUFHLENBQUMsR0FBRyxDQUFDLG9EQUFvRCxDQUFDLENBQUM7UUFDOUQsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUNELElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLGFBQWEsQ0FBQyxDQUFDO0FBQ3hDLENBQUM7QUFFRCx1QkFBdUIsUUFBZ0M7SUFDbkQsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3pDLENBQUM7QUFFRCw2QkFBNkI7QUFDN0I7SUFDSSxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsR0FBRyxPQUFPLENBQUM7SUFDeEIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO0lBRXhCLEdBQUcsQ0FBQyxLQUFLLENBQ0w7UUFDSSxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FDVCxLQUFLLEVBQ0wsVUFBVSxJQUFJLEVBQUUsTUFBTTtZQUNsQixTQUFHLENBQUMsYUFBYSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQ0osQ0FBQztRQUNGLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUNULGVBQWUsRUFDZixVQUFVLElBQUksRUFBRSxNQUFNO1lBQ2xCLFNBQUcsQ0FBQyxHQUFHLENBQUMsb0NBQW9DLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDckQsbUNBQWdCLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFDLEdBQUc7Z0JBQ3RDLHdCQUF3QixHQUFHLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDdEQsSUFBSSxRQUFRLEdBQUcsTUFBTSxDQUFDO2dCQUN0QixFQUFFLENBQUMsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQztvQkFDNUIsU0FBRyxDQUFDLEtBQUssQ0FBQywwQ0FBMEMsR0FBRyxHQUFHLENBQUMsQ0FBQztvQkFDNUQsUUFBUSxHQUFHLE9BQU8sQ0FBQztnQkFDdkIsQ0FBQztnQkFDRCxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FDWCxNQUFNLEVBQ04sZ0JBQWdCLEVBQ2hCLFFBQVEsQ0FDWCxDQUFDO1lBQ04sQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLENBQ0osQ0FBQztRQUNGLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUNULHdCQUF3QixFQUN4QixVQUFVLElBQUksRUFBRSxNQUFNO1lBQ2xCLFNBQUcsQ0FBQyxHQUFHLENBQUMsbUNBQW1DLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDcEQsSUFBSSxVQUFrQixDQUFDO1lBQ3ZCLElBQUksQ0FBQztnQkFDRCxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQztZQUMxQixDQUFFO1lBQUEsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDYixTQUFHLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQzlCLENBQUM7WUFFRCxJQUFJLFNBQVMsR0FBRyxFQUFFLENBQUM7WUFDbkIsRUFBRSxDQUFDLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDO2dCQUMzQixJQUFJLEtBQUssR0FBRyx3QkFBd0IsQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ2hFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDbkIsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBQyxRQUFRO3dCQUM1QixTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUM3QixDQUFDLENBQUMsQ0FBQztnQkFDUCxDQUFDO1lBQ0wsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLFNBQUcsQ0FBQyxLQUFLLENBQUMsdUNBQXVDLENBQUMsQ0FBQztZQUN2RCxDQUFDO1lBRUQsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQ1gsTUFBTSxFQUNOLHlCQUF5QixFQUN6QixJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUM1QixDQUFDO1FBQ04sQ0FBQyxDQUNKLENBQUM7UUFFRixHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FDVCxpQkFBaUIsRUFDakIsVUFBVSxJQUFJLEVBQUUsTUFBTTtZQUNsQixTQUFHLENBQUMsR0FBRyxDQUFDLHdCQUFzQixJQUFJLENBQUMsT0FBTyxZQUFPLElBQUksQ0FBQyxVQUFVLE9BQUksQ0FBQyxDQUFDO1lBRXRFLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUNYLE1BQU0sRUFDTixrQkFBa0IsQ0FDckIsQ0FBQztRQUNOLENBQUMsQ0FDSixDQUFDO1FBRUYsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQ1QsbUJBQW1CLEVBQ25CLFVBQVUsSUFBSSxFQUFFLE1BQU07WUFDbEIsU0FBRyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUNoRCxJQUFJLFVBQWtCLENBQUM7WUFDdkIsSUFBSSxDQUFDO2dCQUNELFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1lBQzFCLENBQUU7WUFBQSxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUNiLFNBQUcsQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDOUIsQ0FBQztZQUNELElBQUksV0FBVyxHQUFHLEVBQUUsQ0FBQztZQUNyQixFQUFFLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUM7Z0JBQzNCLElBQUksS0FBSyxHQUFHLHdCQUF3QixDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDaEUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFDLElBQUk7b0JBQ2YsV0FBVyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSx5QkFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0JBQ3BGLENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztZQUNELEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUNYLE1BQU0sRUFDTixvQkFBb0IsRUFDcEIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsQ0FDOUIsQ0FBQztRQUNOLENBQUMsQ0FDSixDQUFDO0lBQ04sQ0FBQyxDQUNKLENBQUM7SUFFRixHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO0FBQ3ZCLENBQUM7QUFDRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztFQXlCRTtBQUNGOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBOEZFIn0=