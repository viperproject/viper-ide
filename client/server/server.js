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
        DebugServer_1.DebugServer.initialize();
        ServerClass_1.Server.workspaceRoot = params.rootPath;
        ServerClass_1.Server.nailgunService = new NailgunService_1.NailgunService();
        return {
            capabilities: {}
        };
    });
    ServerClass_1.Server.connection.onShutdown(() => {
        Log_1.Log.log("On Shutdown", ViperProtocol_1.LogLevel.Debug);
        ServerClass_1.Server.nailgunService.stopNailgunServer();
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
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.SelectBackend, (selectedBackend) => {
        if (Settings_1.Settings.valid() && selectedBackend) {
            Settings_1.Settings.selectedBackend = selectedBackend;
            restartBackendIfNeeded();
        }
    });
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.RequestBackendNames, args => {
        let backendNames = Settings_1.Settings.getBackendNames(Settings_1.Settings.settings);
        if (backendNames.length > 1) {
            ServerClass_1.Server.connection.sendRequest(ViperProtocol_1.Commands.AskUserToSelectBackend, backendNames);
        }
        else {
            Log_1.Log.hint("There are less than two backends, selecting does not make sense.");
        }
    });
    // Server.connection.onDidChangeWatchedFiles((change) => {
    //     Log.log("We recevied a file change event", LogLevel.Debug)
    // });
    ServerClass_1.Server.connection.onDidOpenTextDocument((params) => {
        try {
            if (ServerClass_1.Server.isViperSourceFile(params.textDocument.uri)) {
                let uri = params.textDocument.uri;
                //notify client;
                ServerClass_1.Server.connection.sendNotification(ViperProtocol_1.Commands.FileOpened, params.textDocument.uri);
                if (!ServerClass_1.Server.verificationTasks.has(uri)) {
                    //create new task for opened file
                    let task = new VerificationTask_1.VerificationTask(uri, ServerClass_1.Server.nailgunService, ServerClass_1.Server.connection);
                    ServerClass_1.Server.verificationTasks.set(uri, task);
                }
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling TextDocument closed");
        }
    });
    ServerClass_1.Server.connection.onDidCloseTextDocument((params) => {
        try {
            if (ServerClass_1.Server.isViperSourceFile(params.textDocument.uri)) {
                let uri = params.textDocument.uri;
                //notify client;
                ServerClass_1.Server.connection.sendNotification(ViperProtocol_1.Commands.FileClosed, uri);
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
            let alreadyRunning = false;
            //it does not make sense to reverify if no changes were made and the verification is already running
            ServerClass_1.Server.verificationTasks.forEach(task => {
                if (task.running && task.fileUri === data.uri) {
                    alreadyRunning = true;
                }
            });
            if (!alreadyRunning) {
                Settings_1.Settings.workspace = data.workspace;
                verificationstarted = startOrRestartVerification(data.uri, data.manuallyTriggered);
            }
            if (!verificationstarted) {
                ServerClass_1.Server.connection.sendNotification(ViperProtocol_1.Commands.VerificationNotStarted, data.uri);
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling verify request: " + e);
            ServerClass_1.Server.connection.sendNotification(ViperProtocol_1.Commands.VerificationNotStarted, data.uri);
        }
    });
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.Dispose, (lineNumber) => {
        ServerClass_1.Server.nailgunService.stopNailgunServer();
        ServerClass_1.Server.nailgunService.killNgDeamon();
        return null;
    });
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.StopVerification, (uri) => {
        let task = ServerClass_1.Server.verificationTasks.get(uri);
        task.abortVerification();
        ServerClass_1.Server.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.Ready, verificationCompleted: false, verificationNeeded: false, uri: uri });
    });
    ServerClass_1.Server.connection.onNotification(ViperProtocol_1.Commands.StopDebugging, () => {
        DebugServer_1.DebugServer.stopDebugging();
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
        Log_1.Log.log(`Change Backend: from ${ServerClass_1.Server.backend ? ServerClass_1.Server.backend.name : "No Backend"} to ${newBackend ? newBackend.name : "No Backend"}`);
        ServerClass_1.Server.backend = newBackend;
        ServerClass_1.Server.verificationTasks.forEach(task => task.resetLastSuccess());
        ServerClass_1.Server.nailgunService.restartNailgunServer(ServerClass_1.Server.connection, ServerClass_1.Server.backend);
    }
    else {
        Log_1.Log.log("No need to restart backend. It's still the same");
        ServerClass_1.Server.backend = newBackend;
    }
}
function startOrRestartVerification(uri, manuallyTriggered) {
    //only verify viper source code files
    if (!ServerClass_1.Server.isViperSourceFile(uri)) {
        Log_1.Log.hint("Only viper source files can be verified.");
        return false;
    }
    //only verify if the settings are right
    if (!ServerClass_1.Server.backend) {
        Log_1.Log.log("no backend has been selected, the first was picked by default.", ViperProtocol_1.LogLevel.Debug);
        ServerClass_1.Server.backend = Settings_1.Settings.settings.verificationBackends[0];
        ServerClass_1.Server.nailgunService.startNailgunIfNotRunning(ServerClass_1.Server.connection, ServerClass_1.Server.backend);
    }
    if (!ServerClass_1.Server.nailgunService.ready) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBTWIsd0NBT08sdUJBQXVCLENBQUMsQ0FBQTtBQUcvQixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsMkJBQXVCLFlBQ3ZCLENBQUMsQ0FEa0M7QUFDbkMsZ0NBQXFJLGlCQUNySSxDQUFDLENBRHFKO0FBQ3RKLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELG1DQUErQixvQkFBb0IsQ0FBQyxDQUFBO0FBR3BELDhCQUEwQixlQUFlLENBQUMsQ0FBQTtBQUMxQyw4QkFBcUIsZUFBZSxDQUFDLENBQUE7QUFDckMsSUFBSSxHQUFHLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBRTlCLG9GQUFvRjtBQUNwRixvQkFBTSxDQUFDLFVBQVUsR0FBRyx3Q0FBZ0IsQ0FBQyxJQUFJLHdDQUFnQixDQUFDLE9BQU8sQ0FBQyxFQUFFLElBQUksd0NBQWdCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUNuRyxvQkFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsb0JBQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUUzQyxnQkFBZ0IsRUFBRSxDQUFDO0FBRW5CLDJCQUEyQjtBQUMzQixvQkFBTSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQUUzQjtJQUNJLGdDQUFnQztJQUNoQyxvQkFBTSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxNQUFNO1FBQ2xDLHlCQUFXLENBQUMsVUFBVSxFQUFFLENBQUM7UUFFekIsb0JBQU0sQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQztRQUN2QyxvQkFBTSxDQUFDLGNBQWMsR0FBRyxJQUFJLCtCQUFjLEVBQUUsQ0FBQztRQUM3QyxNQUFNLENBQUM7WUFDSCxZQUFZLEVBQUUsRUFBRTtTQUNu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