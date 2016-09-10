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
import {BackendReadyParams, StatementType, HeapGraph, Backend, ViperSettings, Commands, VerificationState, VerifyRequest, LogLevel, ShowHeapParams} from './ViperProtocol'
import {NailgunService} from './NailgunService';
import {VerificationTask} from './VerificationTask';
import {Statement} from './Statement';
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

function registerHandlers() {
    //starting point (executed once)
    Server.connection.onInitialize((params): InitializeResult => {
        try {
            DebugServer.initialize();

            Server.workspaceRoot = params.rootPath;
            Server.nailgunService = new NailgunService();
            return {
                capabilities: {}
            }
        } catch (e) {
            Log.error("Error handling initialize request: " + e);
        }
    });

    Server.connection.onShutdown(() => {
        try {
            Log.log("On Shutdown", LogLevel.Debug);
            Server.nailgunService.stopNailgunServer();
        } catch (e) {
            Log.error("Error handling shutdown: " + e);
        }
    })

    Server.connection.onDidChangeConfiguration((change) => {
        try {
            Settings.settings = <ViperSettings>change.settings.viperSettings;
            Log.logLevel = Settings.settings.logLevel;
            //after this line, Logging works

            Log.log('Configuration changed', LogLevel.Info);
            Settings.checkSettings(Settings.settings);
            if (Settings.valid()) {
                //pass the new settings to the verificationService
                Server.nailgunService.changeSettings(Settings.settings);

                restartBackendIfNeeded();
            }
        } catch (e) {
            Log.error("Error handling configuration change: " + e);
        }
    });

    Server.connection.onNotification(Commands.StartBackend, (selectedBackend: string) => {
        try {
            if (!selectedBackend || selectedBackend.length == 0) {
                Log.log("No backend was chosen, don't restart backend", LogLevel.Debug);
            } else if (Settings.valid()) {
                Settings.selectedBackend = selectedBackend;
                restartBackendIfNeeded();
            }
        } catch (e) {
            Log.error("Error handling select backend request: " + e);
        }
    });

    //returns the a list of all backend names
    Server.connection.onRequest(Commands.RequestBackendNames, () => {
        return new Promise((resolve, reject) => {
            try {
                let backendNames: string[] = Settings.getBackendNames(Settings.settings);
                if (!backendNames) {
                    reject("No backend found");
                }
                else {
                    resolve(backendNames);
                }
            } catch (e) {
                reject("Error handling backend names request: " + e);
            }
        });
    });

    Server.connection.onDidOpenTextDocument((params) => {
        try {
            if (Server.isViperSourceFile(params.textDocument.uri)) {
                let uri = params.textDocument.uri;
                //notify client;
                Server.sendFileOpenedNotification(params.textDocument.uri);
                if (!Server.verificationTasks.has(uri)) {
                    //create new task for opened file
                    let task = new VerificationTask(uri, Server.nailgunService);
                    Server.verificationTasks.set(uri, task);
                }
            }
        } catch (e) {
            Log.error("Error handling TextDocument openend");
        }
    });

    Server.connection.onDidCloseTextDocument((params) => {
        try {
            if (Server.isViperSourceFile(params.textDocument.uri)) {
                let uri = params.textDocument.uri;
                //notify client;
                Server.sendFileClosedNotification(uri);
                if (Server.verificationTasks.has(uri)) {
                    //remove no longer needed task
                    Server.verificationTasks.delete(uri);
                }
            }
        } catch (e) {
            Log.error("Error handling TextDocument closed");
        }
    });

    Server.connection.onNotification(Commands.Verify, (data: VerifyRequest) => {
        try {
            let verificationstarted = false;
            //it does not make sense to reverify if no changes were made and the verification is already running
            let alreadyRunning = Server.verificationTasks.get(data.uri).running;
            if (!alreadyRunning) {
                Settings.workspace = data.workspace;
                verificationstarted = startOrRestartVerification(data.uri, data.manuallyTriggered);
            }
            if (!verificationstarted) {
                Server.sendVerificationNotStartedNotification(data.uri);
            }
        } catch (e) {
            Log.error("Error handling verify request: " + e);
            Server.sendVerificationNotStartedNotification(data.uri);
        }
    });

    Server.connection.onRequest(Commands.Dispose, (lineNumber) => {
        try {
            Server.nailgunService.stopNailgunServer();
            Server.nailgunService.killNgDeamon();
            return null;
        } catch (e) {
            Log.error("Error handling dispose request: " + e);
        }
    });

    Server.connection.onNotification(Commands.StopVerification, (uri: string) => {
        try {
            let task = Server.verificationTasks.get(uri);
            task.abortVerification();
            Server.sendStateChangeNotification({
                newState: VerificationState.Ready,
                verificationCompleted: false,
                verificationNeeded: false,
                uri: uri
            });
        } catch (e) {
            Log.error("Error handling stop verification request: " + e);
        }
    });

    Server.connection.onNotification(Commands.StopDebugging, () => {
        try {
            DebugServer.stopDebugging();
        } catch (e) {
            Log.error("Error handling stop debugging request: " + e);
        }
    })

    Server.connection.onRequest(Commands.ShowHeap, (params: ShowHeapParams) => {
        try {
            let task = Server.verificationTasks.get(params.uri);
            if (!task) {
                Log.error("No verificationTask found for " + params.uri);
                return;
            }
            Server.showHeap(task, params.clientIndex);
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
        Log.log(`Change Backend: from ${Server.backend ? Server.backend.name : "No Backend"} to ${newBackend ? newBackend.name : "No Backend"}`, LogLevel.Info)
        Server.backend = newBackend;
        Server.verificationTasks.forEach(task => task.resetLastSuccess());
        Server.nailgunService.startOrRestartNailgunServer(Server.backend,true);
    } else {
        Log.log("No need to restart backend. It's still the same", LogLevel.Debug)
        Server.backend = newBackend;
        Server.sendBackendReadyNotification({ name: Server.backend.name, restarted: false });
    }
}

function startOrRestartVerification(uri: string, manuallyTriggered: boolean): boolean {

    //only verify viper source code files
    if (!Server.isViperSourceFile(uri)) {
        Log.hint("Only viper source files can be verified.");
        return false;
    }

    if (!Server.nailgunService.isReady()) {
        if (manuallyTriggered)
            Log.hint("The verification backend is not ready yet");
        return false;
    }

    //check if there is already a verification task for that file
    let task = Server.verificationTasks.get(uri);
    if (!task) {
        Log.error("No verification task found for file: " + uri);
        return false;
    }

    Log.log("start or restart verification", LogLevel.Info);
    //stop all other verifications because the backend crashes if multiple verifications are run in parallel
    Server.verificationTasks.forEach(task => { task.abortVerification(); });
    //start verification
    Server.executedStages = [];
    return task.verify(manuallyTriggered);
}