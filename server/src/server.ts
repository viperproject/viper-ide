'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import fs = require('fs');
import child_process = require('child_process');

import {
    IPCMessageReader, IPCMessageWriter,
    createConnection, IConnection, TextDocumentSyncKind,
    TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
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

console.log("SERVER IS ALIVE");

startIPCServer();

documents.listen(connection);

//starting point (executed once)
connection.onInitialize((params): InitializeResult => {
    Log.connection = connection;
    Log.log("Viper-IVE-Server is now active!");
    workspaceRoot = params.rootPath;
    nailgunService = new NailgunService();
    nailgunService.startNailgunIfNotRunning(connection);
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
    nailgunService.stopNailgunServer();
})

// The settings have changed. Is sent on server activation as well.
connection.onDidChangeConfiguration((change) => {
    Log.log('configuration changed');
    settings = <IveSettings>change.settings.iveSettings;
    let backends = settings.verificationBackends;

    //pass the new settings to the verificationService
    nailgunService.changeSettings(settings);

    let error = Settings.valid(backends);
    if (!error) {
        if (!settings.nailgunServerJar || settings.nailgunServerJar.length == 0) {
            error = "Path to nailgun server jar is missing"
        } else {
            let envVar = Settings.extractEnvVar(settings.nailgunServerJar)
            if (!envVar) {
                error = "Environment varaible " + settings.nailgunServerJar + " is not set."
            } else {
                settings.nailgunServerJar = envVar;
            }
        }
    }
    if (error) {
        connection.sendNotification({ method: "InvalidSettings" }, "Settings: " + error);
        return;
    }
    backend = backends[0];
    //TODO: decide whether to restart Nailgun or not
});

connection.onDidChangeWatchedFiles((change) => {
    // Monitored files have change in VSCode
    //Log.log("We recevied an file change event")
});

connection.onDidOpenTextDocument((params) => {
    let uri = params.textDocument.uri;
    if (!verificationTasks.has(uri)) {
        //create new task for opened file
        let task = new VerificationTask(uri, nailgunService, connection, backend);
        verificationTasks.set(uri, task);
    }
    Log.log(`${uri} opened, task created`);
});

connection.onDidCloseTextDocument((params) => {
    let uri = params.textDocument.uri;
    if (!verificationTasks.has(uri)) {
        //remove no longer needed task
        verificationTasks.delete(uri);
    }
    Log.log(`${params.textDocument.uri} closed, task deleted`);
});

connection.onDidChangeTextDocument((params) => {
    //reset the diagnostics for the changed file
    resetDiagnostics(params.textDocument.uri);
});

connection.onDidSaveTextDocument((params) => {
    if (params.textDocument.uri.endsWith(".sil")) {
        startOrRestartVerification(params.textDocument.uri, false)
    } else {
        Log.log("This system can only verify .sil files");
    }
})

function resetDiagnostics(uri: string) {
    let task = verificationTasks.get(uri);
    if (!task) {
        Log.error("no verification Task for file: " + uri);
        return;
    }
    task.resetDiagnostics();
}

function startOrRestartVerification(uri: string, onlyTypeCheck: boolean) {

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

connection.onRequest({ method: 'variablesInLine' }, (lineNumber) => {
    let variables = [];
    this.steps.forEach(element => {
        if (element.position.line === lineNumber) {
            element.store.foreEach(variable => {
                variables.push({
                    name: variable,
                    value: variable,
                    variablesReference: 0
                });
            })
        }
    });
});


// Listen on the connection
connection.listen();

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
                    let uri = VerificationTask.pathToUri(data);
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
                            stepsOnLine.push({ "type": StatementType[step.type], position:step.position });
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