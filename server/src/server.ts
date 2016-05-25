'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import fs = require('fs');
import child_process = require('child_process');

import {
    IPCMessageReader, IPCMessageWriter,
    createConnection, IConnection, TextDocumentSyncKind,
    TextDocuments, Diagnostic, DiagnosticSeverity,
    InitializeParams, InitializeResult, TextDocumentIdentifier,
    CompletionItem, CompletionItemKind, NotificationType,
    RequestType, RequestHandler
} from 'vscode-languageserver';

import {LogEntry, LogType} from './LogEntry';
import {Log} from './Log';
import * as Settings from './Settings';

import {VerificationService} from './VerificationService'

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

let verificationService: VerificationService;

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites. 
let workspaceRoot: string;
connection.onInitialize((params): InitializeResult => {
    Log.connection = connection;
    Log.log("connected");
    workspaceRoot = params.rootPath;
    verificationService = new VerificationService();
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
    Log.log('content changed');
    //verifyTextDocument(change.document.uri);
});

connection.onExit(() => {
    verificationService.stopNailgunServer();
})

// The settings have changed. Is sent on server activation as well.
connection.onDidChangeConfiguration((change) => {
    Log.log('configuration changed');
    settings = <Settings.IveSettings>change.settings.iveSettings;
    let backends = settings.verificationBackends;

    //pass the new settings to the verificationService
    verificationService.changeSettings(settings);

    let error = Settings.Settings.valid(backends);
    if (!error) {
        if (!settings.nailgunServerJar || settings.nailgunServerJar.length == 0) {
            error = "Path to nailgun server jar is missing"
        } else {
            let envVar = Settings.Settings.extractEnvVar(settings.nailgunServerJar)
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
    verificationService.startNailgunIfNotRunning();
});

let wrongFormat: boolean = false;
let diagnostics: Diagnostic[];

let backend: Settings.Backend;
let settings: Settings.IveSettings;

let time = "0";
let uri: string;

let progress = 0;

// connection.onNotification({ method: 'startNailgun' }, () => {
//     verifierProcess = VerificationService.startNailgunServer();
// })
// connection.onNotification({ method: 'stopNailgun' }, () => {
//     stopNailgunServer();
// })

function resetDiagnostics(uri: string) {
    diagnostics = [];
    //reset diagnostics
    connection.sendDiagnostics({ uri: uri, diagnostics });
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function verifyTextDocument(uri: string, onlyTypeCheck: boolean): void {
    verificationService.verificationRunning = true;

    //Initialization
    resetDiagnostics(uri);
    wrongFormat = false;

    Log.log(backend.name + ' verification startet');

    connection.sendNotification({ method: "VerificationStart" });

    let path = uriToPath(uri);

    //start verification of current file
    let currfile = '"' + path + '"';
    //let content: string = fs.readFileSync(path).toString();
    verificationService.verify(currfile, true, onlyTypeCheck, backend, stdOutHadler, stdErrHadler, verificationCompletionHandler);
}

function verificationCompletionHandler(code) {
    Log.log(`Child process exited with code ${code}`);
    // Send the computed diagnostics to VSCode.
    connection.sendDiagnostics({ uri: uri, diagnostics });
    connection.sendNotification({ method: "VerificationEnd" }, diagnostics.length == 0);
    verificationService.verificationRunning = false;
}

function stdErrHadler(data) {
    Log.error(`stderr: ${data}`);
    if (data.startsWith("connect: No error")) {
        connection.sendNotification({ method: "Hint" }, "No Nailgun server is running on port " + verificationService.nailgunPort);
    }
    if (data.startsWith("java.lang.ClassNotFoundException:")) {
        connection.sendNotification({ method: "Hint" }, "Class " + backend.mainMethod + " is unknown to Nailgun");
    }
}

class TotalProgress {
    predicates: Progress;
    functions: Progress;
    methods: Progress;

    constructor(json:TotalProgress){
        this.predicates = json.predicates;
        this.methods = json.methods;
        this.functions = json.functions;
    }

    public toPercent(): number {
        let total = this.predicates.total + this.methods.total + this.functions.total;
        let current = this.predicates.current + this.methods.current + this.functions.current;
        return 100 * current / total;
    }
}
interface Progress {
    current: number;
    total: number;
}

function stdOutHadler(data) {
    Log.log('stdout: ' + data);

    if (wrongFormat) {
        return;
    }
    let stringData: string = data;
    let parts = stringData.split(/\r?\n/g);

    for (var i = 0; i < parts.length; i++) {
        let part = parts[i];
        if (part.startsWith("Command-line interface:")) {
            Log.error('Could not start verification -> fix format');
            wrongFormat = true;
        }
        if (part.startsWith('Silicon finished in') || part.startsWith('carbon finished in')) {
            time = /.*?(\d*\.\d*).*/.exec(part)[1];
        }
        else if (part == 'No errors found.') {
            Log.log('Successfully verified with ' + backend.name + ' in ' + time + ' seconds.');
            time = "0";
        }
        else if (part.startsWith("{") && part.endsWith("}")) {
            try {
                let progress = new TotalProgress(JSON.parse(part));
                Log.log("Progress: " + progress.toPercent());
                connection.sendNotification({method:"VerificationProgress"},progress.toPercent())
            } catch (e) {
                Log.error(e);
            }
        }
        else if (part.startsWith('The following errors were found')) {
            Log.log(backend.name + ': Verification failed after ' + time + ' seconds.');
            time = "0";
        }
        else if (part.startsWith('  ')) {
            let pos = /\s*(\d*):(\d*):\s(.*)/.exec(part);
            if (pos.length != 4) {
                Log.error('could not parse error description: "' + part + '"');
                return;
            }
            let lineNr = +pos[1] - 1;
            let charNr = +pos[2] - 1;
            let message = pos[3].trim();

            diagnostics.push({
                range: {
                    start: { line: lineNr, character: charNr },
                    end: { line: lineNr, character: 10000 }//Number.max does not work -> 10000 is an arbitrary large number that does the job
                },
                source: backend.name,
                severity: DiagnosticSeverity.Error,
                message: message
            });
        }
    }
}

connection.onDidChangeWatchedFiles((change) => {
    // Monitored files have change in VSCode
    Log.log('We recevied an file change event');
});


// // This handler provides the initial list of the completion items.
// connection.onCompletion((textPositionParams): CompletionItem[] => {
//     // The pass parameter contains the position of the text document in 
//     // which code complete got requested. For the example we ignore this
//     // info and always provide the same completion items.
//     var res = [];
//     let completionItem: CompletionItem = {
//         label: 'invariant',
//         kind: CompletionItemKind.Text,
//         data: 1
//     };
//     res.push(completionItem);
//     return res;
// });

// // This handler resolve additional information for the item selected in
// // the completion list.
// connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
//     //Log.log('onCompletionResolve');
//     if (item.data === 1) {
//         item.detail = 'add an invariant',
//             item.documentation = 'The invariant needs to hold before and after the loop body'
//     }
//     return item;
// });

connection.onDidOpenTextDocument((params) => {
    // A text document got opened in VSCode.
    // params.uri uniquely identifies the document. For documents store on disk this is a file URI.
    // params.text the initial full content of the document.

    let doc = params.textDocument;
    uri = doc.uri;
    Log.log(`${doc.uri} opened.`);
});

connection.onDidChangeTextDocument((params) => {
    // The content of a text document did change in VSCode.
    // params.uri uniquely identifies the document.
    // params.contentChanges describe the content changes to the document.
    //Log.log(`${params.uri} changed: ${JSON.stringify(params.contentChanges)}`);
    //let doc = params.textDocument;
    //startOrRestartVerification(params.textDocument.uri, true);
    resetDiagnostics(params.textDocument.uri);
});

connection.onDidCloseTextDocument((params) => {
    // A text document got closed in VSCode.
    // params.uri uniquely identifies the document.
    Log.log(`${params.textDocument.uri} closed.`);
});

connection.onDidSaveTextDocument((params) => {
    if (params.textDocument.uri.endsWith(".sil")) {
        startOrRestartVerification(params.textDocument.uri, false)
    } else {
        Log.log("This system can only verify .sil files");
    }
})

function startOrRestartVerification(uri: string, onlyTypeCheck: boolean) {
    if (!verificationService.nailgunReady) {
        Log.log("nailgun not ready yet");
        return;
    }
    if (verificationService.verificationRunning) {
        Log.log("verification already running -> abort and restart.");
        verificationService.abortVerification();
    }
    verifyTextDocument(uri, onlyTypeCheck);
}

// Listen on the connection
connection.listen();

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

function uriToPath(uri: string): string {
    if (!uri.startsWith("file:")) {
        Log.error("cannot convert uri to filepath, uri: " + uri);
    }
    uri = uri.replace("\%3A", ":");
    uri = uri.replace("file:\/\/\/", "");
    uri = uri.replace("\%20", " ");
    return uri;
}