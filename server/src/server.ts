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
import {Backend, ViperSettings, Commands, VerificationState, VerifyRequest, LogLevel, ShowHeapParams} from './ViperProtocol'
import {NailgunService} from './NailgunService';
import {VerificationTask} from './VerificationTask';
import {Statement, StatementType} from './Statement';
import {Model} from './Model';
import {DebugServer} from './DebugServer';
var ipc = require('node-ipc');

export class Server {
    static backend: Backend;
    static settings: ViperSettings;
    static connection: IConnection;
    static documents: TextDocuments = new TextDocuments();
    static verificationTasks: Map<string, VerificationTask> = new Map();
    static nailgunService: NailgunService;
    static workspaceRoot: string;
    static debuggedVerificationTask: VerificationTask;

    static isViperSourceFile(uri: string): boolean {
        return uri.endsWith(".sil") || uri.endsWith(".vpr");
    }
}

// Create a connection for the server. The connection uses Node's IPC as a transport
Server.connection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
Server.documents.listen(Server.connection);

registerHandlers();

function registerHandlers() {
    //starting point (executed once)
    Server.connection.onInitialize((params): InitializeResult => {
        DebugServer.initialize();

        Server.workspaceRoot = params.rootPath;
        Server.nailgunService = new NailgunService();
        return {
            capabilities: {
                // Tell the client that the server works in FULL text document sync mode
                textDocumentSync: Server.documents.syncKind,
                // Tell the client that the server support code complete
                completionProvider: {
                    resolveProvider: true
                }
            }
        }
    });

    Server.connection.onExit(() => {
        Log.log("On Exit", LogLevel.Debug);
    })

    Server.connection.onShutdown(() => {
        Log.log("On Shutdown", LogLevel.Debug);
        Server.nailgunService.stopNailgunServer();
    })

    Server.connection.onDidChangeConfiguration((change) => {
        Server.settings = <ViperSettings>change.settings.viperSettings;
        //after this line, Logging works
        Log.logLevel = Server.settings.logLevel;

        Log.log('configuration changed', LogLevel.Info);
        //check settings
        let error = Settings.checkSettings(Server.settings);
        if (error) {
            Server.connection.sendNotification(Commands.InvalidSettings, error);
            return;
        } else {
            Log.log("The settings are ok", LogLevel.Info);
        }

        //pass the new settings to the verificationService and the Log
        Server.nailgunService.changeSettings(Server.settings);

        //stop all running verifications
        Log.log("Stop all running verificationTasks", LogLevel.Debug)
        Server.verificationTasks.forEach(task => { task.abortVerification(); });

        Server.backend = Settings.autoselectBackend(Server.settings);
        Server.nailgunService.restartNailgunServer(Server.connection, Server.backend);
    });

    Server.connection.onRequest(Commands.SelectBackend, (selectedBackend: string) => {
        if (!Server.settings.valid) {
            Server.connection.sendNotification(Commands.InvalidSettings, "Cannot start backend, fix settings first.");
            return;
        }
        if (selectedBackend) {
            Settings.selectedBackend = selectedBackend;
        }
        Log.log("Stop all running verificationTasks", LogLevel.Debug)
        Server.verificationTasks.forEach(task => { task.abortVerification(); });
        Server.backend = Settings.autoselectBackend(Server.settings);
        Server.nailgunService.restartNailgunServer(Server.connection, Server.backend);
    });

    Server.connection.onRequest(Commands.RequestBackendSelection, (args) => {
        let backendNames: string[] = Settings.getBackendNames(Server.settings);
        if (backendNames.length > 1) {
            Server.connection.sendRequest(Commands.AskUserToSelectBackend, backendNames);
        } else {
            Log.hint("There are less than two backends, selecting does not make sense.");
        }
    });

    Server.connection.onDidChangeWatchedFiles((change) => {
        Log.log("We recevied a file change event", LogLevel.Debug)
    });

    Server.connection.onDidOpenTextDocument((params) => {
        if (Server.isViperSourceFile(params.textDocument.uri)) {
            let uri = params.textDocument.uri;
            if (!Server.verificationTasks.has(uri)) {
                //create new task for opened file
                let task = new VerificationTask(uri, Server.nailgunService, Server.connection);
                Server.verificationTasks.set(uri, task);
                Log.log(`${uri} opened, task created`, LogLevel.Debug);
                if (Server.nailgunService.ready) {
                    Log.log("Opened Text Document", LogLevel.Debug);
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
                Log.log(`${params.textDocument.uri} closed, task deleted`, LogLevel.Debug);
            }
        }
    });

    Server.connection.onRequest(Commands.Verify, (data: VerifyRequest) => {
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
                Settings.workspace = data.workspace;
                startOrRestartVerification(data.uri, false, data.manuallyTriggered);
            }
        } else if (data.manuallyTriggered) {
            Log.hint("This system can only verify .sil and .vpr files");
        }
    });

    Server.connection.onRequest(Commands.Dispose, (lineNumber) => {
        Server.nailgunService.stopNailgunServer();
        Server.nailgunService.killNgDeamon();
        return null;
    });

    Server.connection.onRequest(Commands.StopVerification, (uri: string) => {
        let task = Server.verificationTasks.get(uri);
        task.abortVerification();
        Server.connection.sendNotification(Commands.StateChange, { newState: VerificationState.Ready, firstTime: true, verificationNeeded: false });
    });

    Server.connection.onRequest(Commands.ShowHeap, (params: ShowHeapParams) => {
        let task = Server.verificationTasks.get(params.uri);
        if (!task) {
            Log.error("No verificationTask found for " + params.uri);
            return;
        }
        Server.connection.sendRequest(Commands.HeapGraph, task.getHeapGraphDescription(params.index));
    });

    // Server.documents.onDidChangeContent((change) => {Log.error("TODO: never happened before: Content Change detected")});
    // Server.connection.onDidChangeTextDocument((params) => {});
    // Server.connection.onDidSaveTextDocument((params) => {})

    // Listen on the connection
    Server.connection.listen();
}

function resetDiagnostics(uri: string) {
    let task = Server.verificationTasks.get(uri);
    if (!task) {
        Log.error("no verification Task for file: " + uri);
        return;
    }
    task.resetDiagnostics();
}

function startOrRestartVerification(uri: string, onlyTypeCheck: boolean, manuallyTriggered: boolean) {
    Log.log("start or restart verification of " + uri);
    //only verify if the settings are right
    if (!Server.settings.valid) {
        Server.connection.sendNotification(Commands.InvalidSettings, "Cannot verify, fix the settings first.");
        return;
    }

    //only verify viper source code files
    if (!Server.isViperSourceFile(uri)) {
        Log.hint("Only viper source files can be verified.");
        return;
    }

    //only verify if the settings are right
    if (!Server.backend) {
        Log.log("no backend has beed selected, the first was picked by default.", LogLevel.Debug);
        Server.backend = Server.settings.verificationBackends[0];
        Server.nailgunService.startNailgunIfNotRunning(Server.connection, Server.backend);
    }
    if (!Server.nailgunService.ready) {
        Log.hint("The verification backend is not ready yet");
        return;
    }

    //check if there is already a verification task for that file
    let task = Server.verificationTasks.get(uri);
    if (!task) {
        Log.error("No verification task found for file: " + uri);
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