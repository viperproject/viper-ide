'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import fs = require('fs');
import child_process = require('child_process');

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
import {Backend, Settings, IveSettings} from './Settings';
import {NailgunService} from './NailgunService';
import {VerificationTask} from './VerificationTask';
import {StatementType} from './Statement';
import {Commands,VerificationState} from './ViperProtocol'

var ipc = require('node-ipc');

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
//let connection: IConnection = createConnection(process.stdin, process.stdout);
let backend: Backend;
let documents: TextDocuments = new TextDocuments();
let verificationTasks: Map<string, VerificationTask> = new Map();
let nailgunService: NailgunService;
let settings: IveSettings;
let workspaceRoot: string;

let debuggedVerificationTask: VerificationTask;

//for communication with debugger
startIPCServer();

documents.listen(connection);

//starting point (executed once)
connection.onInitialize((params): InitializeResult => {
    Log.connection = connection;
    Log.log("Viper-IVE-Server is now active!");
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
    Log.log("On Exit");
    //nailgunService.stopNailgunServer();
})

connection.onShutdown(() => {
    Log.log("On Shutdown");
    nailgunService.stopNailgunServer();
})

// The settings have changed. Is sent on server activation as well.
connection.onDidChangeConfiguration((change) => {
    Log.log('configuration changed');
    settings = <IveSettings>change.settings.iveSettings;

    //pass the new settings to the verificationService
    nailgunService.changeSettings(settings);

    //check settings
    let error = Settings.checkSettings(settings);
    if (error) {
        Log.log("Invalid Settings detected")
        connection.sendNotification(Commands.InvalidSettings, error);
        return;
    }

    //ask the user to pick a backend;
    Log.log("Ask user to select backend");
    if (settings.verificationBackends.length > 0) {
        connection.sendRequest(Commands.AskUserToSelectBackend, Settings.getBackendNames(settings));
    }
});

connection.onRequest(Commands.SelectBackend, (selectedBackend: string) => {
    for (var i = 0; i < settings.verificationBackends.length; i++) {
        let elem = settings.verificationBackends[i];
        if (elem.name == selectedBackend) {
            backend = elem;
            break;
        }
    }
    nailgunService.restartNailgunServer(connection, backend);
});

connection.onDidChangeWatchedFiles((change) => {
    // Monitored files have change in VSCode
    //Log.log("We recevied an file change event")
});

connection.onDidOpenTextDocument((params) => {
    if (isSiliconFile(params.textDocument)) {
        let uri = params.textDocument.uri;
        if (!verificationTasks.has(uri)) {
            //create new task for opened file
            let task = new VerificationTask(uri, nailgunService, connection, backend);
            verificationTasks.set(uri, task);
        }
        Log.log(`${uri} opened, task created`);
    }
});

connection.onDidCloseTextDocument((params) => {
    if (isSiliconFile(params.textDocument)) {
        let uri = params.textDocument.uri;
        if (!verificationTasks.has(uri)) {
            //remove no longer needed task
            verificationTasks.delete(uri);
        }
        Log.log(`${params.textDocument.uri} closed, task deleted`);
    }
});

connection.onDidChangeTextDocument((params) => {
    //reset the diagnostics for the changed file
    if (isSiliconFile(params.textDocument)) {
        resetDiagnostics(params.textDocument.uri);
    }
});

connection.onDidSaveTextDocument((params) => {
    if (isSiliconFile(params.textDocument)) {
        startOrRestartVerification(params.textDocument.uri, false)
    } else {
        Log.log("This system can only verify .sil and .vpr files");
    }
})

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
    return null;
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

function startOrRestartVerification(uri: string, onlyTypeCheck: boolean) {

    //if no backend was selected
    if (!backend) {
        Log.log("no backend has beed selected, the first was picked by default.");
        backend = settings.verificationBackends[0];
        nailgunService.startNailgunIfNotRunning(connection, backend);
    }

    if (!nailgunService.ready) {
        Log.log("nailgun not ready yet");
        return;
    }

    let task = verificationTasks.get(uri);
    if (!task) {
        Log.error("No verification task found for file: " + uri);
        return;
    }
    if (task.running) {
        Log.log("verification already running -> abort and restart.");
        task.abortVerification();
    }
    task.verify(backend, onlyTypeCheck);
}

function isSiliconFile(document: TextDocumentIdentifier): boolean {
    return document.uri.endsWith(".sil") || document.uri.endsWith(".vpr");
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
                    Log.logWithOrigin("Debugger", data);
                }
            );
            ipc.server.on(
                'launchRequest',
                function (data, socket) {
                    Log.log('Debugging was requested for file: ' + data);
                    VerificationTask.pathToUri(data).then((uri) => {
                        debuggedVerificationTask = verificationTasks.get(uri);
                        let response = "true";
                        if (!debuggedVerificationTask) {
                            Log.error("No Debug information available for uri: " + uri);
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
                    Log.log('got a variables request for line ' + data);
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
                    Log.log(`evaluate(context: '${data.context}', '${data.expression}')`);

                    ipc.server.emit(
                        socket,
                        'evaluateResponse'
                    );
                }
            );

            ipc.server.on(
                'stackTraceRequest',
                function (data, socket) {
                    Log.log('stack trace request for line ' + data);
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