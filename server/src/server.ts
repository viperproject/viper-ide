'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import { IPCMessageReader, IPCMessageWriter, createConnection, InitializeResult } from 'vscode-languageserver';
import { Log } from './Log';
import { Settings } from './Settings'
import { StateColors, ExecutionTrace, ViperSettings, Commands, VerificationState, VerifyRequest, LogLevel, ShowHeapParams } from './ViperProtocol'
import { NailgunService } from './NailgunService';
import { VerificationTask } from './VerificationTask';
import { Statement } from './Statement';
import { DebugServer } from './DebugServer';
import { Server } from './ServerClass';
var AdmZip = require('adm-zip');
import * as fs from 'fs';
import * as http from 'http';
import * as pathHelper from 'path';
let mkdirp = require('mkdirp');

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
            Log.log("Debug Server is initializing", LogLevel.LowLevelDebug);
            DebugServer.initialize();

            Server.refreshEndings();

            //Server.workspaceRoot = params.rootPath;
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
            Log.log('Configuration changed', LogLevel.Info);
            let oldSettings = Settings.settings;
            Settings.settings = <ViperSettings>change.settings.viperSettings;
            Log.logLevel = Settings.settings.preferences.logLevel; //after this line, Logging works
            Server.refreshEndings();
            checkSettingsAndRestartBackendIfNeeded(oldSettings);
        } catch (e) {
            Log.error("Error handling configuration change: " + e);
        }
    });

    Server.connection.onNotification(Commands.StartBackend, (selectedBackend: string) => {
        try {
            if (!selectedBackend || selectedBackend.length == 0) {
                Log.log("No backend was chosen, don't restart backend", LogLevel.Debug);
            } else {
                //recheck settings upon backend change
                checkSettingsAndRestartBackendIfNeeded(null, selectedBackend);
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
            Server.isViperSourceFile(params.textDocument.uri).then(res => {
                if (res) {
                    let uri = params.textDocument.uri;
                    //notify client;
                    Server.sendFileOpenedNotification(params.textDocument.uri);
                    if (!Server.verificationTasks.has(uri)) {
                        //create new task for opened file
                        let task = new VerificationTask(uri, Server.nailgunService);
                        Server.verificationTasks.set(uri, task);
                    }
                }
            });
        } catch (e) {
            Log.error("Error handling TextDocument openend");
        }
    });

    Server.connection.onDidCloseTextDocument((params) => {
        try {
            Server.isViperSourceFile(params.textDocument.uri).then(res => {
                if (res) {
                    let uri = params.textDocument.uri;
                    //notify client;
                    Server.sendFileClosedNotification(uri);
                    if (Server.verificationTasks.has(uri)) {
                        //remove no longer needed task
                        Server.verificationTasks.get(uri).resetDiagnostics();
                        Server.verificationTasks.delete(uri);
                    }
                }
            });
        } catch (e) {
            Log.error("Error handling TextDocument closed");
        }
    });

    function canVerificationBeStarted(uri: string, manuallyTriggered: boolean): boolean {
        //check if there is already a verification task for that file
        let task = Server.verificationTasks.get(uri);
        if (!task) {
            Log.error("No verification task found for file: " + uri);
            return false;
        } else if (!Server.nailgunService.isReady()) {
            if (manuallyTriggered)
                Log.hint("The verification backend is not ready yet");
            Log.error("The verification backend is not ready yet");
            return false;
        }
        return true;
    }

    Server.connection.onNotification(Commands.Verify, (data: VerifyRequest) => {
        try {
            let verificationstarted = false;
            //it does not make sense to reverify if no changes were made and the verification is already running
            if (canVerificationBeStarted(data.uri, data.manuallyTriggered)) {
                Settings.workspace = data.workspace;
                Log.log("start or restart verification", LogLevel.Info);
                //stop all other verifications because the backend crashes if multiple verifications are run in parallel
                VerificationTask.stopAllRunningVerifications().then(success => {
                    //start verification
                    Server.executedStages = [];
                    verificationstarted = Server.verificationTasks.get(data.uri).verify(data.manuallyTriggered) === true;
                    if (!verificationstarted) {
                        Server.sendVerificationNotStartedNotification(data.uri);
                    }
                }, () => {
                    Server.sendVerificationNotStartedNotification(data.uri);
                });
            } else {
                Log.log("The verification cannot be started.");
                Server.sendVerificationNotStartedNotification(data.uri);
            }
        } catch (e) {
            Log.error("Error handling verify request: " + e);
            Server.sendVerificationNotStartedNotification(data.uri);
        }
    });

    Server.connection.onNotification(Commands.UpdateViperTools, () => {
        Log.log("Updating Viper Tools ...", LogLevel.Default);
        try {
            let filename: string;
            if (Settings.isWin) {
                filename = "ViperToolsWin.zip"
            } else {
                filename = Settings.isLinux ? "ViperToolsLinux.zip" : "ViperToolsMac.zip";
            }
            //check access to download location
            let dir = Settings.settings.paths.viperToolsPath;
            let viperToolsPath = pathHelper.join(dir, filename);
            makeSureFileExistsAndCheckForWritePermission(viperToolsPath).then(error => {
                if (error) {
                    Log.error("The Viper Tools Update failed, change the ViperTools directory to a folder in which you have permission to create files.");
                    Log.error(error, LogLevel.Debug);
                } else {
                    //download Viper Tools
                    let url = <string>Settings.settings.preferences.viperToolsProvider;
                    Log.log("Downloading ViperTools from " + url + " ...", LogLevel.Default)
                    Log.log("This might take a while as the ViperTools are about 100MB in size.", LogLevel.Info)
                    download(url, viperToolsPath).then(success => {
                        Log.log("Downloading ViperTools finished " + (success ? "" : "un") + "successfully", LogLevel.Info);
                        if (success) {
                            try {
                                //extract files
                                Log.log("Extracting files...", LogLevel.Info)
                                let zip = new AdmZip(viperToolsPath);
                                zip.extractAllTo(dir, true);

                                //chmod to allow the execution of ng and zg files
                                if (Settings.isLinux || Settings.isMac) {
                                    fs.chmodSync(pathHelper.join(dir, "nailgun", "ng"), 755) //755 is for (read, write, execute)
                                    fs.chmodSync(pathHelper.join(dir, "z3", "bin", "z3"), 755) //755 is for (read, write, execute)
                                    fs.chmodSync(pathHelper.join(dir, "boogie", "Binaries", "Boogie"), 755);
                                }

                                Log.log("ViperTools Update completed", LogLevel.Default);

                                Server.connection.sendNotification(Commands.ViperUpdateComplete, true);//success

                                //trigger a restart of the backend
                                checkSettingsAndRestartBackendIfNeeded(null, null, true);
                            } catch (e) {
                                if (e.code && e.code == 'ENOENT') {
                                    Log.error("Error updating the Viper Tools, missing create file permission in the viper tools directory: "+ e);
                                } else {
                                    Log.error("Error extracting the ViperTools: " + e);
                                }
                                Server.connection.sendNotification(Commands.ViperUpdateComplete, false);//update failed
                            }
                        }
                    });
                }
            });

        } catch (e) {
            Log.error("Error updating viper tools: " + e);
        }
    });

    Server.connection.onRequest(Commands.Dispose, () => {
        return new Promise((resolve, reject) => {
            try {
                //if there are running verifications, stop related processes
                Server.verificationTasks.forEach(task => {
                    if (task.running && task.verifierProcess) {
                        Log.log("stop verification of " + task.filename);
                        task.nailgunService.killNGAndZ3(task.verifierProcess.pid);
                    }
                });

                //Server.nailgunService.stopNailgunServer();
                console.log("dispose language server");
                Server.nailgunService.killNailgunServer();
                resolve();
            } catch (e) {
                Log.error("Error handling dispose request: " + e);
                reject();
            }
        });
    });

    Server.connection.onRequest(Commands.GetExecutionTrace, (params: { uri: string, clientState: number }) => {
        Log.log("Generate execution trace for client state " + params.clientState, LogLevel.Debug);
        return new Promise((resolve, reject) => {
            let result: ExecutionTrace[] = [];
            try {
                let task = Server.verificationTasks.get(params.uri);
                let serverState = task.clientStepIndexToServerStep[params.clientState];
                let maxDepth = serverState.depthLevel();
                let dark = Settings.settings.advancedFeatures.darkGraphs === true;

                if (!Settings.settings.advancedFeatures.simpleMode) {
                    //ADVANCED MODE ONLY
                    //get stateExpansion states
                    serverState.verifiable.forAllExpansionStatesWithDecoration(serverState, (child: Statement) => {
                        result.push({
                            state: child.decorationOptions.index,
                            color: StateColors.uninterestingState(dark),
                            showNumber: true
                        });
                    });
                    //get top level statements
                    serverState.verifiable.getTopLevelStatesWithDecoration().forEach(child => {
                        result.push({
                            state: child.decorationOptions.index,
                            color: StateColors.uninterestingState(dark),
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
                            color: StateColors.interestingState(dark),
                            showNumber: true
                        })//push client state
                    }
                    if (serverState.isBranch()) {
                        serverState = serverState.parent;
                    } else if (!serverState.parent) {
                        break;
                    } else {
                        serverState = task.steps[serverState.index - 1];
                    }
                    task.shownExecutionTrace = result;
                }
                resolve(result);
            } catch (e) {
                Log.error("Error handling Execution Trace Request: " + e);
                resolve(result);
            }
        });
    });

    Server.connection.onRequest(Commands.StopVerification, (uri: string) => {
        return new Promise((resolve, reject) => {
            try {
                let task = Server.verificationTasks.get(uri);
                task.abortVerificationIfRunning().then((success) => {
                    Server.sendStateChangeNotification({
                        newState: VerificationState.Ready,
                        verificationCompleted: false,
                        verificationNeeded: false,
                        uri: uri
                    }, task);
                    resolve(success);
                })
            } catch (e) {
                Log.error("Error handling stop verification request (critical): " + e);
                resolve(false);
            }
        });
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
            Server.showHeap(task, params.clientIndex, params.isHeapNeeded);
        } catch (e) {
            Log.error("Error showing heap: " + e);
        }
    });

    // Server.connection.onRequest(Commands.GetDotExecutable, params => {
    //     return Settings.settings.paths.dotExecutable;
    // });

    Server.connection.onRequest(Commands.RemoveDiagnostics, (uri: string) => {
        //Log.log("Trying to remove diagnostics from "+ uri);
        return new Promise((resolve, reject) => {
            if (Server.verificationTasks.has(uri)) {
                Server.verificationTasks.get(uri).resetDiagnostics();
                resolve(true);
            } else {
                resolve(false);
            }
        });
    });
}

function download(url, filePath): Thenable<boolean> {
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
                Log.log("Error downloading viper tools: " + err.message);
                resolve(false);
            });
        } catch (e) {
            Log.error("Error downloading viper tools: " + e);
        }
    });
};

function checkForCreateAndWriteAccess(folderPath: string): Thenable<string> {
    return new Promise((resolve, reject) => {
        fs.stat((folderPath), (err, stats) => {
            if (err) {
                if (err.code == 'ENOENT') {
                    //no such file or directory
                    let path = pathHelper.parse(folderPath).dir;
                    let match = path.match(/(^.*)[\/\\].+$/) //the regex retrieves the parent directory
                    if (match && match[1]) {
                        checkForCreateAndWriteAccess(match[1]).then(err => {
                            //pass along the error
                            resolve(err);
                        });
                    } else {
                        resolve("No access"); //TODO: when does that happens?
                    }
                }
                else if (err.code == 'EACCES') {
                    resolve("No read permission");
                } else {
                    resolve(err.message);
                }
            }
            let writePermissions = stats.mode & 0x92;
            if (writePermissions) {
                resolve(null);
            } else {
                resolve("No write permission");
            }
        });
    });
}

function makeSureFileExistsAndCheckForWritePermission(filePath: string): Thenable<string> {
    return new Promise((resolve, reject) => {
        try {
            let folder = pathHelper.dirname(filePath);
            mkdirp(folder, (err) => {
                if (err && err.code != 'EEXIST') {
                    resolve("Error creating " + folder + " " + err.message);
                } else {
                    fs.open(filePath, 'a', (err, file) => {
                        if (err) {
                            resolve("Error opening " + filePath + " " + err.message)
                        } else {
                            fs.close(file, err => {
                                if (err) {
                                    resolve("Error closing " + filePath + " " + err.message)
                                } else {
                                    fs.access(filePath, 2, (e) => { //fs.constants.W_OK is 2
                                        if (e) {
                                            resolve("Error accessing " + filePath + " " + e.message)
                                        } else {
                                            resolve(null);
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        } catch (e) {
            resolve(e);
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

//tries to restart backend, 
function checkSettingsAndRestartBackendIfNeeded(oldSettings: ViperSettings, selectedBackend?: string, viperToolsUpdated: boolean = false) {
    Settings.checkSettings().then(() => {
        if (Settings.valid()) {
            if (selectedBackend) {
                Settings.selectedBackend = selectedBackend;
            }
            let newBackend = Settings.autoselectBackend(Settings.settings);
            if (newBackend) {
                //only restart the backend after settings changed if the active backend was affected
                let restartBackend = !Server.nailgunService.isReady() //backend is not ready -> restart
                    || !Settings.backendEquals(Server.backend, newBackend) //change in backend
                    || (oldSettings && (newBackend.useNailgun && (!Settings.nailgunEquals(Settings.settings.nailgunSettings, oldSettings.nailgunSettings))))
                    || viperToolsUpdated; //backend needs nailgun and nailgun settings changed
                if (restartBackend) {
                    Log.log(`Change Backend: from ${Server.backend ? Server.backend.name : "No Backend"} to ${newBackend ? newBackend.name : "No Backend"}`, LogLevel.Info);
                    Server.backend = newBackend;
                    Server.verificationTasks.forEach(task => task.resetLastSuccess());
                    Server.nailgunService.startOrRestartNailgunServer(Server.backend, true);
                } else {
                    Log.log("No need to restart backend. It is still the same", LogLevel.Debug)
                    Server.backend = newBackend;
                    Server.sendBackendReadyNotification({ name: Server.backend.name, restarted: false });
                }
            } else {
                Log.error("No backend, even though the setting check succeeded.");
            }
        } else {
            Server.nailgunService.stopNailgunServer();
        }
    });
}