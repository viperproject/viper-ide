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
            Settings_1.Settings.settings = change.settings.viperSettings;
            Log_1.Log.logLevel = Settings_1.Settings.settings.logLevel;
            //after this line, Logging works
            Log_1.Log.log('Configuration changed', ViperProtocol_1.LogLevel.Info);
            Settings_1.Settings.checkSettings(Settings_1.Settings.settings);
            if (Settings_1.Settings.valid()) {
                //pass the new settings to the verificationService
                ServerClass_1.Server.nailgunService.changeSettings(Settings_1.Settings.settings);
                restartBackendIfNeeded();
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling configuration change: " + e);
        }
    });
    ServerClass_1.Server.connection.onNotification(ViperProtocol_1.Commands.RequestBackendNames, () => {
        try {
            let backendNames = Settings_1.Settings.getBackendNames(Settings_1.Settings.settings);
            if (backendNames.length > 1) {
                ServerClass_1.Server.askUserToSelectBackend(backendNames).then((selectedBackend) => {
                    try {
                        if (!selectedBackend || selectedBackend.length == 0) {
                            Log_1.Log.log("No backend was chosen, don't restart backend");
                            return;
                        }
                        if (Settings_1.Settings.valid()) {
                            Settings_1.Settings.selectedBackend = selectedBackend;
                            restartBackendIfNeeded();
                        }
                    }
                    catch (e) {
                        Log_1.Log.error("Error handling select backend request: " + e);
                    }
                });
            }
            else {
                Log_1.Log.hint("There are less than two backends, selecting does not make sense.");
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling backend names request: " + e);
        }
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
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.Verify, (data) => {
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
    ServerClass_1.Server.connection.onNotification(ViperProtocol_1.Commands.StopVerification, (uri) => {
        try {
            let task = ServerClass_1.Server.verificationTasks.get(uri);
            task.abortVerification();
            ServerClass_1.Server.sendStateChangeNotification({
                newState: ViperProtocol_1.VerificationState.Ready,
                verificationCompleted: false,
                verificationNeeded: false,
                uri: uri
            });
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
}
function resetDiagnostics(uri) {
    let task = ServerClass_1.Server.verificationTasks.get(uri);
    if (!task) {
        Log_1.Log.error("no verification Task for file: " + uri);
        return;
    }
    task.resetDiagnostics();
}
function restartBackendIfNeeded() {
    let newBackend = Settings_1.Settings.autoselectBackend(Settings_1.Settings.settings);
    //only restart the backend after settings changed if the active backend was affected
    if (!Settings_1.Settings.backendEquals(ServerClass_1.Server.backend, newBackend)) {
        Log_1.Log.log(`Change Backend: from ${ServerClass_1.Server.backend ? ServerClass_1.Server.backend.name : "No Backend"} to ${newBackend ? newBackend.name : "No Backend"}`, ViperProtocol_1.LogLevel.Info);
        ServerClass_1.Server.backend = newBackend;
        ServerClass_1.Server.verificationTasks.forEach(task => task.resetLastSuccess());
        ServerClass_1.Server.nailgunService.startOrRestartNailgunServer(ServerClass_1.Server.backend);
    }
    else {
        Log_1.Log.log("No need to restart backend. It's still the same", ViperProtocol_1.LogLevel.Debug);
        ServerClass_1.Server.backend = newBackend;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBTWIsd0NBT08sdUJBQXVCLENBQUMsQ0FBQTtBQUcvQixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsMkJBQXVCLFlBQ3ZCLENBQUMsQ0FEa0M7QUFDbkMsZ0NBQTJKLGlCQUMzSixDQUFDLENBRDJLO0FBQzVLLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELG1DQUErQixvQkFBb0IsQ0FBQyxDQUFBO0FBR3BELDhCQUEwQixlQUFlLENBQUMsQ0FBQTtBQUMxQyw4QkFBcUIsZUFBZSxDQUFDLENBQUE7QUFDckMsSUFBSSxHQUFHLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBRTlCLG9GQUFvRjtBQUNwRixvQkFBTSxDQUFDLFVBQVUsR0FBRyx3Q0FBZ0IsQ0FBQyxJQUFJLHdDQUFnQixDQUFDLE9BQU8sQ0FBQyxFQUFFLElBQUksd0NBQWdCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUNuRyxvQkFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsb0JBQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUUzQyxnQkFBZ0IsRUFBRSxDQUFDO0FBRW5CLDJCQUEyQjtBQUMzQixvQkFBTSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQUUzQjtJQUNJLGdDQUFnQztJQUNoQyxvQkFBTSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxNQUFNO1FBQ2xDLElBQUksQ0FBQztZQUNELHlCQUFXLENBQUMsVUFBVSxFQUFFLENBQUM7WUFFekIsb0JBQU0sQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQztZQUN2QyxvQkFBTSxDQUFDLGNBQWMsR0FBRyxJQUFJLCtCQUFjLEVBQUUsQ0FBQztZQUM3QyxNQUFNLENBQUM7Z0JBQ0gsWUFB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