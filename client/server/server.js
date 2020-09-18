/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode_languageserver_1 = require("vscode-languageserver");
const Log_1 = require("./Log");
const Settings_1 = require("./Settings");
const ViperProtocol_1 = require("./ViperProtocol");
const VerificationTask_1 = require("./VerificationTask");
const DebugServer_1 = require("./DebugServer");
const ServerClass_1 = require("./ServerClass");
const ViperServerService_1 = require("./ViperServerService");
// Create a connection for the server. The connection uses Node's IPC as a transport
ServerClass_1.Server.connection = vscode_languageserver_1.createConnection(new vscode_languageserver_1.IPCMessageReader(process), new vscode_languageserver_1.IPCMessageWriter(process));
ServerClass_1.Server.documents.listen(ServerClass_1.Server.connection);
registerHandlers();
// Listen on the connection
ServerClass_1.Server.connection.listen();
function registerHandlers() {
    //starting point (executed once)
    ServerClass_1.Server.connection.onInitialize((params) => {
        try {
            Log_1.Log.log("Debug Server is initializing", ViperProtocol_1.LogLevel.LowLevelDebug);
            DebugServer_1.DebugServer.initialize();
            return {
                capabilities: {
                    documentSymbolProvider: true,
                    definitionProvider: true
                }
            };
        }
        catch (e) {
            Log_1.Log.error("Error handling initialize request: " + e);
        }
    });
    ServerClass_1.Server.connection.onShutdown(() => {
        try {
            Log_1.Log.log("On Shutdown", ViperProtocol_1.LogLevel.Debug);
            ServerClass_1.Server.backendService.stop();
        }
        catch (e) {
            Log_1.Log.error("Error handling shutdown: " + e);
        }
    });
    ServerClass_1.Server.connection.onDidChangeConfiguration((change) => {
        try {
            Log_1.Log.log('Configuration changed', ViperProtocol_1.LogLevel.Info);
            let oldSettings = Settings_1.Settings.settings;
            Settings_1.Settings.settings = change.settings.viperSettings;
            Log_1.Log.logLevel = Settings_1.Settings.settings.preferences.logLevel; //after this line, Logging works
            ServerClass_1.Server.refreshEndings();
            Settings_1.Settings.initiateBackendRestartIfNeeded(oldSettings);
        }
        catch (e) {
            Log_1.Log.error("Error handling configuration change: " + e);
        }
    });
    ServerClass_1.Server.connection.onDidChangeTextDocument((change) => {
        let task = ServerClass_1.Server.verificationTasks.get(change.textDocument.uri.toString());
        if (task) {
            task.symbolInformation = [];
            task.definitions = [];
        }
    });
    /**
     * Relevant bit of documentation:
     * https://github.com/Microsoft/language-server-protocol/blob/master/versions/protocol-2-x.md#document-symbols-request
     */
    ServerClass_1.Server.connection.onRequest('textDocument/documentSymbol', (args) => {
        return new Promise((resolve, reject) => {
            let task = ServerClass_1.Server.verificationTasks.get(args.textDocument.uri.toString());
            if (task) {
                resolve(task.symbolInformation);
            }
            else {
                // No task found - maybe the task has not been created yet. 
                resolve([]);
            }
        });
    });
    /**
     * Relevant bit of documentation:
     * https://github.com/Microsoft/language-server-protocol/blob/master/versions/protocol-2-x.md#goto-definition-request
     */
    ServerClass_1.Server.connection.onRequest('textDocument/definition', (args) => {
        Log_1.Log.log(`Handling definitions request for args: ` + JSON.stringify(args), ViperProtocol_1.LogLevel.Debug);
        return new Promise((resolve, reject) => {
            let document = args.textDocument;
            let pos = args.position;
            let task = ServerClass_1.Server.verificationTasks.get(document.uri.toString());
            if (task) {
                Log_1.Log.log(`Found verification task for URI ` + document.uri, ViperProtocol_1.LogLevel.LowLevelDebug);
                ServerClass_1.Server.connection.sendRequest(ViperProtocol_1.Commands.GetIdentifier, pos).then((word) => {
                    Log_1.Log.log(`Got word: ` + word, ViperProtocol_1.LogLevel.LowLevelDebug);
                    task.definitions.forEach(def => {
                        if (def.scope == null //global scope
                            || (ViperProtocol_1.Common.comparePosition(def.scope.start, pos) <= 0 && ViperProtocol_1.Common.comparePosition(def.scope.end, pos) >= 0)) // in scope
                         {
                            if (word == def.name) {
                                resolve({ uri: document.uri.toString(), range: def.location });
                            }
                        }
                    });
                    // No definition found - maybe it's a keyword.
                    resolve([]);
                });
            }
            else {
                let e = `Verification task not found for URI (` + document.uri + `)`;
                Log_1.Log.error(e);
                reject(e);
            }
        });
    });
    ServerClass_1.Server.connection.onNotification(ViperProtocol_1.Commands.StartBackend, (selectedBackend) => {
        try {
            if (!selectedBackend || selectedBackend.length == 0) {
                Log_1.Log.log("No backend was chosen, don't restart backend", ViperProtocol_1.LogLevel.Debug);
            }
            else {
                checkSettingsAndStartServer(selectedBackend);
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling select backend request: " + e);
        }
    });
    ServerClass_1.Server.connection.onNotification(ViperProtocol_1.Commands.StopBackend, () => {
        try {
            ServerClass_1.Server.backendService.stop();
        }
        catch (e) {
            Log_1.Log.error("Error handling stop backend request: " + e);
        }
    });
    ServerClass_1.Server.connection.onNotification(ViperProtocol_1.Commands.SwapBackend, (backendName) => {
        try {
            ServerClass_1.Server.backendService.swapBackend(Settings_1.Settings.getBackend(backendName));
        }
        catch (e) {
            Log_1.Log.error("Error handling swap backend request: " + e);
        }
    });
    //returns the a list of all backend names
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.RequestBackendNames, () => {
        return new Promise((resolve, reject) => {
            try {
                let backendNames = Settings_1.Settings.getBackendNames(Settings_1.Settings.settings);
                if (!backendNames) {
                    reject("No backend found");
                }
                else {
                    resolve(backendNames);
                }
            }
            catch (e) {
                reject("Error handling backend names request: " + e);
            }
        });
    });
    ServerClass_1.Server.connection.onDidOpenTextDocument((params) => {
        try {
            ServerClass_1.Server.isViperSourceFile(params.textDocument.uri).then(res => {
                if (res) {
                    let uri = params.textDocument.uri;
                    //notify client;
                    ServerClass_1.Server.sendFileOpenedNotification(params.textDocument.uri);
                    if (!ServerClass_1.Server.verificationTasks.has(uri)) {
                        //create new task for opened file
                        let task = new VerificationTask_1.VerificationTask(uri);
                        ServerClass_1.Server.verificationTasks.set(uri, task);
                    }
                }
            });
        }
        catch (e) {
            Log_1.Log.error("Error handling TextDocument openend");
        }
    });
    ServerClass_1.Server.connection.onDidCloseTextDocument((params) => {
        try {
            let uri = params.textDocument.uri;
            ServerClass_1.Server.isViperSourceFile(uri).then(isViperFile => {
                if (isViperFile) {
                    //notify client;
                    ServerClass_1.Server.sendFileClosedNotification(uri);
                }
            });
        }
        catch (e) {
            Log_1.Log.error("Error handling TextDocument closed");
        }
    });
    ServerClass_1.Server.connection.onNotification(ViperProtocol_1.Commands.FileClosed, (uri) => {
        if (ServerClass_1.Server.verificationTasks.has(uri)) {
            //remove no longer needed task
            let task = ServerClass_1.Server.verificationTasks.get(uri);
            task.resetDiagnostics();
            ServerClass_1.Server.verificationTasks.delete(uri);
        }
    });
    ServerClass_1.Server.connection.onNotification(ViperProtocol_1.Commands.Verify, (data) => {
        try {
            let verificationstarted = false;
            //it does not make sense to reverify if no changes were made and the verification is already running
            if (canVerificationBeStarted(data.uri, data.manuallyTriggered)) {
                Settings_1.Settings.workspace = data.workspace;
                Log_1.Log.log("start or restart verification", ViperProtocol_1.LogLevel.Info);
                //stop all other verifications because the backend crashes if multiple verifications are run in parallel
                VerificationTask_1.VerificationTask.stopAllRunningVerifications().then(success => {
                    //start verification
                    ServerClass_1.Server.executedStages = [];
                    verificationstarted = ServerClass_1.Server.verificationTasks.get(data.uri).verify(data.manuallyTriggered) === true;
                    if (!verificationstarted) {
                        ServerClass_1.Server.sendVerificationNotStartedNotification(data.uri);
                    }
                }, () => {
                    ServerClass_1.Server.sendVerificationNotStartedNotification(data.uri);
                });
            }
            else {
                Log_1.Log.log("The verification cannot be started.", ViperProtocol_1.LogLevel.Info);
                ServerClass_1.Server.sendVerificationNotStartedNotification(data.uri);
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling verify request: " + e);
            ServerClass_1.Server.sendVerificationNotStartedNotification(data.uri);
        }
    });
    ServerClass_1.Server.connection.onNotification(ViperProtocol_1.Commands.UpdateViperTools, () => {
        ServerClass_1.Server.updateViperTools(false);
    });
    ServerClass_1.Server.connection.onNotification(ViperProtocol_1.Commands.FlushCache, (file) => {
        if (ServerClass_1.Server.backendService.isViperServerService) {
            ServerClass_1.Server.backendService.flushCache(file).catch((e) => {
                Log_1.Log.error("Error flushing cache: " + e);
            });
        }
    });
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.Dispose, () => {
        return new Promise((resolve, reject) => {
            try {
                //if there are running verifications, stop related processes
                ServerClass_1.Server.verificationTasks.forEach(task => {
                    if (task.running) {
                        //Todo[ATG_6.10.2017]: use UIDs for logging verification tasks.
                        Log_1.Log.log("stop verification of " + task.filename, ViperProtocol_1.LogLevel.Default);
                        ServerClass_1.Server.backendService.stopVerification();
                    }
                });
                console.log("dispose language server");
                ServerClass_1.Server.backendService.kill();
                resolve();
            }
            catch (e) {
                Log_1.Log.error("Error handling dispose request: " + e);
                reject();
            }
        });
    });
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.GetExecutionTrace, (params) => {
        Log_1.Log.log("Generate execution trace for client state " + params.clientState, ViperProtocol_1.LogLevel.Debug);
        return new Promise((resolve, reject) => {
            let result = [];
            try {
                let task = ServerClass_1.Server.verificationTasks.get(params.uri);
                let serverState = task.clientStepIndexToServerStep[params.clientState];
                let maxDepth = serverState.depthLevel();
                let dark = Settings_1.Settings.settings.advancedFeatures.darkGraphs === true;
                if (!Settings_1.Settings.settings.advancedFeatures.simpleMode) {
                    //ADVANCED MODE ONLY
                    //get stateExpansion states
                    serverState.verifiable.forAllExpansionStatesWithDecoration(serverState, (child) => {
                        result.push({
                            state: child.decorationOptions.index,
                            color: ViperProtocol_1.StateColors.uninterestingState(dark),
                            showNumber: true
                        });
                    });
                    //get top level statements
                    serverState.verifiable.getTopLevelStatesWithDecoration().forEach(child => {
                        result.push({
                            state: child.decorationOptions.index,
                            color: ViperProtocol_1.StateColors.uninterestingState(dark),
                            showNumber: true
                        });
                    });
                }
                //BOTH SIMPLE AND ANVANCED MODE
                //get executionTrace of serverState
                while (true) {
                    let depth = serverState.depthLevel();
                    if (serverState.canBeShownAsDecoration && depth <= maxDepth) {
                        maxDepth = depth;
                        result.push({
                            state: serverState.decorationOptions.index,
                            color: ViperProtocol_1.StateColors.interestingState(dark),
                            showNumber: true
                        }); //push client state
                    }
                    if (serverState.isBranch()) {
                        serverState = serverState.parent;
                    }
                    else if (!serverState.parent) {
                        break;
                    }
                    else {
                        serverState = task.steps[serverState.index - 1];
                    }
                    task.shownExecutionTrace = result;
                }
                resolve(result);
            }
            catch (e) {
                Log_1.Log.error("Error handling Execution Trace Request: " + e);
                resolve(result);
            }
        });
    });
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.StopVerification, (uri) => {
        return new Promise((resolve, reject) => {
            try {
                let task = ServerClass_1.Server.verificationTasks.get(uri);
                if (task) {
                    task.abortVerificationIfRunning().then((success) => {
                        ServerClass_1.Server.sendStateChangeNotification({
                            newState: ViperProtocol_1.VerificationState.Ready,
                            verificationCompleted: false,
                            verificationNeeded: false,
                            uri: uri
                        }, task);
                        resolve(success);
                    });
                }
            }
            catch (e) {
                Log_1.Log.error("Error handling stop verification request (critical): " + e);
                resolve(false);
            }
        });
    });
    ServerClass_1.Server.connection.onNotification(ViperProtocol_1.Commands.StopDebugging, () => {
        try {
            DebugServer_1.DebugServer.stopDebugging();
        }
        catch (e) {
            Log_1.Log.error("Error handling stop debugging request: " + e);
        }
    });
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.ShowHeap, (params) => {
        try {
            let task = ServerClass_1.Server.verificationTasks.get(params.uri);
            if (!task) {
                Log_1.Log.error("No verificationTask found for " + params.uri);
                return;
            }
            ServerClass_1.Server.showHeap(task, params.clientIndex, params.isHeapNeeded);
        }
        catch (e) {
            Log_1.Log.error("Error showing heap: " + e);
        }
    });
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.RemoveDiagnostics, (uri) => {
        //Log.log("Trying to remove diagnostics from "+ uri);
        return new Promise((resolve, reject) => {
            if (ServerClass_1.Server.verificationTasks.has(uri)) {
                ServerClass_1.Server.verificationTasks.get(uri).resetDiagnostics();
                resolve(true);
            }
            else {
                resolve(false);
            }
        });
    });
    ServerClass_1.Server.connection.onRequest("GetViperServerUrl", () => {
        return new Promise((resolve, reject) => {
            if (ServerClass_1.Server.backendService instanceof ViperServerService_1.ViperServerService) {
                resolve(ServerClass_1.Server.backendService.getAddress());
            }
            else {
                reject("Not running with ViperServer backend");
            }
        });
    });
}
function canVerificationBeStarted(uri, manuallyTriggered) {
    //check if there is already a verification task for that file
    let task = ServerClass_1.Server.verificationTasks.get(uri);
    if (!task) {
        Log_1.Log.error("No verification task found for file: " + uri);
        return false;
    }
    else if (!ServerClass_1.Server.backendService.isReady()) {
        if (manuallyTriggered)
            Log_1.Log.hint("The verification backend is not ready yet");
        Log_1.Log.error("The verification backend is not ready yet");
        return false;
    }
    return true;
}
function checkSettingsAndStartServer(backendName) {
    let backend;
    Settings_1.Settings.checkSettings(false).then(() => {
        if (Settings_1.Settings.valid()) {
            backend = Settings_1.Settings.selectBackend(Settings_1.Settings.settings, backendName);
            if (backend) {
                changeBackendEngineIfNeeded(backend);
                return ServerClass_1.Server.backendService.start(backend);
            }
            else {
                Log_1.Log.error("cannot start backend " + backendName + ", no configuration found.");
                return false;
            }
        }
        else {
            return false;
        }
    }).then(success => {
        if (success) {
            ServerClass_1.Server.backendService.setReady(backend);
        }
        else {
            ServerClass_1.Server.backendService.setStopped();
            Log_1.Log.log("The ViperServer could not be started.", ViperProtocol_1.LogLevel.Debug);
        }
    }).catch(reason => {
        if (reason.startsWith("startupFailed")) {
            Log_1.Log.hint("The ViperServer startup failed, make sure the dependencies are not missing/conflicting.", true, true);
            Log_1.Log.error("ViperServer: " + reason);
            ServerClass_1.Server.backendService.setStopped();
            //prevent the timeout from happening
            ServerClass_1.Server.backendService.instanceCount++;
        }
        else {
            Log_1.Log.error("startViperServer failed: " + reason);
            ServerClass_1.Server.backendService.kill();
        }
    });
}
function changeBackendEngineIfNeeded(backend) {
    if (Settings_1.Settings.useViperServer(backend) && (!ServerClass_1.Server.backendService || !ServerClass_1.Server.backendService.isViperServerService)) {
        Log_1.Log.log("Start new ViperServerService", ViperProtocol_1.LogLevel.LowLevelDebug);
        if (ServerClass_1.Server.backendService.isSessionRunning) {
            Log_1.Log.error("A backend change should not happen during an active verification.");
        }
        ServerClass_1.Server.backendService = new ViperServerService_1.ViperServerService();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztJQU1JO0FBRUosWUFBWSxDQUFBOztBQUdaLDZEQUE2RDtBQUM3RCw4RUFBOEU7QUFFOUUsaUVBQTRKO0FBQzVKLCtCQUEyQjtBQUMzQix5Q0FBcUM7QUFDckMsbURBQW1LO0FBQ25LLHlEQUFxRDtBQUVyRCwrQ0FBMkM7QUFDM0MsK0NBQXNDO0FBQ3RDLDZEQUF5RDtBQUt6RCxvRkFBb0Y7QUFDcEYsb0JBQU0sQ0FBQyxVQUFVLEdBQUcsd0NBQWdCLENBQUMsSUFBSSx3Q0FBZ0IsQ0FBQyxPQUFPLENBQUMsRUFBRSxJQUFJLHdDQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFDbkcsb0JBQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLG9CQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7QUFFM0MsZ0JBQWdCLEVBQUUsQ0FBQztBQUVuQiwyQkFBMkI7QUFDM0Isb0JBQU0sQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUM7QUFFM0IsU0FBUyxnQkFBZ0I7SUFDckIsZ0NBQWdDO0lBQ2hDLG9CQUFNLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDLE1BQU0sRUFBb0IsRUFBRTtRQUN4RCxJQUFJO1lBQ0EsU0FBRyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsRUFBRSx3QkFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ2hFLHlCQUFXLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDekIsT0FBTztnQkFDSCxZQUFZLEVBQUU7b0JBQ1Ysc0JBQXNCLEVBQUUsSUFBSTtvQkFDNUIsa0JBQWtCLEVBQUUsSUFBSTtpQkFDM0I7YUFDSixDQUFBO1NBQ0o7UUFBQyxPQUFPLENBQUMsRUFBRTtZQUNSLFNBQUcsQ0FBQyxLQUFLLENBQUMscUNBQXFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7U0FDeEQ7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILG9CQUFNLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUU7UUFDOUIsSUFBSTtZQUNBLFNBQUcsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdkMsb0JBQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLENBQUM7U0FDaEM7UUFBQyxPQUFPLENBQUMsRUFBRTtZQUNSLFNBQUcsQ0FBQyxLQUFLLENBQUMsMkJBQTJCLEdBQUcsQ0FBQyxDQUFDLENBQUM7U0FDOUM7SUFDTCxDQUFDLENBQUMsQ0FBQTtJQUVGLG9CQUFNLENBQUMsVUFBVSxDQUFDLHdCQUF3QixDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7UUFDbEQsSUFBSTtZQUNBLFNBQUcsQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoRCxJQUFJLFdBQVcsR0FBRyxtQkFBUSxDQUFDLFFBQVEsQ0FBQztZQUNwQyxtQkFBUSxDQUFDLFFBQVEsR0FBa0IsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUM7WUFDakUsU0FBRyxDQUFDLFFBQVEsR0FBRyxtQkFBUSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUMsZ0NBQWdDO1lBQ3ZGLG9CQUFNLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDeEIsbUJBQVEsQ0FBQyw4QkFBOEIsQ0FBQyxXQUFXLENBQUMsQ0FBQztTQUN4RDtRQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQ1IsU0FBRyxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsR0FBRyxDQUFDLENBQUMsQ0FBQztTQUMxRDtJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsb0JBQU0sQ0FBQyxVQUFVLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtRQUNqRCxJQUFJLElBQUksR0FBRyxvQkFBTSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQzVFLElBQUksSUFBSSxFQUFFO1lBQ04sSUFBSSxDQUFDLGlCQUFpQixHQUFHLEVBQUUsQ0FBQztZQUM1QixJQUFJLENBQUMsV0FBVyxHQUFHLEVBQUUsQ0FBQztTQUN6QjtJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUg7OztPQUdHO0lBQ0gsb0JBQU0sQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLDZCQUE2QixFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDaEUsT0FBTyxJQUFJLE9BQU8sQ0FBc0IsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDeEQsSUFBSSxJQUFJLEdBQUcsb0JBQU0sQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQTtZQUN6RSxJQUFJLElBQUksRUFBRTtnQkFDTixPQUFPLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUE7YUFDbEM7aUJBQU07Z0JBQ0gsNERBQTREO2dCQUM1RCxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUE7YUFDZDtRQUNMLENBQUMsQ0FBQyxDQUFBO0lBQ04sQ0FBQyxDQUFDLENBQUM7SUFFSDs7O09BR0c7SUFDSCxvQkFBTSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMseUJBQXlCLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtRQUM1RCxTQUFHLENBQUMsR0FBRyxDQUFDLHlDQUF5QyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQTtRQUN6RixPQUFPLElBQUksT0FBTyxDQUFNLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ3hDLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUE7WUFDaEMsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQTtZQUN2QixJQUFJLElBQUksR0FBRyxvQkFBTSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDakUsSUFBSSxJQUFJLEVBQUU7Z0JBQ04sU0FBRyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLHdCQUFRLENBQUMsYUFBYSxDQUFDLENBQUE7Z0JBQ2xGLG9CQUFNLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyx3QkFBUSxDQUFDLGFBQWEsRUFBRSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFZLEVBQUUsRUFBRTtvQkFDN0UsU0FBRyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEdBQUcsSUFBSSxFQUFFLHdCQUFRLENBQUMsYUFBYSxDQUFDLENBQUE7b0JBQ3BELElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFO3dCQUMzQixJQUFJLEdBQUcsQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLGNBQWM7K0JBQzdCLENBQUMsc0JBQU0sQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLHNCQUFNLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLFdBQVc7eUJBQzFIOzRCQUNJLElBQUksSUFBSSxJQUFJLEdBQUcsQ0FBQyxJQUFJLEVBQUU7Z0NBQ2xCLE9BQU8sQ0FBQyxFQUFFLEdBQUcsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQTs2QkFDakU7eUJBQ0o7b0JBQ0wsQ0FBQyxDQUFDLENBQUE7b0JBQ0YsOENBQThDO29CQUM5QyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUE7Z0JBQ2YsQ0FBQyxDQUFDLENBQUE7YUFDTDtpQkFBTTtnQkFDSCxJQUFJLENBQUMsR0FBRyx1Q0FBdUMsR0FBRyxRQUFRLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQTtnQkFDcEUsU0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQTtnQkFDWixNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUE7YUFDWjtRQUNMLENBQUMsQ0FBQyxDQUFBO0lBQ04sQ0FBQyxDQUFDLENBQUM7SUFFSCxvQkFBTSxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxlQUF1QixFQUFFLEVBQUU7UUFDaEYsSUFBSTtZQUNBLElBQUksQ0FBQyxlQUFlLElBQUksZUFBZSxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUU7Z0JBQ2pELFNBQUcsQ0FBQyxHQUFHLENBQUMsOENBQThDLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQzthQUMzRTtpQkFBTTtnQkFDSCwyQkFBMkIsQ0FBQyxlQUFlLENBQUMsQ0FBQzthQUNoRDtTQUNKO1FBQUMsT0FBTyxDQUFDLEVBQUU7WUFDUixTQUFHLENBQUMsS0FBSyxDQUFDLHlDQUF5QyxHQUFHLENBQUMsQ0FBQyxDQUFDO1NBQzVEO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxvQkFBTSxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFO1FBQ3hELElBQUk7WUFDQSxvQkFBTSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztTQUNoQztRQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQ1IsU0FBRyxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsR0FBRyxDQUFDLENBQUMsQ0FBQztTQUMxRDtJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsb0JBQU0sQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsV0FBVyxFQUFFLENBQUMsV0FBbUIsRUFBRSxFQUFFO1FBQzNFLElBQUk7WUFDQSxvQkFBTSxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsbUJBQVEsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztTQUN2RTtRQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQ1IsU0FBRyxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsR0FBRyxDQUFDLENBQUMsQ0FBQztTQUMxRDtJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgseUNBQXlDO0lBQ3pDLG9CQUFNLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyx3QkFBUSxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtRQUMzRCxPQUFPLElBQUksT0FBTyxDQUFXLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQzdDLElBQUk7Z0JBQ0EsSUFBSSxZQUFZLEdBQWEsbUJBQVEsQ0FBQyxlQUFlLENBQUMsbUJBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDekUsSUFBSSxDQUFDLFlBQVksRUFBRTtvQkFDZixNQUFNLENBQUMsa0JBQWtCLENBQUMsQ0FBQztpQkFDOUI7cUJBQ0k7b0JBQ0QsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDO2lCQUN6QjthQUNKO1lBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ1IsTUFBTSxDQUFDLHdDQUF3QyxHQUFHLENBQUMsQ0FBQyxDQUFDO2FBQ3hEO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDLENBQUMsQ0FBQztJQUVILG9CQUFNLENBQUMsVUFBVSxDQUFDLHFCQUFxQixDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7UUFDL0MsSUFBSTtZQUNBLG9CQUFNLENBQUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUU7Z0JBQ3pELElBQUksR0FBRyxFQUFFO29CQUNMLElBQUksR0FBRyxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDO29CQUNsQyxnQkFBZ0I7b0JBQ2hCLG9CQUFNLENBQUMsMEJBQTBCLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDM0QsSUFBSSxDQUFDLG9CQUFNLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFO3dCQUNwQyxpQ0FBaUM7d0JBQ2pDLElBQUksSUFBSSxHQUFHLElBQUksbUNBQWdCLENBQUMsR0FBRyxDQUFDLENBQUM7d0JBQ3JDLG9CQUFNLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztxQkFDM0M7aUJBQ0o7WUFDTCxDQUFDLENBQUMsQ0FBQztTQUNOO1FBQUMsT0FBTyxDQUFDLEVBQUU7WUFDUixTQUFHLENBQUMsS0FBSyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7U0FDcEQ7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILG9CQUFNLENBQUMsVUFBVSxDQUFDLHNCQUFzQixDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7UUFDaEQsSUFBSTtZQUNBLElBQUksR0FBRyxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDO1lBQ2xDLG9CQUFNLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFO2dCQUM3QyxJQUFJLFdBQVcsRUFBRTtvQkFDYixnQkFBZ0I7b0JBQ2hCLG9CQUFNLENBQUMsMEJBQTBCLENBQUMsR0FBRyxDQUFDLENBQUM7aUJBQzFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7U0FDTjtRQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQ1IsU0FBRyxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO1NBQ25EO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxvQkFBTSxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxHQUFHLEVBQUUsRUFBRTtRQUMxRCxJQUFJLG9CQUFNLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQ25DLDhCQUE4QjtZQUM5QixJQUFJLElBQUksR0FBRyxvQkFBTSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUM3QyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUN4QixvQkFBTSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztTQUN4QztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsb0JBQU0sQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBbUIsRUFBRSxFQUFFO1FBQ3RFLElBQUk7WUFDQSxJQUFJLG1CQUFtQixHQUFHLEtBQUssQ0FBQztZQUNoQyxvR0FBb0c7WUFDcEcsSUFBSSx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFO2dCQUM1RCxtQkFBUSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNwQyxTQUFHLENBQUMsR0FBRyxDQUFDLCtCQUErQixFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3hELHdHQUF3RztnQkFDeEcsbUNBQWdCLENBQUMsMkJBQTJCLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUU7b0JBQzFELG9CQUFvQjtvQkFDcEIsb0JBQU0sQ0FBQyxjQUFjLEdBQUcsRUFBRSxDQUFDO29CQUMzQixtQkFBbUIsR0FBRyxvQkFBTSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLElBQUksQ0FBQztvQkFDckcsSUFBSSxDQUFDLG1CQUFtQixFQUFFO3dCQUN0QixvQkFBTSxDQUFDLHNDQUFzQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztxQkFDM0Q7Z0JBQ0wsQ0FBQyxFQUFFLEdBQUcsRUFBRTtvQkFDSixvQkFBTSxDQUFDLHNDQUFzQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDNUQsQ0FBQyxDQUFDLENBQUM7YUFDTjtpQkFBTTtnQkFDSCxTQUFHLENBQUMsR0FBRyxDQUFDLHFDQUFxQyxFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzlELG9CQUFNLENBQUMsc0NBQXNDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2FBQzNEO1NBQ0o7UUFBQyxPQUFPLENBQUMsRUFBRTtZQUNSLFNBQUcsQ0FBQyxLQUFLLENBQUMsaUNBQWlDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDakQsb0JBQU0sQ0FBQyxzQ0FBc0MsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDM0Q7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILG9CQUFNLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLGdCQUFnQixFQUFFLEdBQUcsRUFBRTtRQUM3RCxvQkFBTSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ25DLENBQUMsQ0FBQyxDQUFDO0lBRUgsb0JBQU0sQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsVUFBVSxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDM0QsSUFBSSxvQkFBTSxDQUFDLGNBQWMsQ0FBQyxvQkFBb0IsRUFBRTtZQUN2QixvQkFBTSxDQUFDLGNBQWUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7Z0JBQ3JFLFNBQUcsQ0FBQyxLQUFLLENBQUMsd0JBQXdCLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDNUMsQ0FBQyxDQUFDLENBQUE7U0FDTDtJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsb0JBQU0sQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLHdCQUFRLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtRQUMvQyxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ25DLElBQUk7Z0JBQ0EsNERBQTREO2dCQUM1RCxvQkFBTSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtvQkFDcEMsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFO3dCQUNkLCtEQUErRDt3QkFDL0QsU0FBRyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFLHdCQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7d0JBQ25FLG9CQUFNLENBQUMsY0FBYyxDQUFDLGdCQUFnQixFQUFFLENBQUM7cUJBQzVDO2dCQUNMLENBQUMsQ0FBQyxDQUFDO2dCQUVILE9BQU8sQ0FBQyxHQUFHLENBQUMseUJBQXlCLENBQUMsQ0FBQztnQkFDdkMsb0JBQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQzdCLE9BQU8sRUFBRSxDQUFDO2FBQ2I7WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDUixTQUFHLENBQUMsS0FBSyxDQUFDLGtDQUFrQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNsRCxNQUFNLEVBQUUsQ0FBQzthQUNaO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDLENBQUMsQ0FBQztJQUVILG9CQUFNLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyx3QkFBUSxDQUFDLGlCQUFpQixFQUFFLENBQUMsTUFBNEMsRUFBRSxFQUFFO1FBQ3JHLFNBQUcsQ0FBQyxHQUFHLENBQUMsNENBQTRDLEdBQUcsTUFBTSxDQUFDLFdBQVcsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNGLE9BQU8sSUFBSSxPQUFPLENBQW1CLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ3JELElBQUksTUFBTSxHQUFxQixFQUFFLENBQUM7WUFDbEMsSUFBSTtnQkFDQSxJQUFJLElBQUksR0FBRyxvQkFBTSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3BELElBQUksV0FBVyxHQUFHLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ3ZFLElBQUksUUFBUSxHQUFHLFdBQVcsQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDeEMsSUFBSSxJQUFJLEdBQUcsbUJBQVEsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxLQUFLLElBQUksQ0FBQztnQkFFbEUsSUFBSSxDQUFDLG1CQUFRLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsRUFBRTtvQkFDaEQsb0JBQW9CO29CQUNwQiwyQkFBMkI7b0JBQzNCLFdBQVcsQ0FBQyxVQUFVLENBQUMsbUNBQW1DLENBQUMsV0FBVyxFQUFFLENBQUMsS0FBZ0IsRUFBRSxFQUFFO3dCQUN6RixNQUFNLENBQUMsSUFBSSxDQUFDOzRCQUNSLEtBQUssRUFBRSxLQUFLLENBQUMsaUJBQWlCLENBQUMsS0FBSzs0QkFDcEMsS0FBSyxFQUFFLDJCQUFXLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDOzRCQUMzQyxVQUFVLEVBQUUsSUFBSTt5QkFDbkIsQ0FBQyxDQUFDO29CQUNQLENBQUMsQ0FBQyxDQUFDO29CQUNILDBCQUEwQjtvQkFDMUIsV0FBVyxDQUFDLFVBQVUsQ0FBQywrQkFBK0IsRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTt3QkFDckUsTUFBTSxDQUFDLElBQUksQ0FBQzs0QkFDUixLQUFLLEVBQUUsS0FBSyxDQUFDLGlCQUFpQixDQUFDLEtBQUs7NEJBQ3BDLEtBQUssRUFBRSwyQkFBVyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQzs0QkFDM0MsVUFBVSxFQUFFLElBQUk7eUJBQ25CLENBQUMsQ0FBQztvQkFDUCxDQUFDLENBQUMsQ0FBQztpQkFDTjtnQkFDRCwrQkFBK0I7Z0JBQy9CLG1DQUFtQztnQkFDbkMsT0FBTyxJQUFJLEVBQUU7b0JBQ1QsSUFBSSxLQUFLLEdBQUcsV0FBVyxDQUFDLFVBQVUsRUFBRSxDQUFDO29CQUNyQyxJQUFJLFdBQVcsQ0FBQyxzQkFBc0IsSUFBSSxLQUFLLElBQUksUUFBUSxFQUFFO3dCQUN6RCxRQUFRLEdBQUcsS0FBSyxDQUFDO3dCQUNqQixNQUFNLENBQUMsSUFBSSxDQUFDOzRCQUNSLEtBQUssRUFBRSxXQUFXLENBQUMsaUJBQWlCLENBQUMsS0FBSzs0QkFDMUMsS0FBSyxFQUFFLDJCQUFXLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDOzRCQUN6QyxVQUFVLEVBQUUsSUFBSTt5QkFDbkIsQ0FBQyxDQUFBLENBQUEsbUJBQW1CO3FCQUN4QjtvQkFDRCxJQUFJLFdBQVcsQ0FBQyxRQUFRLEVBQUUsRUFBRTt3QkFDeEIsV0FBVyxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUM7cUJBQ3BDO3lCQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFO3dCQUM1QixNQUFNO3FCQUNUO3lCQUFNO3dCQUNILFdBQVcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7cUJBQ25EO29CQUNELElBQUksQ0FBQyxtQkFBbUIsR0FBRyxNQUFNLENBQUM7aUJBQ3JDO2dCQUNELE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQzthQUNuQjtZQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNSLFNBQUcsQ0FBQyxLQUFLLENBQUMsMENBQTBDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQzFELE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQzthQUNuQjtRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDLENBQUM7SUFFSCxvQkFBTSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsd0JBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLEdBQVcsRUFBRSxFQUFFO1FBQ25FLE9BQU8sSUFBSSxPQUFPLENBQVUsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDNUMsSUFBSTtnQkFDQSxJQUFJLElBQUksR0FBRyxvQkFBTSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDN0MsSUFBSSxJQUFJLEVBQUU7b0JBQ04sSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7d0JBQy9DLG9CQUFNLENBQUMsMkJBQTJCLENBQUM7NEJBQy9CLFFBQVEsRUFBRSxpQ0FBaUIsQ0FBQyxLQUFLOzRCQUNqQyxxQkFBcUIsRUFBRSxLQUFLOzRCQUM1QixrQkFBa0IsRUFBRSxLQUFLOzRCQUN6QixHQUFHLEVBQUUsR0FBRzt5QkFDWCxFQUFFLElBQUksQ0FBQyxDQUFDO3dCQUNULE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFDckIsQ0FBQyxDQUFDLENBQUE7aUJBQ0w7YUFDSjtZQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNSLFNBQUcsQ0FBQyxLQUFLLENBQUMsdURBQXVELEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQzthQUNsQjtRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDLENBQUM7SUFFSCxvQkFBTSxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxhQUFhLEVBQUUsR0FBRyxFQUFFO1FBQzFELElBQUk7WUFDQSx5QkFBVyxDQUFDLGFBQWEsRUFBRSxDQUFDO1NBQy9CO1FBQUMsT0FBTyxDQUFDLEVBQUU7WUFDUixTQUFHLENBQUMsS0FBSyxDQUFDLHlDQUF5QyxHQUFHLENBQUMsQ0FBQyxDQUFDO1NBQzVEO0lBQ0wsQ0FBQyxDQUFDLENBQUE7SUFFRixvQkFBTSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsd0JBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxNQUFzQixFQUFFLEVBQUU7UUFDdEUsSUFBSTtZQUNBLElBQUksSUFBSSxHQUFHLG9CQUFNLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwRCxJQUFJLENBQUMsSUFBSSxFQUFFO2dCQUNQLFNBQUcsQ0FBQyxLQUFLLENBQUMsZ0NBQWdDLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUN6RCxPQUFPO2FBQ1Y7WUFDRCxvQkFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLFdBQVcsRUFBRSxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUM7U0FDbEU7UUFBQyxPQUFPLENBQUMsRUFBRTtZQUNSLFNBQUcsQ0FBQyxLQUFLLENBQUMsc0JBQXNCLEdBQUcsQ0FBQyxDQUFDLENBQUM7U0FDekM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILG9CQUFNLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyx3QkFBUSxDQUFDLGlCQUFpQixFQUFFLENBQUMsR0FBVyxFQUFFLEVBQUU7UUFDcEUscURBQXFEO1FBQ3JELE9BQU8sSUFBSSxPQUFPLENBQVUsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDNUMsSUFBSSxvQkFBTSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRTtnQkFDbkMsb0JBQU0sQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDckQsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQ2pCO2lCQUFNO2dCQUNILE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQzthQUNsQjtRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDLENBQUM7SUFFSCxvQkFBTSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLEVBQUUsR0FBRyxFQUFFO1FBQ2xELE9BQU8sSUFBSSxPQUFPLENBQU0sQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDeEMsSUFBSSxvQkFBTSxDQUFDLGNBQWMsWUFBWSx1Q0FBa0IsRUFBRTtnQkFDckQsT0FBTyxDQUFDLG9CQUFNLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUE7YUFDOUM7aUJBQU07Z0JBQ0gsTUFBTSxDQUFDLHNDQUFzQyxDQUFDLENBQUM7YUFDbEQ7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQztBQUVELFNBQVMsd0JBQXdCLENBQUMsR0FBVyxFQUFFLGlCQUEwQjtJQUNyRSw2REFBNkQ7SUFDN0QsSUFBSSxJQUFJLEdBQUcsb0JBQU0sQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDN0MsSUFBSSxDQUFDLElBQUksRUFBRTtRQUNQLFNBQUcsQ0FBQyxLQUFLLENBQUMsdUNBQXVDLEdBQUcsR0FBRyxDQUFDLENBQUM7UUFDekQsT0FBTyxLQUFLLENBQUM7S0FDaEI7U0FBTSxJQUFJLENBQUMsb0JBQU0sQ0FBQyxjQUFjLENBQUMsT0FBTyxFQUFFLEVBQUU7UUFDekMsSUFBSSxpQkFBaUI7WUFBRSxTQUFHLENBQUMsSUFBSSxDQUFDLDJDQUEyQyxDQUFDLENBQUM7UUFDN0UsU0FBRyxDQUFDLEtBQUssQ0FBQywyQ0FBMkMsQ0FBQyxDQUFDO1FBQ3ZELE9BQU8sS0FBSyxDQUFDO0tBQ2hCO0lBQ0QsT0FBTyxJQUFJLENBQUM7QUFDaEIsQ0FBQztBQUVELFNBQVMsMkJBQTJCLENBQUMsV0FBbUI7SUFDcEQsSUFBSSxPQUFPLENBQUM7SUFDWixtQkFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO1FBQ3BDLElBQUksbUJBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRTtZQUNsQixPQUFPLEdBQUcsbUJBQVEsQ0FBQyxhQUFhLENBQUMsbUJBQVEsQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDakUsSUFBSSxPQUFPLEVBQUU7Z0JBQ1QsMkJBQTJCLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ3JDLE9BQU8sb0JBQU0sQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2FBQy9DO2lCQUFNO2dCQUNILFNBQUcsQ0FBQyxLQUFLLENBQUMsdUJBQXVCLEdBQUcsV0FBVyxHQUFHLDJCQUEyQixDQUFDLENBQUM7Z0JBQy9FLE9BQU8sS0FBSyxDQUFDO2FBQ2hCO1NBQ0o7YUFBTTtZQUNILE9BQU8sS0FBSyxDQUFDO1NBQ2hCO0lBQ0wsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ2QsSUFBSSxPQUFPLEVBQUU7WUFDVCxvQkFBTSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7U0FDM0M7YUFBTTtZQUNILG9CQUFNLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ25DLFNBQUcsQ0FBQyxHQUFHLENBQUMsdUNBQXVDLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUNwRTtJQUNMLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRTtRQUNkLElBQUksTUFBTSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUMsRUFBRTtZQUNwQyxTQUFHLENBQUMsSUFBSSxDQUFDLHlGQUF5RixFQUFDLElBQUksRUFBQyxJQUFJLENBQUMsQ0FBQTtZQUM3RyxTQUFHLENBQUMsS0FBSyxDQUFDLGVBQWUsR0FBRyxNQUFNLENBQUMsQ0FBQztZQUNwQyxvQkFBTSxDQUFDLGNBQWMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNuQyxvQ0FBb0M7WUFDcEMsb0JBQU0sQ0FBQyxjQUFjLENBQUMsYUFBYSxFQUFFLENBQUM7U0FDekM7YUFBTTtZQUNILFNBQUcsQ0FBQyxLQUFLLENBQUMsMkJBQTJCLEdBQUcsTUFBTSxDQUFDLENBQUM7WUFDaEQsb0JBQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLENBQUM7U0FDaEM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNQLENBQUM7QUFFRCxTQUFTLDJCQUEyQixDQUFDLE9BQWdCO0lBQ2pELElBQUksbUJBQVEsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLG9CQUFNLENBQUMsY0FBYyxJQUFJLENBQUMsb0JBQU0sQ0FBQyxjQUFjLENBQUMsb0JBQW9CLENBQUMsRUFBRTtRQUM3RyxTQUFHLENBQUMsR0FBRyxDQUFDLDhCQUE4QixFQUFFLHdCQUFRLENBQUMsYUFBYSxDQUFDLENBQUE7UUFDL0QsSUFBSSxvQkFBTSxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsRUFBRTtZQUN4QyxTQUFHLENBQUMsS0FBSyxDQUFDLG1FQUFtRSxDQUFDLENBQUE7U0FDakY7UUFDRCxvQkFBTSxDQUFDLGNBQWMsR0FBRyxJQUFJLHVDQUFrQixFQUFFLENBQUM7S0FDcEQ7QUFDTCxDQUFDIn0=