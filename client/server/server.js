'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode_languageserver_1 = require('vscode-languageserver');
const Log_1 = require('./Log');
const Settings_1 = require('./Settings');
const ViperProtocol_1 = require('./ViperProtocol');
const NailgunService_1 = require('./NailgunService');
const VerificationTask_1 = require('./VerificationTask');
const DebugServer_1 = require('./DebugServer');
const ServerClass_1 = require('./ServerClass');
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
            DebugServer_1.DebugServer.initialize();
            //Server.workspaceRoot = params.rootPath;
            ServerClass_1.Server.nailgunService = new NailgunService_1.NailgunService();
            return {
                capabilities: {}
            };
        }
        catch (e) {
            Log_1.Log.error("Error handling initialize request: " + e);
        }
    });
    ServerClass_1.Server.connection.onShutdown(() => {
        try {
            Log_1.Log.log("On Shutdown", ViperProtocol_1.LogLevel.Debug);
            ServerClass_1.Server.nailgunService.stopNailgunServer();
        }
        catch (e) {
            Log_1.Log.error("Error handling shutdown: " + e);
        }
    });
    ServerClass_1.Server.connection.onDidChangeConfiguration((change) => {
        try {
            let oldSettings = Settings_1.Settings.settings;
            Settings_1.Settings.settings = change.settings.viperSettings;
            Log_1.Log.logLevel = Settings_1.Settings.settings.preferences.logLevel; //after this line, Logging works
            Log_1.Log.log('Configuration changed', ViperProtocol_1.LogLevel.Info);
            Settings_1.Settings.checkSettings().then(() => {
                if (Settings_1.Settings.valid()) {
                    restartBackendIfNeeded(oldSettings);
                }
                else {
                    ServerClass_1.Server.nailgunService.stopNailgunServer();
                }
            });
        }
        catch (e) {
            Log_1.Log.error("Error handling configuration change: " + e);
        }
    });
    ServerClass_1.Server.connection.onNotification(ViperProtocol_1.Commands.StartBackend, (selectedBackend) => {
        try {
            if (!selectedBackend || selectedBackend.length == 0) {
                Log_1.Log.log("No backend was chosen, don't restart backend", ViperProtocol_1.LogLevel.Debug);
            }
            else {
                //recheck settings upon backend change
                Settings_1.Settings.checkSettings().then(() => {
                    if (Settings_1.Settings.valid()) {
                        Settings_1.Settings.selectedBackend = selectedBackend;
                        restartBackendIfNeeded(null);
                    }
                    else {
                        ServerClass_1.Server.nailgunService.stopNailgunServer();
                    }
                });
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling select backend request: " + e);
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
            if (ServerClass_1.Server.isViperSourceFile(params.textDocument.uri)) {
                let uri = params.textDocument.uri;
                //notify client;
                ServerClass_1.Server.sendFileOpenedNotification(params.textDocument.uri);
                if (!ServerClass_1.Server.verificationTasks.has(uri)) {
                    //create new task for opened file
                    let task = new VerificationTask_1.VerificationTask(uri, ServerClass_1.Server.nailgunService);
                    ServerClass_1.Server.verificationTasks.set(uri, task);
                }
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling TextDocument openend");
        }
    });
    ServerClass_1.Server.connection.onDidCloseTextDocument((params) => {
        try {
            if (ServerClass_1.Server.isViperSourceFile(params.textDocument.uri)) {
                let uri = params.textDocument.uri;
                //notify client;
                ServerClass_1.Server.sendFileClosedNotification(uri);
                if (ServerClass_1.Server.verificationTasks.has(uri)) {
                    //remove no longer needed task
                    ServerClass_1.Server.verificationTasks.delete(uri);
                }
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling TextDocument closed");
        }
    });
    function canVerificationBeStarted(uri, manuallyTriggered) {
        //check if there is already a verification task for that file
        let task = ServerClass_1.Server.verificationTasks.get(uri);
        if (!task) {
            Log_1.Log.error("No verification task found for file: " + uri);
            return false;
        }
        else if (task.running) {
            return false;
        }
        else if (!ServerClass_1.Server.isViperSourceFile(uri)) {
            //only verify viper source code files
            Log_1.Log.hint("Only viper source files can be verified.");
            Log_1.Log.error("Only viper source files can be verified.");
            return false;
        }
        else if (!ServerClass_1.Server.nailgunService.isReady()) {
            if (manuallyTriggered)
                Log_1.Log.hint("The verification backend is not ready yet");
            Log_1.Log.error("The verification backend is not ready yet");
            return false;
        }
        return true;
    }
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
        }
        catch (e) {
            Log_1.Log.error("Error handling verify request: " + e);
            ServerClass_1.Server.sendVerificationNotStartedNotification(data.uri);
        }
    });
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.Dispose, () => {
        try {
            //Server.nailgunService.stopNailgunServer();
            ServerClass_1.Server.nailgunService.killNailgunServer();
            ServerClass_1.Server.nailgunService.killNgDeamon();
        }
        catch (e) {
            Log_1.Log.error("Error handling dispose request: " + e);
        }
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
    ServerClass_1.Server.connection.onNotification(ViperProtocol_1.Commands.StopVerification, (uri) => {
        try {
            let task = ServerClass_1.Server.verificationTasks.get(uri);
            task.abortVerification();
            ServerClass_1.Server.sendStateChangeNotification({
                newState: ViperProtocol_1.VerificationState.Ready,
                verificationCompleted: false,
                verificationNeeded: false,
                uri: uri
            }, task);
        }
        catch (e) {
            Log_1.Log.error("Error handling stop verification request: " + e);
        }
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
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.GetDotExecutable, params => {
        return Settings_1.Settings.settings.paths.dotExecutable;
    });
}
function resetDiagnostics(uri) {
    let task = ServerClass_1.Server.verificationTasks.get(uri);
    if (!task) {
        Log_1.Log.error("no verification Task for file: " + uri);
        return;
    }
    task.resetDiagnostics();
}
//tries to restart backend, 
function restartBackendIfNeeded(oldSettings) {
    let newBackend = Settings_1.Settings.autoselectBackend(Settings_1.Settings.settings);
    if (newBackend) {
        //only restart the backend after settings changed if the active backend was affected
        let restartBackend = !ServerClass_1.Server.nailgunService.isReady() //backend is not ready -> restart
            || !Settings_1.Settings.backendEquals(ServerClass_1.Server.backend, newBackend) //change in backend
            || (oldSettings && (newBackend.useNailgun && (!Settings_1.Settings.nailgunEquals(Settings_1.Settings.settings.nailgunSettings, oldSettings.nailgunSettings)))); //backend needs nailgun and nailgun settings changed
        if (restartBackend) {
            Log_1.Log.log(`Change Backend: from ${ServerClass_1.Server.backend ? ServerClass_1.Server.backend.name : "No Backend"} to ${newBackend ? newBackend.name : "No Backend"}`, ViperProtocol_1.LogLevel.Info);
            ServerClass_1.Server.backend = newBackend;
            ServerClass_1.Server.verificationTasks.forEach(task => task.resetLastSuccess());
            ServerClass_1.Server.nailgunService.startOrRestartNailgunServer(ServerClass_1.Server.backend, true);
        }
        else {
            Log_1.Log.log("No need to restart backend. It is still the same", ViperProtocol_1.LogLevel.Debug);
            ServerClass_1.Server.backend = newBackend;
            ServerClass_1.Server.sendBackendReadyNotification({ name: ServerClass_1.Server.backend.name, restarted: false });
        }
    }
    else {
        Log_1.Log.error("No backend, even though the setting check succeeded.");
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBQ2IsNkRBQTZEO0FBQzdELDhFQUE4RTtBQUU5RSx3Q0FBcUYsdUJBQXVCLENBQUMsQ0FBQTtBQUM3RyxzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsMkJBQXVCLFlBQ3ZCLENBQUMsQ0FEa0M7QUFDbkMsZ0NBQStILGlCQUMvSCxDQUFDLENBRCtJO0FBQ2hKLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELG1DQUErQixvQkFBb0IsQ0FBQyxDQUFBO0FBRXBELDhCQUEwQixlQUFlLENBQUMsQ0FBQTtBQUMxQyw4QkFBcUIsZUFBZSxDQUFDLENBQUE7QUFFckMsb0ZBQW9GO0FBQ3BGLG9CQUFNLENBQUMsVUFBVSxHQUFHLHdDQUFnQixDQUFDLElBQUksd0NBQWdCLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSx3Q0FBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBQ25HLG9CQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxvQkFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBRTNDLGdCQUFnQixFQUFFLENBQUM7QUFFbkIsMkJBQTJCO0FBQzNCLG9CQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDO0FBRTNCO0lBQ0ksZ0NBQWdDO0lBQ2hDLG9CQUFNLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDLE1BQU07UUFDbEMsSUFBSSxDQUFDO1lBQ0QseUJBQVcsQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUV6Qix5Q0FBeUM7WUFDekMsb0JBQU0sQ0FBQyxjQUFjLEdBQUcsSUFBSSwrQkFBYyxFQUFFLENBQUM7WUFDN0MsTUFBTSxDQUFDO2dCQUNILFlBQVksRUFBRSxFQUFFO2FBQ25CLENBQUE7UUFDTCxDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMs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