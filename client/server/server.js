'use strict';
const vscode_languageserver_1 = require('vscode-languageserver');
const Log_1 = require('./Log');
const Settings_1 = require('./Settings');
const ViperProtocol_1 = require('./ViperProtocol');
const NailgunService_1 = require('./NailgunService');
const VerificationTask_1 = require('./VerificationTask');
const DebugServer_1 = require('./DebugServer');
const ServerClass_1 = require('./ServerClass');
var ipc = require('node-ipc');
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
            ServerClass_1.Server.workspaceRoot = params.rootPath;
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
            Log_1.Log.logLevel = Settings_1.Settings.settings.logLevel; //after this line, Logging works
            Log_1.Log.log('Configuration changed', ViperProtocol_1.LogLevel.Info);
            let errors = Settings_1.Settings.checkSettings();
            if (Settings_1.Settings.valid()) {
                restartBackendIfNeeded(oldSettings);
            }
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
            else if (Settings_1.Settings.valid()) {
                Settings_1.Settings.selectedBackend = selectedBackend;
                restartBackendIfNeeded(null);
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
    ServerClass_1.Server.connection.onNotification(ViperProtocol_1.Commands.Verify, (data) => {
        try {
            let verificationstarted = false;
            //it does not make sense to reverify if no changes were made and the verification is already running
            let alreadyRunning = ServerClass_1.Server.verificationTasks.get(data.uri).running;
            if (!alreadyRunning) {
                Settings_1.Settings.workspace = data.workspace;
                verificationstarted = startOrRestartVerification(data.uri, data.manuallyTriggered);
            }
            if (!verificationstarted) {
                ServerClass_1.Server.sendVerificationNotStartedNotification(data.uri);
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling verify request: " + e);
            ServerClass_1.Server.sendVerificationNotStartedNotification(data.uri);
        }
    });
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.Dispose, (lineNumber) => {
        try {
            ServerClass_1.Server.nailgunService.stopNailgunServer();
            ServerClass_1.Server.nailgunService.killNgDeamon();
            return null;
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
                while (true) {
                    let depth = serverState.depthLevel();
                    if (serverState.canBeShownAsDecoration && depth <= maxDepth) {
                        maxDepth = depth;
                        result.push(serverState.decorationOptions.index); //push client state
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
                    resolve(result);
                }
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
            ServerClass_1.Server.showHeap(task, params.clientIndex);
        }
        catch (e) {
            Log_1.Log.error("Error showing heap: " + e);
        }
    });
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.GetDotExecutable, params => {
        return Settings_1.Settings.settings.dotExecutable;
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
function startOrRestartVerification(uri, manuallyTriggered) {
    //only verify viper source code files
    if (!ServerClass_1.Server.isViperSourceFile(uri)) {
        Log_1.Log.hint("Only viper source files can be verified.");
        return false;
    }
    if (!ServerClass_1.Server.nailgunService.isReady()) {
        if (manuallyTriggered)
            Log_1.Log.hint("The verification backend is not ready yet");
        return false;
    }
    //check if there is already a verification task for that file
    let task = ServerClass_1.Server.verificationTasks.get(uri);
    if (!task) {
        Log_1.Log.error("No verification task found for file: " + uri);
        return false;
    }
    Log_1.Log.log("start or restart verification", ViperProtocol_1.LogLevel.Info);
    //stop all other verifications because the backend crashes if multiple verifications are run in parallel
    ServerClass_1.Server.verificationTasks.forEach(task => { task.abortVerification(); });
    //start verification
    ServerClass_1.Server.executedStages = [];
    return task.verify(manuallyTriggered);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBTWIsd0NBT08sdUJBQXVCLENBQUMsQ0FBQTtBQUcvQixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsMkJBQXVCLFlBQ3ZCLENBQUMsQ0FEa0M7QUFDbkMsZ0NBQXlKLGlCQUN6SixDQUFDLENBRHlLO0FBQzFLLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELG1DQUErQixvQkFBb0IsQ0FBQyxDQUFBO0FBR3BELDhCQUEwQixlQUFlLENBQUMsQ0FBQTtBQUMxQyw4QkFBcUIsZUFBZSxDQUFDLENBQUE7QUFDckMsSUFBSSxHQUFHLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBRTlCLG9GQUFvRjtBQUNwRixvQkFBTSxDQUFDLFVBQVUsR0FBRyx3Q0FBZ0IsQ0FBQyxJQUFJLHdDQUFnQixDQUFDLE9BQU8sQ0FBQyxFQUFFLElBQUksd0NBQWdCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUNuRyxvQkFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsb0JBQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUUzQyxnQkFBZ0IsRUFBRSxDQUFDO0FBRW5CLDJCQUEyQjtBQUMzQixvQkFBTSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQUUzQjtJQUNJLGdDQUFnQztJQUNoQyxvQkFBTSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxNQUFNO1FBQ2xDLElBQUksQ0FBQztZQUNELHlCQUFXLENBQUMsVUFBVSxFQUFFLENBQUM7WUFFekIsb0JBQU0sQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQztZQUN2QyxvQkFBTSxDQUFDLGNBQWMsR0FBRyxJQUFJLCtCQUFjLEVBQUUsQ0FBQztZQUM3QyxNQUFNLENBQUM7Z0JBQ0gsWUFB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