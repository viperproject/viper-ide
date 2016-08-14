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
import {HeapGraph, Backend, ViperSettings, Commands, VerificationState, VerifyRequest, LogLevel, ShowHeapParams} from './ViperProtocol'
import {NailgunService} from './NailgunService';
import {VerificationTask} from './VerificationTask';
import {Statement, StatementType} from './Statement';
import {Model} from './Model';
import {DebugServer} from './DebugServer';
import {Server} from './ServerClass';
var ipc = require('node-ipc');

// Create a connection for the server. The connection uses Node's IPC as a transport
Server.connection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
Server.documents.listen(Server.connection);

registerHandlers();

// Listen on the connection
Server.connection.listen();

//let count =0;

function registerHandlers() {
    //starting point (executed once)
    Server.connection.onInitialize((params): InitializeResult => {
        DebugServer.initialize();

        Server.workspaceRoot = params.rootPath;
        Server.nailgunService = new NailgunService();
        return {
            capabilities: {
                // Tell the client that the server works in FULL text document sync mode
                //textDocumentSync: Server.documents.syncKind,
                // Tell the client that the server support code complete
                // completionProvider: {
                //     resolveProvider: true
                // }
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
        try {
            Settings.settings = <ViperSettings>change.settings.viperSettings;
            Log.logLevel = Settings.settings.logLevel;
            //after this line, Logging works

            //Log.log("New configuration: "+JSON.stringify(change));

            Log.log('configuration changed' + (++Server.count), LogLevel.Info);
            //check settings
            let error = Settings.checkSettings(Settings.settings);
            if (error) {
                Server.connection.sendNotification(Commands.InvalidSettings, error);
                return;
            }

            Log.log("The settings are ok", LogLevel.Info);

            //pass the new settings to the verificationService and the Log
            Server.nailgunService.changeSettings(Settings.settings);

            restartBackendIfNeeded();
        } catch (e) {
            Log.error("Error handling configuration change: " + e);
        }
    });

    Server.connection.onRequest(Commands.SelectBackend, (selectedBackend: string) => {
        if (!Settings.settings.valid) {
            Server.connection.sendNotification(Commands.InvalidSettings, "Cannot start backend, fix settings first.");
            return;
        }
        if (selectedBackend) {
            Settings.selectedBackend = selectedBackend;
        }
        restartBackendIfNeeded();
    });

    Server.connection.onRequest(Commands.RequestBackendNames, args => {
        let backendNames: string[] = Settings.getBackendNames(Settings.settings);
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
            //notify client;
            Server.connection.sendNotification(Commands.FileOpened, params.textDocument.uri);
            if (!Server.verificationTasks.has(uri)) {
                //create new task for opened file
                let task = new VerificationTask(uri, Server.nailgunService, Server.connection);
                Server.verificationTasks.set(uri, task);
                //Log.log(`${uri} opened, task created`, LogLevel.Debug);
                if (Server.nailgunService.ready) {
                    // Log.log("Opened Text Document", LogLevel.Debug);
                    // startOrRestartVerification(uri, false, false);
                }
            }
        }
    });

    Server.connection.onDidCloseTextDocument((params) => {
        if (Server.isViperSourceFile(params.textDocument.uri)) {
            let uri = params.textDocument.uri;
            //notify client;
            Server.connection.sendNotification(Commands.FileClosed, uri);
            if (Server.verificationTasks.has(uri)) {
                //remove no longer needed task
                Server.verificationTasks.delete(uri);
                //Log.log(`${params.textDocument.uri} closed, task deleted`, LogLevel.Debug);
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
        Server.connection.sendNotification(Commands.StateChange, { newState: VerificationState.Ready, verificationCompleted: false, verificationNeeded: false, uri: uri });
    });

    Server.connection.onRequest(Commands.ShowHeap, (params: ShowHeapParams) => {
        try {
            let task = Server.verificationTasks.get(params.uri);
            if (!task) {
                Log.error("No verificationTask found for " + params.uri);
                return;
            }
            Server.showHeap(task, params.index);
            //DebugServer.moveDebuggerToPos(task.steps[params.index].position);
        } catch (e) {
            Log.error("Error showing heap: " + e);
        }
    });
}

function resetDiagnostics(uri: string) {
    let task = Server.verificationTasks.get(uri);
    if (!task) {
        Log.error("no verification Task for file: " + uri);
        return;
    }
    task.resetDiagnostics();
}

function restartBackendIfNeeded() {
    let newBackend = Settings.autoselectBackend(Settings.settings);
    //only restart the backend after settings changed if the active backend was affected
    if (!Settings.backendEquals(Server.backend, newBackend)) {
        Log.log(`Change Backend: from ${Server.backend?Server.backend.name:"No Backend"} to ${newBackend?newBackend.name:"No Backend"}`)
        Server.backend = newBackend;
        //stop all running verifications
        Server.nailgunService.restartNailgunServer(Server.connection, Server.backend);
    } else {
        Log.log("No need to restart backend. The setting changes did not affect it.")
        Server.backend = newBackend;
    }
}

function startOrRestartVerification(uri: string, onlyTypeCheck: boolean, manuallyTriggered: boolean) {
    Log.log("start or restart verification",LogLevel.Info);
    //only verify if the settings are right
    if (!Settings.settings.valid) {
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
        Log.log("no backend has been selected, the first was picked by default.", LogLevel.Debug);
        Server.backend = Settings.settings.verificationBackends[0];
        Server.nailgunService.startNailgunIfNotRunning(Server.connection, Server.backend);
    }
    if (!Server.nailgunService.ready) {
        if (manuallyTriggered)
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