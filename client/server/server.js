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
var AdmZip = require('adm-zip');
const fs = require('fs');
const http = require('http');
const pathHelper = require('path');
let mkdirp = require('mkdirp');
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
            checkSettingsAndRestartBackendIfNeeded(oldSettings);
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
                checkSettingsAndRestartBackendIfNeeded(null, selectedBackend);
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
                    ServerClass_1.Server.verificationTasks.get(uri).resetDiagnostics();
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
    ServerClass_1.Server.connection.onNotification(ViperProtocol_1.Commands.UpdateViperTools, () => {
        Log_1.Log.log("Updating Viper Tools ...", ViperProtocol_1.LogLevel.Default);
        try {
            let filename;
            if (Settings_1.Settings.isWin) {
                filename = "ViperToolsWin.zip";
            }
            else {
                filename = Settings_1.Settings.isLinux ? "ViperToolsLinux.zip" : "ViperToolsMac.zip";
            }
            //check access to download location
            let dir = Settings_1.Settings.settings.paths.viperToolsPath;
            let viperToolsPath = pathHelper.join(dir, filename);
            makeSureFileExistsAndCheckForWritePermission(viperToolsPath).then(error => {
                if (error) {
                    Log_1.Log.error("The Viper Tools Update failed, change the ViperTools directory to a folder in which you have permission to create files.");
                    Log_1.Log.error(error, ViperProtocol_1.LogLevel.Debug);
                }
                else {
                    //download Viper Tools
                    let url = Settings_1.Settings.settings.preferences.viperToolsProvider;
                    Log_1.Log.log("Downloading ViperTools from " + url + " ...", ViperProtocol_1.LogLevel.Default);
                    Log_1.Log.log("This might take a while as the ViperTools are about 100MB in size.", ViperProtocol_1.LogLevel.Info);
                    download(url, viperToolsPath).then(success => {
                        Log_1.Log.log("Downloading ViperTools finished " + (success ? "" : "un") + "successfully", ViperProtocol_1.LogLevel.Info);
                        if (success) {
                            try {
                                //extract files
                                Log_1.Log.log("Extracting files...", ViperProtocol_1.LogLevel.Info);
                                let zip = new AdmZip(viperToolsPath);
                                zip.extractAllTo(dir, true);
                                //chmod to allow the execution of ng and zg files
                                if (Settings_1.Settings.isLinux || Settings_1.Settings.isMac) {
                                    fs.chmodSync(pathHelper.join(dir, "nailgun", "ng"), 755); //755 is for (read, write, execute)
                                    fs.chmodSync(pathHelper.join(dir, "z3", "bin", "z3"), 755); //755 is for (read, write, execute)
                                }
                                Log_1.Log.log("ViperTools Update completed", ViperProtocol_1.LogLevel.Default);
                                //trigger a restart of the backend
                                checkSettingsAndRestartBackendIfNeeded(null, null, true);
                            }
                            catch (e) {
                                Log_1.Log.error("Error extracting the ViperTools: " + e);
                            }
                        }
                    });
                }
            });
        }
        catch (e) {
            Log_1.Log.error("Error updating viper tools: " + e);
        }
    });
    ServerClass_1.Server.connection.onRequest(ViperProtocol_1.Commands.Dispose, () => {
        return new Promise((resolve, reject) => {
            try {
                //if there are running verifications, stop related processes
                ServerClass_1.Server.verificationTasks.forEach(task => {
                    if (task.running && task.verifierProcess) {
                        Log_1.Log.log("stop verification of " + task.filename);
                        task.nailgunService.killNGAndZ3(task.verifierProcess.pid);
                    }
                });
                //Server.nailgunService.stopNailgunServer();
                console.log("dispose language server");
                ServerClass_1.Server.nailgunService.killNailgunServer();
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
                task.abortVerification().then((success) => {
                    ServerClass_1.Server.sendStateChangeNotification({
                        newState: ViperProtocol_1.VerificationState.Ready,
                        verificationCompleted: false,
                        verificationNeeded: false,
                        uri: uri
                    }, task);
                    resolve(success);
                });
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
    // Server.connection.onRequest(Commands.GetDotExecutable, params => {
    //     return Settings.settings.paths.dotExecutable;
    // });
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
}
function download(url, filePath) {
    return new Promise((resolve, reject) => {
        try {
            let file = fs.createWriteStream(filePath);
            let request = http.get(url, function (response) {
                response.pipe(file);
                file.on('finish', function () {
                    file.close();
                    resolve(true);
                });
            });
            request.on('error', function (err) {
                fs.unlink(filePath);
                Log_1.Log.log("Error downloading viper tools: " + err.message);
                resolve(false);
            });
        }
        catch (e) {
            Log_1.Log.error("Error downloading viper tools: " + e);
        }
    });
}
;
function makeSureFileExistsAndCheckForWritePermission(filePath) {
    return new Promise((resolve, reject) => {
        try {
            let folder = pathHelper.dirname(filePath);
            mkdirp(folder, (err) => {
                if (err && err.code != 'EEXIST') {
                    resolve("Error creating " + folder + " " + err.message);
                }
                else {
                    fs.open(filePath, 'a', (err, file) => {
                        if (err) {
                            resolve("Error opening " + filePath + " " + err.message);
                        }
                        else {
                            fs.close(file, err => {
                                if (err) {
                                    resolve("Error closing " + filePath + " " + err.message);
                                }
                                else {
                                    fs.access(filePath, 2, (e) => {
                                        if (e) {
                                            resolve("Error accessing " + filePath + " " + e.message);
                                        }
                                        else {
                                            resolve(null);
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }
        catch (e) {
            resolve(e);
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
//tries to restart backend, 
function checkSettingsAndRestartBackendIfNeeded(oldSettings, selectedBackend, viperToolsUpdated = false) {
    Settings_1.Settings.checkSettings().then(() => {
        if (Settings_1.Settings.valid()) {
            if (selectedBackend) {
                Settings_1.Settings.selectedBackend = selectedBackend;
            }
            let newBackend = Settings_1.Settings.autoselectBackend(Settings_1.Settings.settings);
            if (newBackend) {
                //only restart the backend after settings changed if the active backend was affected
                let restartBackend = !ServerClass_1.Server.nailgunService.isReady() //backend is not ready -> restart
                    || !Settings_1.Settings.backendEquals(ServerClass_1.Server.backend, newBackend) //change in backend
                    || (oldSettings && (newBackend.useNailgun && (!Settings_1.Settings.nailgunEquals(Settings_1.Settings.settings.nailgunSettings, oldSettings.nailgunSettings))))
                    || viperToolsUpdated; //backend needs nailgun and nailgun settings changed
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
        else {
            ServerClass_1.Server.nailgunService.stopNailgunServer();
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBQ2IsNkRBQTZEO0FBQzdELDhFQUE4RTtBQUU5RSx3Q0FBdUYsdUJBQXVCLENBQUMsQ0FBQTtBQUMvRyxzQkFBb0IsT0FBTyxDQUFDLENBQUE7QUFDNUIsMkJBQXlCLFlBQ3pCLENBQUMsQ0FEb0M7QUFDckMsZ0NBQWlJLGlCQUNqSSxDQUFDLENBRGlKO0FBQ2xKLGlDQUErQixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2xELG1DQUFpQyxvQkFBb0IsQ0FBQyxDQUFBO0FBRXRELDhCQUE0QixlQUFlLENBQUMsQ0FBQTtBQUM1Qyw4QkFBdUIsZUFBZSxDQUFDLENBQUE7QUFDdkMsSUFBSSxNQUFNLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ2hDLE1BQVksRUFBRSxXQUFNLElBQUksQ0FBQyxDQUFBO0FBQ3pCLE1BQVksSUFBSSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBQzdCLE1BQVksVUFBVSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBQ25DLElBQUksTUFBTSxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUUvQixvRkFBb0Y7QUFDcEYsb0JBQU0sQ0FBQyxVQUFVLEdBQUcsd0NBQWdCLENBQUMsSUFBSSx3Q0FBZ0IsQ0FBQyxPQUFPLENBQUMsRUFBRSxJQUFJLHdDQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFDbkcsb0JBQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLG9CQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7QUFFM0MsZ0JBQWdCLEVBQUUsQ0FBQztBQUVuQiwyQkFBMkI7QUFDM0Isb0JBQU0sQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUM7QUFFM0I7SUFDSSxnQ0FBZ0M7SUFDaEMsb0JBQU0sQ0FBQyxVQUFVLENBQUMsWUFBWSxD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