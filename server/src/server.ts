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

main().catch((err) => {
	console.error(`main function has ended with an error: ${err}`);
	process.exit(1);
});

async function main() {
    const argv = await yargs(process.argv.slice(2))
        .option('globalStorage', {
            description: 'Path to the global storage folder provided by VSCode to a particular extension',
            type: 'string',
        })
        .option('logDir', {
            description: 'Path to a folder in which log files should be stored',
            type: 'string',
        })
        .help() // show help if `--help` is used
        .parse();
    // pass command line option to Settings:
    if (argv.globalStorage) {
        Settings.globalStoragePath = argv.globalStorage;
    }
    if (argv.logDir) {
        Settings.logDirPath = argv.logDir;
    }


    // Create a connection for the server. The connection uses Node's IPC as a transport
    Server.connection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
    Server.documents.listen(Server.connection);

    registerHandlers();

    // Listen on the connection
    Server.connection.listen();
}

function registerHandlers(): void {
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

    Server.connection.onShutdown(async () => {
        try {
            Log.log("On Shutdown", LogLevel.Debug);
            const res = await Server.backendService.kill()
            Log.log(`Backend service has been stopped (result: ${res})`, LogLevel.Debug);
        } catch (e) {
            const msg = `Error handling shutdown: ${e}`;
            Log.error(msg);
            // rethrow error:
            throw new Error(msg);
        }
    })

    Server.connection.onDidChangeConfiguration(async (change) => {
        try {
            Log.log('Configuration changed', LogLevel.Info);
            const oldSettings = Settings.settings;
            Settings.settings = change.settings.viperSettings as ViperSettings;
            Log.logLevel = Settings.settings.preferences.logLevel; //after this line, Logging works
            await Server.refreshEndings();
            await Settings.initiateBackendRestartIfNeeded(oldSettings);
        } catch (e) {
            const msg = `Error handling configuration change: ${e}`;
            Log.error(msg);
            // rethrow error:
            throw new Error(msg);
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
        const task = Server.verificationTasks.get(args.textDocument.uri.toString())
        if (task) {
            return task.symbolInformation;
        } else {
            // No task found - maybe the task has not been created yet. 
            return [];
        }
    });

    /**
     * Relevant bit of documentation: 
     * https://github.com/Microsoft/language-server-protocol/blob/master/versions/protocol-2-x.md#goto-definition-request
     */
    Server.connection.onRequest('textDocument/definition', async (args) => {
        Log.log(`Handling definitions request for args: ` + JSON.stringify(args), LogLevel.Debug);
        const document = args.textDocument
        const pos = args.position
        const task = Server.verificationTasks.get(document.uri.toString());
        if (task) {
            Log.log(`Found verification task for URI ` + document.uri, LogLevel.LowLevelDebug)
            const word = await Server.connection.sendRequest(Commands.GetIdentifier, pos);
            Log.log(`Got word: ` + word, LogLevel.LowLevelDebug);
            if (task.definitions) {
                task.definitions.forEach(def => {
                    if (def.scope == null // global scope or in scope:
                        || (Common.comparePosition(def.scope.start, pos) <= 0 && Common.comparePosition(def.scope.end, pos) >= 0)) {
                        if (word == def.name) {
                            return { uri: document.uri.toString(), range: def.location }
                        }
                    }
                });
            }
            // No definition found - maybe it's a keyword.
            return [];
        } else {
            const e = `Verification task not found for URI (` + document.uri + `)`
            Log.error(e);
            throw new Error(e);
        }
    });

    Server.connection.onNotification(Commands.StartBackend, async (selectedBackend: string) => {
        try {
            if (!selectedBackend || selectedBackend.length == 0) {
                Log.log("No backend was chosen, don't restart backend", LogLevel.Debug);
            } else {
                await checkSettingsAndStartServer(selectedBackend);
            }
        } catch (e) {
            const msg = `Error handling select backend request: ${e}`;
            Log.error(msg);
            // rethrow error:
            throw new Error(msg);
        }
    });

    Server.connection.onNotification(Commands.StopBackend, async () => {
        try {
           await Server.backendService.stop();
        } catch (e) {
            const msg = `Error handling stop backend request: ${e}`;
            Log.error(msg);
            // rethrow error:
            throw new Error(msg);
        }
    });

    Server.connection.onNotification(Commands.SwapBackend, (backendName: string) => {
        try {
            Server.backendService.swapBackend(Settings.getBackend(backendName));
        } catch (e) {
            const msg = `Error handling swap backend request: ${e}`;
            Log.error(msg);
            // rethrow error:
            throw new Error(msg);
        }
    });

    //returns the a list of all backend names
    Server.connection.onRequest(Commands.RequestBackendNames, async () => {
        try {
            const backendNames: string[] = Settings.getBackendNames(Settings.settings);
            if (!backendNames) {
                throw new Error("No backend found");
            }
            else {
                return backendNames;
            }
        } catch (e) {
            const msg = `Error handling backend names request: ${e}`;
            Log.error(msg);
            // rethrow error:
            throw new Error(msg);
        }
    });

    Server.connection.onDidOpenTextDocument(async (params) => {
        try {
            const res = await Server.isViperSourceFile(params.textDocument.uri);
            if (res) {
                const uri = params.textDocument.uri;
                //notify client:
                Server.sendFileOpenedNotification(params.textDocument.uri);
                if (!Server.verificationTasks.has(uri)) {
                    //create new task for opened file
                    const task = new VerificationTask(uri);
                    Server.verificationTasks.set(uri, task);
                }
            }
        } catch (e) {
            const msg = `Error handling TextDocument openend: ${e}`;
            Log.error(msg);
            // rethrow error:
            throw new Error(msg);
        }
    });

    Server.connection.onDidCloseTextDocument(async (params) => {
        try {
            const uri = params.textDocument.uri;
            const isViperFile = await Server.isViperSourceFile(uri);
            if (isViperFile) {
                //notify client;
                Server.sendFileClosedNotification(uri);
            }
        } catch (e) {
            const msg = `Error handling TextDocument closed: ${e}`;
            Log.error(msg);
            // rethrow error:
            throw new Error(msg);
        }
    });

    Server.connection.onNotification(Commands.FileClosed, (uri) => {
        if (Server.verificationTasks.has(uri)) {
            //remove no longer needed task
            const task = Server.verificationTasks.get(uri);
            task.resetDiagnostics();
            Server.verificationTasks.delete(uri);
        }
    });

    Server.connection.onNotification(Commands.Verify, async (data: VerifyRequest) => {
        try {
            //it does not make sense to reverify if no changes were made and the verification is already running
            if (canVerificationBeStarted(data.uri, data.manuallyTriggered)) {
                Settings.workspace = data.workspace;
                Log.log("start or restart verification", LogLevel.Info);
                //stop all other verifications because the backend crashes if multiple verifications are run in parallel
                await VerificationTask.stopAllRunningVerifications();
                Log.log(`other verifications have been stopped`, LogLevel.LowLevelDebug);
                //start verification
                Server.executedStages = [];
                const verificationstarted = Server.verificationTasks.get(data.uri).verify(data.manuallyTriggered);
                if (!verificationstarted) {
                    Server.sendVerificationNotStartedNotification(data.uri);
                }
            } else {
                Log.log("The verification cannot be started.", LogLevel.Info);
                Server.sendVerificationNotStartedNotification(data.uri);
            }
        } catch (e) {
            const msg = `Error handling verify request: ${e}`;
            Log.error(msg);
            // the error is not rethrown but we send a notification:
            Server.sendVerificationNotStartedNotification(data.uri);
        }
    });

    Server.connection.onNotification(Commands.UpdateViperTools, async () => {
        await Server.ensureViperTools(true);
    });

    Server.connection.onNotification(Commands.FlushCache, async (file) => {
        try {
            if (Server.backendService.isViperServerService) {
                await (<ViperServerService>Server.backendService).flushCache(file);
            }
        } catch (e) {
            const msg = `Error flushing cache: ${e}`;
            Log.error(msg);
            // rethrow error:
            throw new Error(msg);
        }
    });

    Server.connection.onRequest(Commands.StopAllVerifications, async () => {
        try {
            //if there are running verifications, stop related processes
            const tasks = Array.from(Server.verificationTasks.values());
            const stopPromises = tasks.map(task => {
                if (task.running) {
                    //Todo[ATG_6.10.2017]: use UIDs for logging verification tasks.
                    Log.log("stop verification of " + task.filename, LogLevel.Default);
                    return Server.backendService.stopVerification();
                } else {
                    Promise.resolve(true);
                }
            });
            await Promise.all(stopPromises);
            return tasks.every(res => res);
        } catch (e) {
            const msg = `Error handling stop all verifications request: ${e}`;
            Log.error(msg);
            // rethrow error:
            throw new Error(msg);
        }
    })

    Server.connection.onRequest(Commands.GetExecutionTrace, async (params: { uri: string, clientState: number }) => {
        Log.log("Generate execution trace for client state " + params.clientState, LogLevel.Debug);
        let result: ExecutionTrace[] = [];
        try {
            const task = Server.verificationTasks.get(params.uri);
            let serverState = task.clientStepIndexToServerStep[params.clientState];
            let maxDepth = serverState.depthLevel();
            const dark = Settings.settings.advancedFeatures.darkGraphs === true;

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
                const depth = serverState.depthLevel();
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
            return result;
        } catch (e) {
            const msg = `Error handling Execution Trace Request: ${e}`;
            Log.error(msg);
            // rethrow error:
            throw new Error(msg);
        }
    });

    Server.connection.onRequest(Commands.StopVerification, async (uri: string) => {
        try {
            const task = Server.verificationTasks.get(uri);
            if (task) {
                await task.abortVerificationIfRunning();
                Server.sendStateChangeNotification({
                    newState: VerificationState.Ready,
                    verificationCompleted: false,
                    verificationNeeded: false,
                    uri: uri
                }, task);
            }
            return true;
        } catch (e) {
            const msg = `Error handling stop verification request (critical): ${e}`;
            Log.error(msg);
            // rethrow error:
            throw new Error(msg);
        }
    });

    Server.connection.onNotification(Commands.StopDebugging, () => {
        try {
            DebugServer.stopDebugging();
        } catch (e) {
            const msg = `Error handling stop debugging request: ${e}`;
            Log.error(msg);
            // rethrow error:
            throw new Error(msg);
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
            const msg = `Error showing heap: ${e}`;
            Log.error(msg);
            // rethrow error:
            throw new Error(msg);
        }
    });

    Server.connection.onRequest(Commands.RemoveDiagnostics, (uri: string) => {
        if (Server.verificationTasks.has(uri)) {
            Server.verificationTasks.get(uri).resetDiagnostics();
            return true;
        } else {
            return false;
        }
    });

    Server.connection.onRequest("GetViperServerUrl", () => {
        if (Server.backendService instanceof ViperServerService) {
            return Server.backendService.getAddress();
        } else {
            const msg = `Not running with ViperServer backend, cannot return its address`;
            Log.error(msg);
            throw new Error(msg);
        }
    });
}

function canVerificationBeStarted(uri: string, manuallyTriggered: boolean): boolean {
    //check if there is already a verification task for that file
    const task = Server.verificationTasks.get(uri);
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

async function checkSettingsAndStartServer(backendName: string): Promise<void> {
    try {
        const valid = Settings.upToDateAndValid();
        if (!valid) {
            const errs = Settings.getErrors();
            return Promise.reject(new Error(`backend start skipped because of invalid or out-dated settings: ${errs}`));
        }
        const backend = Settings.selectBackend(Settings.settings, backendName);
        if (backend) {
            changeBackendEngineIfNeeded(backend);
            const success = await Server.backendService.start(backend);
            if (success) {
                Server.backendService.setReady(backend);
            } else {
                Server.backendService.setStopped();
                Log.log("The ViperServer could not be started.", LogLevel.Debug);
            }
        } else {
            const errMsg = `cannot start backend ${backendName}, no configuration found.`;
            Log.error(errMsg);
            return Promise.reject(new Error(errMsg));
        }
    } catch (reason) {
        if (reason.startsWith("startupFailed")) {
            Log.hint("The ViperServer startup failed, make sure the dependencies are not missing/conflicting.",true,true)
            Log.error("ViperServer: " + reason);
            Server.backendService.setStopped();
        } else {
            Log.error("startViperServer failed: " + reason);
            await Server.backendService.kill();
        }
        // rethrow error:
        return Promise.reject(new Error(reason));
    }
}

function changeBackendEngineIfNeeded(backend: Backend): void {
    if (Settings.useViperServer(backend) && (!Server.backendService || !Server.backendService.isViperServerService)) {
        Log.log("Start new ViperServerService", LogLevel.LowLevelDebug)
        if (Server.backendService.isSessionRunning) {
            Log.error("A backend change should not happen during an active verification.")
        }
        Server.backendService = new ViperServerService();
    }
}
