'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import fs = require('fs');

import {
    IPCMessageReader, IPCMessageWriter,
    createConnection, IConnection, TextDocumentSyncKind,
    TextDocuments, TextDocument, TextDocumentIdentifier, Diagnostic, DiagnosticSeverity,
    InitializeParams, InitializeResult, TextDocumentPositionParams,
    CompletionItem, CompletionItemKind, NotificationType,
    RequestType, RequestHandler
} from 'vscode-languageserver';

import {LogEntry, LogType} from './LogEntry';
import {Log} from './Log';
import {Settings} from './Settings'
import {Backend, ViperSettings, Commands, VerificationState, VerifyRequest, LogLevel} from './ViperProtocol'
import {NailgunService} from './NailgunService';
import {VerificationTask} from './VerificationTask';
import {Statement, StatementType} from './Statement';
import {Model} from './Model';

var ipc = require('node-ipc');

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
//let connection: IConnection = createConnection(process.stdin, process.stdout);
let backend: Backend;
let documents: TextDocuments = new TextDocuments();
let verificationTasks: Map<string, VerificationTask> = new Map();
let nailgunService: NailgunService;
let settings: ViperSettings;
let workspaceRoot: string;

let debuggedVerificationTask: VerificationTask;

//for communication with debugger
startIPCServer();

documents.listen(connection);

//starting point (executed once)
connection.onInitialize((params): InitializeResult => {
    Log.connection = connection;
    workspaceRoot = params.rootPath;
    nailgunService = new NailgunService();
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: documents.syncKind,
            // Tell the client that the server support code complete
            completionProvider: {
                resolveProvider: true
            }
        }
    }
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
    Log.error("TODO: never happened before: Content Change detected")
});

connection.onExit(() => {
    Log.log("On Exit", LogLevel.Debug);
    //nailgunService.stopNailgunServer();
})

connection.onShutdown(() => {
    Log.log("On Shutdown", LogLevel.Debug);
    nailgunService.stopNailgunServer();
})

// The settings have changed. Is sent on server activation as well.
connection.onDidChangeConfiguration((change) => {
    settings = <ViperSettings>change.settings.viperSettings;
    //after this line, Logging works
    Log.logLevel = settings.logLevel;

    Log.log('configuration changed', LogLevel.Info);
    //check settings
    let error = Settings.checkSettings(settings);
    if (error) {
        connection.sendNotification(Commands.InvalidSettings, error);
        return;
    }
    Log.log("The settings are ok", LogLevel.Info);

    //pass the new settings to the verificationService and the Log
    nailgunService.changeSettings(settings);

    //stop all running verifications
    Log.log("Stop all running verificationTasks", LogLevel.Debug)
    verificationTasks.forEach(task => { task.abortVerification(); });

    backend = Settings.autoselectBackend(settings);
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

connection.onRequest(Commands.SelectBackend, (selectedBackend: string) => {
    if (!settings.valid) {
        connection.sendNotification(Commands.InvalidSettings, "Cannot start backend, fix settings first.");
        return;
    }
    if (selectedBackend) {
        Settings.selectedBackend = selectedBackend;
    }
    Log.log("Stop all running verificationTasks")
    verificationTasks.forEach(task => { task.abortVerification(); });
    backend = Settings.autoselectBackend(settings);
    nailgunService.restartNailgunServer(connection, backend);
});

connection.onRequest(Commands.RequestBackendSelection, (args) => {
    let backendNames: string[] = Settings.getBackendNames(settings);
    if (backendNames.length > 1) {
        connection.sendRequest(Commands.AskUserToSelectBackend, backendNames);
    } else {
        Log.hint("There less than two backends, selecting does not make sense.");
    }
});

connection.onDidChangeWatchedFiles((change) => {
    Log.log("We recevied a file change event", LogLevel.Debug)
});

connection.onDidOpenTextDocument((params) => {
    if (isViperSourceFile(params.textDocument.uri)) {
        let uri = params.textDocument.uri;
        if (!verificationTasks.has(uri)) {
            //create new task for opened file
            let task = new VerificationTask(uri, nailgunService, connection, backend);
            verificationTasks.set(uri, task);
            Log.log(`${uri} opened, task created`, LogLevel.Debug);
            if (nailgunService.ready) {
                Log.log("Opened Text Document", LogLevel.Debug);
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
            Log.log(`${params.textDocument.uri} closed, task deleted`, LogLevel.Debug);
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
})

connection.onRequest(Commands.Verify, (data: VerifyRequest) => {
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
            Settings.workspace = data.workspace;
            startOrRestartVerification(data.uri, false, data.manuallyTriggered);
        }
    } else if (data.manuallyTriggered) {
        Log.hint("This system can only verify .sil and .vpr files");
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
            })
        }
    });
});

connection.onRequest(Commands.Dispose, (lineNumber) => {
    nailgunService.stopNailgunServer();
    nailgunService.killNgDeamon();
    return null;
});

connection.onRequest(Commands.StopVerification, (uri: string) => {
    let task = verificationTasks.get(uri);
    task.abortVerification();
    connection.sendNotification(Commands.StateChange, { newState: VerificationState.Ready, firstTime: true, verificationNeeded: false });
});

// Listen on the connection
connection.listen();

function resetDiagnostics(uri: string) {
    let task = verificationTasks.get(uri);
    if (!task) {
        Log.error("no verification Task for file: " + uri);
        return;
    }
    task.resetDiagnostics();
}

function startOrRestartVerification(uri: string, onlyTypeCheck: boolean, manuallyTriggered: boolean) {
    Log.log("start or restart verification of " + uri);
    //only verify if the settings are right
    if (!settings.valid) {
        connection.sendNotification(Commands.InvalidSettings, "Cannot verify, fix the settings first.");
        return;
    }

    //only verify viper source code files
    if (!isViperSourceFile(uri)) {
        Log.hint("Only viper source files can be verified.");
        return;
    }

    //only verify if the settings are right
    if (!backend) {
        Log.log("no backend has beed selected, the first was picked by default.", LogLevel.Debug);
        backend = settings.verificationBackends[0];
        nailgunService.startNailgunIfNotRunning(connection, backend);
    }
    if (!nailgunService.ready) {
        Log.hint("The verification backend is not ready yet");
        return;
    }

    //check if there is already a verification task for that file
    let task = verificationTasks.get(uri);
    if (!task) {
        Log.error("No verification task found for file: " + uri);
        return;
    }
    //stop all other verifications because the backend crashes if multiple verifications are run in parallel
    verificationTasks.forEach(task => { task.abortVerification(); });
    //start verification
    task.verify(backend, onlyTypeCheck, manuallyTriggered);
}

function isViperSourceFile(uri: string): boolean {
    return uri.endsWith(".sil") || uri.endsWith(".vpr");
}

//communication with debugger
function startIPCServer() {
    ipc.config.id = 'viper';
    ipc.config.retry = 1500;

    ipc.serve(
        function () {
            ipc.server.on(
                'log',
                function (data, socket) {
                    Log.log("Debugger: " + data, LogLevel.LowLevelDebug);
                }
            );
            ipc.server.on(
                'launchRequest',
                function (data, socket) {
                    Log.log('Debugging was requested for file: ' + data, LogLevel.Debug);
                    VerificationTask.pathToUri(data).then((uri) => {
                        debuggedVerificationTask = verificationTasks.get(uri);
                        let response = "true";
                        if (!debuggedVerificationTask) {
                            //TODO: use better criterion to detect a missing verification
                            Log.hint("Cannot debug file, you must first verify the file: " + uri);
                            response = "false";
                        }
                        ipc.server.emit(
                            socket,
                            'launchResponse',
                            response
                        );
                    });
                }
            );
            ipc.server.on(
                'variablesInLineRequest',
                function (data, socket) {
                    Log.log('got a variables request for line ' + data, LogLevel.Debug);
                    let lineNumber: number;
                    try {
                        lineNumber = data - 0;
                    } catch (error) {
                        Log.error("Wrong format");
                    }

                    let variables = [];
                    if (debuggedVerificationTask) {
                        let steps = debuggedVerificationTask.getStepsOnLine(lineNumber);
                        if (steps.length > 0) {
                            steps[0].store.forEach((variable) => {
                                variables.push(variable);
                            });
                        }
                    } else {
                        Log.error("no debuggedVerificationTask available");
                    }

                    ipc.server.emit(
                        socket,
                        'variablesInLineResponse',
                        JSON.stringify(variables)
                    );
                }
            );

            ipc.server.on(
                'evaluateRequest',
                function (data, socket) {
                    Log.log(`evaluate(context: '${data.context}', '${data.expression}')`, LogLevel.LowLevelDebug);

                    let evaluated: string = debuggedVerificationTask.model.values.has(data.expression)
                        ? debuggedVerificationTask.model.values.get(data.expression)
                        : "unknown";

                    ipc.server.emit(
                        socket,
                        'evaluateResponse',
                        JSON.stringify(evaluated)
                    );
                }
            );

            ipc.server.on(
                'nextLineRequest',
                function (data, socket) {
                    Log.log(`get line after ${data}`, LogLevel.LowLevelDebug);

                    let nextLine = debuggedVerificationTask.getNextLine(data);
                    ipc.server.emit(
                        socket,
                        'nextLineResponse',
                        nextLine
                    );
                }
            );

            ipc.server.on(
                'stackTraceRequest',
                function (data, socket) {
                    Log.log('stack trace request for line ' + data, LogLevel.Debug);
                    let lineNumber: number;
                    try {
                        lineNumber = data - 0;
                    } catch (error) {
                        Log.error("Wrong format");
                    }
                    let stepsOnLine = [];
                    if (debuggedVerificationTask) {
                        let steps = debuggedVerificationTask.getStepsOnLine(lineNumber);
                        steps.forEach((step) => {
                            stepsOnLine.push({ "type": StatementType[step.type], position: step.position });
                        });
                    }
                    ipc.server.emit(
                        socket,
                        'stackTraceResponse',
                        JSON.stringify(stepsOnLine)
                    );
                }
            );
        }
    );

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