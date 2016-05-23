'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
var fs = require('fs');
var child_process = require('child_process');
var vscode_languageserver_1 = require('vscode-languageserver');
var LogEntry_1 = require('./LogEntry');
var Settings = require('./Settings');
// Create a connection for the server. The connection uses Node's IPC as a transport
var connection = vscode_languageserver_1.createConnection(new vscode_languageserver_1.IPCMessageReader(process), new vscode_languageserver_1.IPCMessageWriter(process));
// Create a simple text document manager. The text document manager
// supports full document sync only
var documents = new vscode_languageserver_1.TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites. 
var workspaceRoot;
connection.onInitialize(function (params) {
    log("connected");
    workspaceRoot = params.rootPath;
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
    log('content changed');
    //verifyTextDocument(change.document.uri);
});
connection.onExit(function () {
    //TOOD: make sure the nailgun server is really stopped
    stopNailgunServer();
});
// The settings have changed. Is sent on server activation as well.
connection.onDidChangeConfiguration(function (change) {
    log('configuration changed');
    settings = change.settings.iveSettings;
    var backends = settings.verificationBackends;
    var error = Settings.Settings.valid(backends);
    if (!error) {
        if (!settings.nailgunServerJar || settings.nailgunServerJar.length == 0) {
            error = "Path to nailgun server jar is missing";
        }
        else {
            var envVar = Settings.Settings.extractEnvVar(settings.nailgunServerJar);
            if (!envVar) {
                error = "Environment varaible " + settings.nailgunServerJar + " is not set.";
            }
            else {
                settings.nailgunServerJar = envVar;
            }
        }
    }
    if (error) {
        connection.sendNotification({ method: "InvalidSettings" }, "Settings: " + error);
        return;
    }
    backend = backends[0];
    //startNailgun if it is not already running:
    if (!nailgunProcess) {
        startNailgunServer();
    }
});
function log(message) {
    connection.console.log("S: " + message);
}
function error(message) {
    connection.console.error("S: " + message);
}
function logWithOrigin(origin, message) {
    log(origin + ": " + message);
}
var verificationRunning = false;
var wrongFormat = false;
var diagnostics;
var verifierProcess;
var nailgunProcess;
var nailgunReady = false;
var backend;
var settings;
var nailgunPort = "7654";
// connection.onNotification({ method: 'startNailgun' }, () => {
//     startNailgunServer();
// })
// connection.onNotification({ method: 'stopNailgun' }, () => {
//     stopNailgunServer();
// })
function startNailgunServer() {
    if (!nailgunProcess) {
        var killOldNailgunProcess = child_process.exec('ng --nailgun-port ' + nailgunPort + ' ng-stop');
        killOldNailgunProcess.on('exit', function (code, signal) {
            log('starting nailgun server');
            //start the nailgun server for both silicon and carbon
            var backendJars = "";
            settings.verificationBackends.forEach(function (backend) {
                backendJars = backendJars + ";" + backend.path; //TODO: for unix it is : instead of ;
            });
            var command = 'java -cp ' + settings.nailgunServerJar + backendJars + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + nailgunPort;
            log(command);
            verifierProcess = child_process.exec(command);
            verifierProcess.stdout.on('data', function (data) {
                logWithOrigin('NS', data);
            });
        });
        var jvmStarterProcess = doVerify("", false, false);
        jvmStarterProcess.on('exit', function (code, signal) {
            nailgunReady = true;
        });
    }
    else {
        log('nailgun server already running');
    }
}
function stopNailgunServer() {
    if (nailgunProcess) {
        log('shutting down nailgun server');
        nailgunProcess.kill('SIGINT');
    }
}
function doVerify(fileToVerify, ideMode, onlyTypeCheck) {
    return child_process.exec('ng --nailgun-port ' + nailgunPort + ' ' + backend.mainMethod + ' --ideMode ' + fileToVerify); // to set current working directory use, { cwd: verifierHome } as an additional parameter
}
function doVerifyWithContent(fileToVerify, fileContent, ideMode, onlyTypeCheck) {
    fileContent = encodeURIComponent(fileContent);
    var command = 'ng --nailgun-port ' + nailgunPort + ' ' + backend.mainMethod + ' --ideMode --fileContent "' + fileContent + '" ' + fileToVerify;
    log(command);
    return child_process.exec(command); // to set current working directory use, { cwd: verifierHome } as an additional parameter
}
function resetDiagnostics(uri) {
    diagnostics = [];
    //reset diagnostics
    connection.sendDiagnostics({ uri: uri, diagnostics: diagnostics });
}
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function verifyTextDocument(uri, onlyTypeCheck) {
    verificationRunning = true;
    //Initialization
    resetDiagnostics(uri);
    wrongFormat = false;
    log(backend.name + ' verification startet');
    connection.sendNotification({ method: "VerificationStart" });
    var path = uriToPath(uri);
    //start verification of current file
    var currfile = '"' + path + '"';
    //let content: string = fs.readFileSync(path).toString();
    verifierProcess = doVerify(currfile, true, onlyTypeCheck);
    var time = "0";
    verifierProcess.stdout.on('data', function (data) {
        //log('stdout: ' + data);
        if (wrongFormat) {
            return;
        }
        var stringData = data;
        var parts = stringData.split(/\r?\n/g);
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            if (part.startsWith("Command-line interface:")) {
                error('Could not start verification -> fix format');
                wrongFormat = true;
            }
            if (part.startsWith('Silicon finished in') || part.startsWith('carbon finished in')) {
                time = /.*?(\d*\.\d*).*/.exec(part)[1];
            }
            else if (part == 'No errors found.') {
                log('Successfully verified with ' + backend.name + ' in ' + time + ' seconds.');
                time = "0";
            }
            else if (part.startsWith('The following errors were found')) {
                log(backend.name + ': Verification failed after ' + time + ' seconds.');
                time = "0";
            }
            else if (part.startsWith('  ')) {
                var pos = /\s*(\d*):(\d*):\s(.*)/.exec(part);
                if (pos.length != 4) {
                    error('could not parse error description: "' + part + '"');
                    return;
                }
                var lineNr = +pos[1] - 1;
                var charNr = +pos[2] - 1;
                var message = pos[3].trim();
                diagnostics.push({
                    range: {
                        start: { line: lineNr, character: charNr },
                        end: { line: lineNr, character: 10000 } //Number.max does not work -> 10000 is an arbitrary large number that does the job
                    },
                    source: backend.name,
                    severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                    message: message
                });
            }
        }
    });
    verifierProcess.stderr.on('data', function (data) {
        error("stderr: " + data);
        if (data.startsWith("connect: No error")) {
            connection.sendNotification({ method: "Hint" }, "No Nailgun server is running on port " + nailgunPort);
        }
        if (data.startsWith("java.lang.ClassNotFoundException:")) {
            connection.sendNotification({ method: "Hint" }, "Class " + backend.mainMethod + " is unknown to Nailgun");
        }
    });
    verifierProcess.on('close', function (code) {
        log("Child process exited with code " + code);
        // Send the computed diagnostics to VSCode.
        connection.sendDiagnostics({ uri: uri, diagnostics: diagnostics });
        connection.sendNotification({ method: "VerificationEnd" }, diagnostics.length == 0);
        verificationRunning = false;
    });
}
function abortVerification() {
    error('abort running verification');
    if (!verificationRunning) {
        error('cannot abort, verification is not running.');
        return;
    }
    //remove impact of child_process to kill
    verifierProcess.removeAllListeners('close');
    verifierProcess.stdout.removeAllListeners('data');
    verifierProcess.stderr.removeAllListeners('data');
    //log the exit of the child_process to kill
    verifierProcess.on('exit', function (code, signal) {
        log("Child process exited with code " + code + " and signal " + signal);
    });
    verifierProcess.kill('SIGINT');
    var l = verifierProcess.listeners;
    verificationRunning = false;
}
connection.onDidChangeWatchedFiles(function (change) {
    // Monitored files have change in VSCode
    log('We recevied an file change event');
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
//     //log('onCompletionResolve');
//     if (item.data === 1) {
//         item.detail = 'add an invariant',
//             item.documentation = 'The invariant needs to hold before and after the loop body'
//     }
//     return item;
// });
connection.onDidOpenTextDocument(function (params) {
    // A text document got opened in VSCode.
    // params.uri uniquely identifies the document. For documents store on disk this is a file URI.
    // params.text the initial full content of the document.
    var doc = params.textDocument;
    log(params.textDocument.uri + " opened.");
});
connection.onDidChangeTextDocument(function (params) {
    // The content of a text document did change in VSCode.
    // params.uri uniquely identifies the document.
    // params.contentChanges describe the content changes to the document.
    //log(`${params.uri} changed: ${JSON.stringify(params.contentChanges)}`);
    //let doc = params.textDocument;
    //startOrRestartVerification(params.textDocument.uri, true);
    resetDiagnostics(params.textDocument.uri);
});
connection.onDidCloseTextDocument(function (params) {
    // A text document got closed in VSCode.
    // params.uri uniquely identifies the document.
    log(params.textDocument.uri + " closed.");
});
connection.onDidSaveTextDocument(function (params) {
    var doc = params.textDocument;
    startOrRestartVerification(params.textDocument.uri, false);
});
function startOrRestartVerification(uri, onlyTypeCheck) {
    if (!nailgunReady) {
        log("nailgun not ready yet");
        return;
    }
    if (verificationRunning) {
        log("verification already running -> abort and restart.");
        abortVerification();
    }
    verifyTextDocument(uri, onlyTypeCheck);
}
// Listen on the connection
connection.listen();
function readZ3LogFile(path) {
    var res = new Array();
    if (!fs.existsSync(path)) {
        error("cannot find log file at: " + path);
        return;
    }
    var content = fs.readFileSync(path, "utf8").split(/\n(?!\s)/g);
    for (var i = 0; i < content.length; i++) {
        var line = content[i].replace("\n", "").trim();
        if (line == '') {
            continue;
        }
        var prefix = ';';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry_1.LogEntry(LogEntry_1.LogType.Comment, line.substring(prefix.length)));
            continue;
        }
        prefix = '(push)';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry_1.LogEntry(LogEntry_1.LogType.Push, line.substring(prefix.length)));
            continue;
        }
        prefix = '(pop)';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry_1.LogEntry(LogEntry_1.LogType.Pop, line.substring(prefix.length)));
            continue;
        }
        prefix = '(set-option';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry_1.LogEntry(LogEntry_1.LogType.SetOption, line));
            continue;
        }
        prefix = '(declare-const';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry_1.LogEntry(LogEntry_1.LogType.DeclareConst, line));
            continue;
        }
        prefix = '(declare-fun';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry_1.LogEntry(LogEntry_1.LogType.DeclareFun, line));
            continue;
        }
        prefix = '(declare-datatypes';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry_1.LogEntry(LogEntry_1.LogType.DeclareDatatypes, line));
            continue;
        }
        prefix = '(declare-sort';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry_1.LogEntry(LogEntry_1.LogType.DeclareSort, line));
            continue;
        }
        prefix = '(define-const';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry_1.LogEntry(LogEntry_1.LogType.DefineConst, line));
            continue;
        }
        prefix = '(define-fun';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry_1.LogEntry(LogEntry_1.LogType.DefineFun, line));
            continue;
        }
        prefix = '(define-datatypes';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry_1.LogEntry(LogEntry_1.LogType.DefineDatatypes, line));
            continue;
        }
        prefix = '(define-sort';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry_1.LogEntry(LogEntry_1.LogType.DefineSort, line));
            continue;
        }
        prefix = '(assert';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry_1.LogEntry(LogEntry_1.LogType.Assert, line));
            continue;
        }
        prefix = '(check-sat)';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry_1.LogEntry(LogEntry_1.LogType.CheckSat, line.substring(prefix.length)));
            continue;
        }
        prefix = '(get-info';
        if (line.startsWith(prefix)) {
            res.push(new LogEntry_1.LogEntry(LogEntry_1.LogType.GetInfo, line));
            continue;
        }
        error("unknown log-entry-type detected: " + line);
    }
    return res;
}
function uriToPath(uri) {
    if (!uri.startsWith("file:")) {
        error("cannot convert uri to filepath, uri: " + uri);
    }
    uri = uri.replace("\%3A", ":");
    uri = uri.replace("file:\/\/\/", "");
    uri = uri.replace("\%20", " ");
    return uri;
}
//# sourceMappingURL=server.js.map