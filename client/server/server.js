'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
var fs = require('fs');
var vscode_languageserver_1 = require('vscode-languageserver');
var LogEntry_1 = require('./LogEntry');
var Log_1 = require('./Log');
var Settings_1 = require('./Settings');
var NailgunService_1 = require('./NailgunService');
var VerificationTask_1 = require('./VerificationTask');
// Create a connection for the server. The connection uses Node's IPC as a transport
var connection = vscode_languageserver_1.createConnection(new vscode_languageserver_1.IPCMessageReader(process), new vscode_languageserver_1.IPCMessageWriter(process));
var backend;
var documents = new vscode_languageserver_1.TextDocuments();
var verificationTasks = new Map();
var nailgunService;
var settings;
var workspaceRoot;
documents.listen(connection);
//starting point (executed once)
connection.onInitialize(function (params) {
    Log_1.Log.connection = connection;
    Log_1.Log.log("connected");
    workspaceRoot = params.rootPath;
    nailgunService = new NailgunService_1.NailgunService();
    nailgunService.startNailgunIfNotRunning();
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
    nailgunService.stopNailgunServer();
});
// The settings have changed. Is sent on server activation as well.
connection.onDidChangeConfiguration(function (change) {
    Log_1.Log.log('configuration changed');
    settings = change.settings.iveSettings;
    var backends = settings.verificationBackends;
    //pass the new settings to the verificationService
    nailgunService.changeSettings(settings);
    var error = Settings_1.Settings.valid(backends);
    if (!error) {
        if (!settings.nailgunServerJar || settings.nailgunServerJar.length == 0) {
            error = "Path to nailgun server jar is missing";
        }
        else {
            var envVar = Settings_1.Settings.extractEnvVar(settings.nailgunServerJar);
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
    //TODO: decide whether to restart Nailgun or not
});
connection.onDidChangeWatchedFiles(function (change) {
    // Monitored files have change in VSCode
    Log_1.Log.error("TODO: never happened before: We recevied an file change event");
});
connection.onDidOpenTextDocument(function (params) {
    var uri = params.textDocument.uri;
    if (!verificationTasks.has(uri)) {
        //create new task for opened file
        var task = new VerificationTask_1.VerificationTask(uri, nailgunService, connection, backend);
        verificationTasks.set(uri, task);
    }
    Log_1.Log.log(uri + " opened, task created");
});
connection.onDidCloseTextDocument(function (params) {
    var uri = params.textDocument.uri;
    if (!verificationTasks.has(uri)) {
        //remove no longer needed task
        verificationTasks.delete(uri);
    }
    Log_1.Log.log(params.textDocument.uri + " closed, task deleted");
});
connection.onDidChangeTextDocument(function (params) {
    //reset the diagnostics for the changed file
    resetDiagnostics(params.textDocument.uri);
});
connection.onDidSaveTextDocument(function (params) {
    if (params.textDocument.uri.endsWith(".sil")) {
        startOrRestartVerification(params.textDocument.uri, false);
    }
    else {
        Log_1.Log.log("This system can only verify .sil files");
    }
});
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
// Listen on the connection
connection.listen();
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
function readZ3LogFile(path) {
    var res = new Array();
    if (!fs.existsSync(path)) {
        Log_1.Log.error("cannot find log file at: " + path);
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
        Log_1.Log.error("unknown log-entry-type detected: " + line);
    }
    return res;
}
//# sourceMappingURL=server.js.map