/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
 
'use strict'

import { IPCMessageReader, IPCMessageWriter, createConnection, InitializeResult, SymbolInformation } from 'vscode-languageserver'
import * as yargs from 'yargs';
import { Log } from './Log'
import { Settings } from './Settings'
import { Backend, Common, StateColors, ExecutionTrace, ViperSettings, Commands, VerificationState, VerifyRequest, LogLevel, ShowHeapParams } from './ViperProtocol'
import { VerificationTask } from './VerificationTask'
import { Statement } from './Statement'
import { DebugServer } from './DebugServer'
import { Server } from './ServerClass'
import { ViperServerService } from './ViperServerService'

const argv = yargs
    .option('globalStorage', {
        description: 'Path to the global storage folder provided by VSCode to a particular extension',
        type: 'string',
    })
    .help() // show help if `--help` is used
    .argv;
// pass command line option to Settings:
if (argv.globalStorage) {
    Settings.globalStoragePath = argv.globalStorage;
}


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
            return {
                capabilities: {
                    documentSymbolProvider: true,
                    definitionProvider: true
                }
            }
        } catch (e) {
            Log.error("Error handling initialize request: " + e);
        }
    });

    Server.connection.onShutdown(() => {
        try {
            Log.log("On Shutdown", LogLevel.Debug);
            Server.backendService.stop();
        } catch (e) {
            Log.error("Error handling shutdown: " + e);
        }
    })

    Server.connection.onDidChangeConfiguration((change) => {
        try {
            Log.log('Configuration changed', LogLevel.Info);
            const oldSettings = Settings.settings;
            Settings.settings = change.settings.viperSettings as ViperSettings;
            Log.logLevel = Settings.settings.preferences.logLevel; //after this line, Logging works
            Server.refreshEndings();
            Settings.initiateBackendRestartIfNeeded(oldSettings);
        } catch (e) {
            Log.error("Error handling configuration change: " + e);
        }
    });

    Server.connection.onDidChangeTextDocument((change) => {
        let task = Server.verificationTasks.get(change.textDocument.uri.toString());
        if (task) {
            task.symbolInformation = [];
            task.definitions = [];
        }
    });

    /**
     * Relevant bit of documentation: 
     * https://github.com/Microsoft/language-server-protocol/blob/master/versions/protocol-2-x.md#document-symbols-request
     */
    Server.connection.onRequest('textDocument/documentSymbol', (args) => {
        return new Promise<SymbolInformation[]>((resolve, reject) => {
            let task = Server.verificationTasks.get(args.textDocument.uri.toString())
            if (task) {
                resolve(task.symbolInformation)
            } else {
                // No task found - maybe the task has not been created yet. 
                resolve([])
            }
        })
    });

    /**
     * Relevant bit of documentation: 
     * https://github.com/Microsoft/language-server-protocol/blob/master/versions/protocol-2-x.md#goto-definition-request
     */
    Server.connection.onRequest('textDocument/definition', (args) => {
        Log.log(`Handling definitions request for args: ` + JSON.stringify(args), LogLevel.Debug)
        return new Promise<any>((resolve, reject) => {
            let document = args.textDocument
            let pos = args.position
            let task = Server.verificationTasks.get(document.uri.toString());
            if (task) {
                Log.log(`Found verification task for URI ` + document.uri, LogLevel.LowLevelDebug)
                Server.connection.sendRequest(Commands.GetIdentifier, pos).then((word: string) => {
                    Log.log(`Got word: ` + word, LogLevel.LowLevelDebug)
                    if (task.definitions) task.definitions.forEach(def => {
                        if (def.scope == null //global scope
                            || (Common.comparePosition(def.scope.start, pos) <= 0 && Common.comparePosition(def.scope.end, pos) >= 0)) // in scope
                        {
                            if (word == def.name) {
                                resolve({ uri: document.uri.toString(), range: def.location })
                            }
                        }
                    })
                    // No definition found - maybe it's a keyword.
                    resolve([])
                })
            } else {
                let e = `Verification task not found for URI (` + document.uri + `)`
                Log.error(e)
                reject(e)
            }
        })
    });

    Server.connection.onNotification(Commands.StartBackend, (selectedBackend: string) => {
        try {
            if (!selectedBackend || selectedBackend.length == 0) {
                Log.log("No backend was chosen, don't restart backend", LogLevel.Debug);
            } else {
                checkSettingsAndStartServer(selectedBackend);
            }
        } catch (e) {
            Log.error("Error handling select backend request: " + e);
        }
    });

    Server.connection.onNotification(Commands.StopBackend, () => {
        try {
            Server.backendService.stop();
        } catch (e) {
            Log.error("Error handling stop backend request: " + e);
        }
    });

    Server.connection.onNotification(Commands.SwapBackend, (backendName: string) => {
        try {
            Server.backendService.swapBackend(Settings.getBackend(backendName));
        } catch (e) {
            Log.error("Error handling swap backend request: " + e);
        }
    });

    //returns the a list of all backend names
    Server.connection.onRequest(Commands.RequestBackendNames, () => {
        return new Promise<string[]>((resolve, reject) => {
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
                        let task = new VerificationTask(uri);
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
            let uri = params.textDocument.uri;
            Server.isViperSourceFile(uri).then(isViperFile => {
                if (isViperFile) {
                    //notify client;
                    Server.sendFileClosedNotification(uri);
                }
            });
        } catch (e) {
            Log.error("Error handling TextDocument closed");
        }
    });

    Server.connection.onNotification(Commands.FileClosed, (uri) => {
        if (Server.verificationTasks.has(uri)) {
            //remove no longer needed task
            let task = Server.verificationTasks.get(uri);
            task.resetDiagnostics();
            Server.verificationTasks.delete(uri);
        }
    });

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
                Log.log("The verification cannot be started.", LogLevel.Info);
                Server.sendVerificationNotStartedNotification(data.uri);
            }
        } catch (e) {
            Log.error("Error handling verify request: " + e);
            Server.sendVerificationNotStartedNotification(data.uri);
        }
    });

    Server.connection.onNotification(Commands.UpdateViperTools, async () => {
        await Server.ensureViperTools(true);
        // trigger a restart of the backend
        Settings.initiateBackendRestartIfNeeded(null, null, true);
    });

    Server.connection.onNotification(Commands.FlushCache, (file) => {
        if (Server.backendService.isViperServerService) {
            (<ViperServerService>Server.backendService).flushCache(file).catch((e) => {
                Log.error("Error flushing cache: " + e);
            })
        }
    });

    Server.connection.onRequest(Commands.Dispose, () => {
        try {
            //if there are running verifications, stop related processes
            Server.verificationTasks.forEach(task => {
                if (task.running) {
                    //Todo[ATG_6.10.2017]: use UIDs for logging verification tasks.
                    Log.log("stop verification of " + task.filename, LogLevel.Default);
                    Server.backendService.stopVerification();
                }
            });

            console.log("dispose language server");
            return Server.backendService.kill()
        } catch (e) {
            Log.error("Error handling dispose request: " + e);
            return Promise.reject()
        }
    })

    Server.connection.onRequest(Commands.GetExecutionTrace, (params: { uri: string, clientState: number }) => {
        Log.log("Generate execution trace for client state " + params.clientState, LogLevel.Debug);
        return new Promise<ExecutionTrace[]>((resolve, reject) => {
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
        return new Promise<boolean>((resolve, reject) => {
            try {
                let task = Server.verificationTasks.get(uri);
                if (task) {
                    task.abortVerificationIfRunning().then((success) => {
                        Server.sendStateChangeNotification({
                            newState: VerificationState.Ready,
                            verificationCompleted: false,
                            verificationNeeded: false,
                            uri: uri
                        }, task);
                        resolve(success);
                    })
                }
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

    Server.connection.onRequest(Commands.RemoveDiagnostics, (uri: string) => {
        //Log.log("Trying to remove diagnostics from "+ uri);
        return new Promise<boolean>((resolve, reject) => {
            if (Server.verificationTasks.has(uri)) {
                Server.verificationTasks.get(uri).resetDiagnostics();
                resolve(true);
            } else {
                resolve(false);
            }
        });
    });

    Server.connection.onRequest("GetViperServerUrl", () => {
        return new Promise<any>((resolve, reject) => {
            if (Server.backendService instanceof ViperServerService) {
                resolve(Server.backendService.getAddress())
            } else {
                reject("Not running with ViperServer backend");
            }
        });
    });
}

function canVerificationBeStarted(uri: string, manuallyTriggered: boolean): boolean {
    //check if there is already a verification task for that file
    let task = Server.verificationTasks.get(uri);
    if (!task) {
        Log.error("No verification task found for file: " + uri);
        return false;
    } else if (!Server.backendService.isReady()) {
        if (manuallyTriggered) Log.hint("The verification backend is not ready yet");
        Log.error("The verification backend is not ready yet");
        return false;
    }
    return true;
}

function checkSettingsAndStartServer(backendName: string) {
    let backend: Backend;
    Settings.checkSettings(false).then(() => {
        if (Settings.valid()) {
            backend = Settings.selectBackend(Settings.settings, backendName);
            if (backend) {
                changeBackendEngineIfNeeded(backend);
                return Server.backendService.start(backend);
            } else {
                Log.error("cannot start backend " + backendName + ", no configuration found.");
                return false;
            }
        } else {
            return false;
        }
    }).then(success => {
        if (success) {
            Server.backendService.setReady(backend);
        } else {
            Server.backendService.setStopped();
            Log.log("The ViperServer could not be started.", LogLevel.Debug);
        }
    }).catch(reason => {
        if (reason.startsWith("startupFailed")) {
            Log.hint("The ViperServer startup failed, make sure the dependencies are not missing/conflicting.",true,true)
            Log.error("ViperServer: " + reason);
            Server.backendService.setStopped();
            //prevent the timeout from happening
            Server.backendService.instanceCount++;
        } else {
            Log.error("startViperServer failed: " + reason);
            Server.backendService.kill();
        }
    });
}

function changeBackendEngineIfNeeded(backend: Backend) {
    if (Settings.useViperServer(backend) && (!Server.backendService || !Server.backendService.isViperServerService)) {
        Log.log("Start new ViperServerService", LogLevel.LowLevelDebug)
        if (Server.backendService.isSessionRunning) {
            Log.error("A backend change should not happen during an active verification.")
        }
        Server.backendService = new ViperServerService();
    }
}