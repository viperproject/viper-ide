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
//let count =0;
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
    ServerClass_1.Server.connection.onExit(() => {
        Log_1.Log.log("On Exit", ViperProtocol_1.LogLevel.Debug);
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
            //Log.log("New configuration: "+JSON.stringify(change));
            Log_1.Log.log('configuration changed' + (++ServerClass_1.Server.count), ViperProtocol_1.LogLevel.Info);
            //check settings
            let error = Settings_1.Settings.checkSettings(Settings_1.Settings.settings);
            if (error) {
                ServerClass_1.Server.connection.sendNotification(ViperProtocol_1.Commands.InvalidSettings, error);
                return;
            }
            Log_1.Log.log("The settings are ok", ViperProtocol_1.LogLevel.Info);
            //pass the new settings to the verificationService and the Log
            ServerClass_1.Server.nailgunService.changeSettings(Settings_1.Settings.settings);
            restartBackendIfNeeded();
        }
        catch (e) {
            Log_1.Log.error("Error handling configuration change: " + e);
        }
    });
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.SelectBackend, (selectedBackend) => {
        if (!Settings_1.Settings.settings.valid) {
            ServerClass_1.Server.connection.sendNotification(ViperProtocol_1.Commands.InvalidSettings, "Cannot start backend, fix settings first.");
            return;
        }
        if (selectedBackend) {
            Settings_1.Settings.selectedBackend = selectedBackend;
        }
        restartBackendIfNeeded();
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
    ServerClass_1.Server.connection.onDidChangeWatchedFiles((change) => {
        Log_1.Log.log("We recevied a file change event", ViperProtocol_1.LogLevel.Debug);
    });
    ServerClass_1.Server.connection.onDidOpenTextDocument((params) => {
        if (ServerClass_1.Server.isViperSourceFile(params.textDocument.uri)) {
            let uri = params.textDocument.uri;
            //notify client;
            ServerClass_1.Server.connection.sendNotification(ViperProtocol_1.Commands.FileOpened, params.textDocument.uri);
            if (!ServerClass_1.Server.verificationTasks.has(uri)) {
                //create new task for opened file
                let task = new VerificationTask_1.VerificationTask(uri, ServerClass_1.Server.nailgunService, ServerClass_1.Server.connection);
                ServerClass_1.Server.verificationTasks.set(uri, task);
                //Log.log(`${uri} opened, task created`, LogLevel.Debug);
                if (ServerClass_1.Server.nailgunService.ready) {
                }
            }
        }
    });
    ServerClass_1.Server.connection.onDidCloseTextDocument((params) => {
        if (ServerClass_1.Server.isViperSourceFile(params.textDocument.uri)) {
            let uri = params.textDocument.uri;
            //notify client;
            ServerClass_1.Server.connection.sendNotification(ViperProtocol_1.Commands.FileClosed, uri);
            if (ServerClass_1.Server.verificationTasks.has(uri)) {
                //remove no longer needed task
                ServerClass_1.Server.verificationTasks.delete(uri);
            }
        }
    });
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.Verify, (data) => {
        try {
            let verificationstarted = false;
            if (ServerClass_1.Server.isViperSourceFile(data.uri)) {
                let alreadyRunning = false;
                if (data.manuallyTriggered) {
                    //it does not make sense to reverify if no changes were made and the verification is already running
                    ServerClass_1.Server.verificationTasks.forEach(task => {
                        if (task.running && task.fileUri === data.uri) {
                            alreadyRunning = true;
                        }
                    });
                }
                if (!alreadyRunning) {
                    Settings_1.Settings.workspace = data.workspace;
                    verificationstarted = startOrRestartVerification(data.uri, false, data.manuallyTriggered);
                }
            }
            else if (data.manuallyTriggered) {
                Log_1.Log.hint("This system can only verify .sil and .vpr files");
            }
            if (!verificationstarted) {
            }
        }
        catch (e) {
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
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.ShowHeap, (params) => {
        try {
            let task = ServerClass_1.Server.verificationTasks.get(params.uri);
            if (!task) {
                Log_1.Log.error("No verificationTask found for " + params.uri);
                return;
            }
            ServerClass_1.Server.showHeap(task, params.index);
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
        //stop all running verifications
        ServerClass_1.Server.nailgunService.restartNailgunServer(ServerClass_1.Server.connection, ServerClass_1.Server.backend);
    }
    else {
        Log_1.Log.log("No need to restart backend. The setting changes did not affect it.");
        ServerClass_1.Server.backend = newBackend;
    }
}
function startOrRestartVerification(uri, onlyTypeCheck, manuallyTriggered) {
    //only verify if the settings are right
    if (!Settings_1.Settings.settings.valid) {
        ServerClass_1.Server.connection.sendNotification(ViperProtocol_1.Commands.InvalidSettings, "Cannot verify, fix the settings first.");
        return false;
    }
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
    return task.verify(onlyTypeCheck, manuallyTriggered);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBTWIsd0NBT08sdUJBQXVCLENBQUMsQ0FBQTtBQUcvQixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsMkJBQXVCLFlBQ3ZCLENBQUMsQ0FEa0M7QUFDbkMsZ0NBQXNILGlCQUN0SCxDQUFDLENBRHNJO0FBQ3ZJLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELG1DQUErQixvQkFBb0IsQ0FBQyxDQUFBO0FBR3BELDhCQUEwQixlQUFlLENBQUMsQ0FBQTtBQUMxQyw4QkFBcUIsZUFBZSxDQUFDLENBQUE7QUFDckMsSUFBSSxHQUFHLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBRTlCLG9GQUFvRjtBQUNwRixvQkFBTSxDQUFDLFVBQVUsR0FBRyx3Q0FBZ0IsQ0FBQyxJQUFJLHdDQUFnQixDQUFDLE9BQU8sQ0FBQyxFQUFFLElBQUksd0NBQWdCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUNuRyxvQkFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsb0JBQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUUzQyxnQkFBZ0IsRUFBRSxDQUFDO0FBRW5CLDJCQUEyQjtBQUMzQixvQkFBTSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQUUzQixlQUFlO0FBRWY7SUFDSSxnQ0FBZ0M7SUFDaEMsb0JBQU0sQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUMsTUFBTTtRQUNsQyx5QkFBVyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBRXpCLG9CQUFNLENBQUMsYUFBYSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUM7UUFDdkMsb0JBQU0sQ0FBQyxjQUFjLEdBQUcsSUFBSSwrQkFBYyxFQUFFLENBQUM7UUFDN0MsTUFBTSxDQUFDO1lBQ0gsWUFBWSxFQUFF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