/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */

'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as stripJSONComments from 'strip-json-comments';
import * as rimraf from 'rimraf';
import { Timer } from './Timer';
import { State } from './ExtensionState';
import { SettingsError, Progress, HintMessage, Versions, SettingsCheckedParams, SettingsErrorType, BackendReadyParams, StepsAsDecorationOptionsResult, HeapGraph, Commands, StateChangeParams, LogLevel } from './ViperProtocol';
import { URI } from 'vscode-uri';
import { Log } from './Log';
import { StateVisualizer } from './StateVisualizer';
import { Helper } from './Helper';
import { ViperFormatter } from './ViperFormatter';
import { ViperFileState } from './ViperFileState';
import { Color } from './StatusBar';
import { VerificationController, TaskType, Task } from './VerificationController';
import { ViperApi } from './ViperApi';
import * as Notifier from './Notifier';

let autoSaver: Timer;

let fileSystemWatcher: vscode.FileSystemWatcher;
let formatter: ViperFormatter;

let lastVersionWithSettingsChange: Versions;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
    Helper.loadViperFileExtensions();
    Log.log('The ViperIDE is starting up.', LogLevel.Info);

    let ownPackageJson = vscode.extensions.getExtension("viper-admin.viper").packageJSON;
    let defaultConfiguration = ownPackageJson.contributes.configuration.properties;
    Log.log('The current version of ' + ownPackageJson.displayName + ' is: v.' + ownPackageJson.version, LogLevel.Info);

    lastVersionWithSettingsChange = {
        viperServerSettingsVersion: "1.0.4",
        backendSettingsVersion: "1.0.2",
        pathSettingsVersion: "1.0.1",
        userPreferencesVersion: "0.6.1",
        javaSettingsVersion: "0.6.1",
        advancedFeaturesVersion: "0.6.1",
        defaultSettings: defaultConfiguration,
        extensionVersion: ownPackageJson.version
    }

    Log.initialize();
    Log.log('Viper-Client is now active.', LogLevel.Info);
    State.checkOperatingSystem();
    State.context = context;
    await cleanViperToolsIfRequested(context);
    State.verificationController = new VerificationController();
    fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/{' + Helper.viperFileEndings.join(",") + "}");
    await State.startLanguageServer(context, fileSystemWatcher, false);
    State.viperApi = new ViperApi(State.client);
    registerHandlers();
    Notifier.notifyExtensionActivation();
    startAutoSaver();
    State.initializeStatusBar(context);
    registerFormatter();
    context.subscriptions.push(registerSemanticTokens());
    if (vscode.window.activeTextEditor) {
        let uri = vscode.window.activeTextEditor.document.uri;
        State.setLastActiveFile(uri, vscode.window.activeTextEditor);
    } else {
        Log.log("No active text editor found", LogLevel.Info);
    }
    
    return State.viperApi;
}

async function cleanViperToolsIfRequested(context: vscode.ExtensionContext): Promise<void> {
    // start of in a clean state by wiping Viper Tools if this was requested via
	// environment variables. In particular, this is used for the extension tests.
	if (Helper.cleanInstall()) {
        const globalStoragePath = Helper.getGlobalStoragePath(context);
        let files: string[] = [];
        if (fs.existsSync(globalStoragePath)) {
            // only read directory if it actually exists
            files = await fs.promises.readdir(globalStoragePath);
        }
        if (files.length === 0) {
            Log.log(`cleanInstall has been requested but viper tools do not exist yet --> NOP`, LogLevel.Info);
            return;
        }
        Log.log(`cleanInstall has been requested and viper tools already exist --> delete them`, LogLevel.Info);
        return new Promise((resolve, reject) => {
            // we do not delete `globalStoragePath` but only its content:
            rimraf(path.join(globalStoragePath, '*'), (err: Error) => {
                if (err == null) {
                    resolve();
                } else {
                    reject(err);
                }
            });
        });
	}
}

function getRequiredVersion(): Versions {
    try {
        return lastVersionWithSettingsChange;
    } catch (e) {
        Log.error("Error checking settings version: " + e)
        return null;
    }
}

export async function deactivate(): Promise<void> {
    try {
        Log.log("deactivate", LogLevel.Info);
        await State.dispose();
        Log.log("State disposed", LogLevel.Debug);
        const oldFile = State.getLastActiveFile();
        if (oldFile) {
            Log.log("Removing special chars of last opened file.", LogLevel.Debug);
            await new Promise<void>(resolve => {
                oldFile.stateVisualizer.removeSpecialCharacters(resolve);
            });
        }
        Log.log("Close Log", LogLevel.Debug);
        Log.dispose();
        Log.log("Deactivated", LogLevel.Info)
    } catch (e) {
        Log.error("error disposing: " + e);
    }
}

function registerFormatter() {
    formatter = new ViperFormatter();
}

function registerSemanticTokens(): vscode.Disposable {
    // See https://github.com/microsoft/vscode-extension-samples/blob/main/semantic-tokens-sample/src/extension.ts for a better example

    const tokenTypes = ['keyword'];
    const tokenModifiers = [];
    const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);

    const provider: vscode.DocumentSemanticTokensProvider = {
        provideDocumentSemanticTokens(
            document: vscode.TextDocument
        ): vscode.ProviderResult<vscode.SemanticTokens> {
            // analyze the document and return semantic tokens

            const tokensBuilder = new vscode.SemanticTokensBuilder(legend);
            // on line 1, characters 1-5 are a keyword
            tokensBuilder.push(
            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5)),
            'keyword', []
            );
            return tokensBuilder.build();
        }
    };

    return vscode.languages.registerDocumentSemanticTokensProvider({ language: 'viper' }, provider, legend)
}

function toggleAutoVerify() {
    State.autoVerify = !State.autoVerify;
    State.statusBarItem.update("Auto Verify is " + (State.autoVerify ? "on" : "off"), Color.SUCCESS);
}

function startAutoSaver() {
    let autoSaveTimeout = 1000;//ms
    autoSaver = new Timer(() => {
        //only save viper files
        if (vscode.window.activeTextEditor != null && vscode.window.activeTextEditor.document.languageId == 'viper') {
            if (Helper.getConfiguration('preferences').autoSave === true) {
                vscode.window.activeTextEditor.document.save();
            }
        }
    }, autoSaveTimeout);

    State.context.subscriptions.push(autoSaver);

    let onActiveTextEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(resetAutoSaver);
    let onTextEditorSelectionChange = vscode.window.onDidChangeTextEditorSelection(selectionChange => {
        if (Helper.isViperSourceFile(selectionChange.textEditor.document.uri)) {
            resetAutoSaver();
        }
    });
    State.context.subscriptions.push(onActiveTextEditorChangeDisposable);
    State.context.subscriptions.push(onTextEditorSelectionChange);
}

function resetAutoSaver() {
    autoSaver.reset();
}

function handleSettingsCheckResult(params: SettingsCheckedParams) {
    State.checkedSettings = params.settings;
    if (params.errors && params.errors.length > 0) {
        let nofErrors = 0;
        let nofWarnings = 0;
        let message = "";
        params.errors.forEach(error => {
            switch (error.type) {
                case SettingsErrorType.Error:
                    nofErrors++;
                    Log.error("Settings Error: " + error.msg, LogLevel.Default);
                    break;
                case SettingsErrorType.Warning:
                    nofWarnings++;
                    Log.log("Settings Warning: " + error.msg, LogLevel.Info);
                    break;
            }
            message = error.msg;
        })

        let errorCounts = ((nofErrors > 0 ? ("" + nofErrors + " Error" + (nofErrors > 1 ? "s" : "")) : "") + (nofWarnings > 0 ? (" " + nofWarnings + " Warning" + (nofWarnings > 1 ? "s" : "")) : "")).trim();

        //update status bar
        Log.log(errorCounts + " detected.", LogLevel.Default);
        let text = errorCounts;
        if (nofErrors > 0) {
            State.statusBarItem.update(text, Color.ERROR);
        } else if (nofWarnings > 0) {
            State.statusBarItem.update(text, Color.WARNING);
        }

        if (nofErrors + nofWarnings > 1)
            message = "see View->Output->Viper";
        Log.hint(errorCounts + ": " + message, "Viper Settings", true, true);
    }
}

function registerHandlers() {
    State.client.onReady().then(ready => {

        State.client.onNotification(Commands.StateChange, (params: StateChangeParams) => State.verificationController.handleStateChange(params));
        State.client.onNotification(Commands.SettingsChecked, (data: SettingsCheckedParams) => handleSettingsCheckResult(data));
        State.client.onNotification(Commands.Hint, (data: HintMessage) => {
            Log.hint(data.message, "Viper", data.showSettingsButton, data.showViperToolsUpdateButton);
        });
        State.client.onNotification(Commands.Log, (msg: { data: string, logLevel: LogLevel }) => {
            Log.log(`Server: ${msg.data}`, msg.logLevel);
        });
        State.client.onNotification(Commands.Progress, (msg: { data: Progress, logLevel: LogLevel }) => {
            Log.progress(msg.data, msg.logLevel);
        });
        State.client.onNotification(Commands.ToLogFile, (msg: { data: string, logLevel: LogLevel }) => {
            Log.toLogFile(`Server: ${msg.data}`, msg.logLevel);
        });
        State.client.onNotification(Commands.Error, (msg: { data: string, logLevel: LogLevel }) => {
            Log.error(`Server: ${msg.data}`, msg.logLevel);
        });

        State.client.onNotification(Commands.ViperUpdateComplete, (success) => {
            if (success) {
                Log.hint("The ViperTools update is complete.");
                State.statusBarItem.update("ViperTools update completed", Color.SUCCESS);
                if (State.unitTest) State.unitTest.viperUpdateComplete();

            } else {
                Log.hint("The ViperTools update failed. Missing permission: change the ViperTools path in the Settings or manually install the ViperTools.");
                State.statusBarItem.update("ViperTools update failed", Color.ERROR);
                if (State.unitTest) State.unitTest.viperUpdateFailed();

            }
            State.addToWorklist(new Task({ type: TaskType.ViperToolsUpdateComplete, uri: null, manuallyTriggered: false }));
            State.hideProgress();
        });
        State.client.onNotification(Commands.FileOpened, (uri: string) => {
            try {
                Log.log("File openend: " + uri, LogLevel.Info);
                let uriObject: URI = URI.parse(uri);
                let fileState = State.getFileState(uri);
                if (fileState) {
                    fileState.open = true;
                    fileState.verifying = false;
                    State.addToWorklist(new Task({ type: TaskType.Verify, uri: uriObject, manuallyTriggered: false }));
                }
            } catch (e) {
                Log.error("Error handling file opened notification: " + e);
            }
        });
        State.client.onNotification(Commands.FileClosed, (uri: string) => {
            try {
                let uriObject: URI = URI.parse(uri);
                Log.log("File closed: " + path.basename(uriObject.path), LogLevel.Info);
                let fileState = State.getFileState(uri);
                if (fileState) {
                    fileState.open = false;
                    fileState.verified = false;
                }
                fileState.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
                State.addToWorklist(new Task({ type: TaskType.FileClosed, uri: fileState.uri }));
            } catch (e) {
                Log.error("Error handling file closed notification: " + e);
            }
        });

        // When we don't know how to handle a message, we send it to whoever may be using the ViperApi, because this
        // unexpected message may have been destined for them.
        State.client.onNotification(
            Commands.UnhandledViperServerMessageType,
            (message: any) => { 
                Log.log(`Received non-standard ViperServer message of type ${message.msg_type}.`, LogLevel.Default);
                State.viperApi.notifyServerMessage(message.msg_type, message); 
            }
        );

        State.client.onRequest(Commands.RequestRequiredVersion, () => {
            return getRequiredVersion();
        });
        State.client.onRequest(Commands.GetIdentifier, (position) => {
            try {
                let range = vscode.window.activeTextEditor.document.getWordRangeAtPosition(new vscode.Position(position.line, position.character))
                let res = vscode.window.activeTextEditor.document.getText(range);
                if(res.indexOf(" ")> 0) return null
                //Log.log("GetIdentifier: " + res, LogLevel.LowLevelDebug);
                return res;
            } catch (e) {
                Log.error("Error getting indentifier: " + e);
                return null;
            }
        });
        State.client.onRequest(Commands.CheckIfSettingsVersionsSpecified, () => {
            return checkIfSettingsVersionsSpecified();
        });
        State.client.onRequest(Commands.GetViperFileEndings, () => {
            Helper.loadViperFileExtensions();
            return Helper.viperFileEndings;
        });
        State.context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((params) => {
            try {
                State.addToWorklist(new Task({ type: TaskType.Save, uri: params.uri }));
            } catch (e) {
                Log.error("Error handling saved document: " + e);
            }
        }));
        State.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
            try {
                Log.updateSettings();
                State.verificationController.stopDebuggingOnServer();
                State.verificationController.stopDebuggingLocally();
            } catch (e) {
                Log.error("Error handling configuration change: " + e);
            }
            if (event.affectsConfiguration("viperSettings.buildVersion")) {
                Log.log(`buildVersion has been changed in the settings`, LogLevel.Info);
                // IDE should be reopened such that changes take effect:
                vscode.window.showInformationMessage(
                    "Changed the build version of Viper Tools. Please restart the IDE.");
            }
        }));
        //trigger verification texteditorChange
        State.context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
            try {
                let editor = vscode.window.activeTextEditor;
                if (editor) {
                    let uri = editor.document.uri;
                    if (Helper.isViperSourceFile(uri)) {
                        let oldViperFile: ViperFileState = State.getLastActiveFile();
                        if (oldViperFile) {
                            //change in active viper file, remove special characters from the previous one
                            if (oldViperFile.uri.toString() !== uri.toString()) {
                                oldViperFile.decorationsShown = false;
                                if (State.isDebugging) {
                                    oldViperFile.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
                                    State.verificationController.stopDebuggingOnServer();
                                    State.verificationController.stopDebuggingLocally();
                                }
                            }
                        }
                        let fileState = State.setLastActiveFile(uri, editor);
                        if (fileState) {
                            if (!fileState.verified) {
                                //Log.log("The active text editor changed, consider reverification of " + fileState.name(), LogLevel.Debug);
                                State.addToWorklist(new Task({ type: TaskType.Verify, uri: uri, manuallyTriggered: false }))
                            } else {
                                //Log.log("Don't reverify, the file is already verified", LogLevel.Debug);
                            }
                            //Log.log("Active viper file changed to " + fileState.name(), LogLevel.Info);
                        }
                    }
                }
            } catch (e) {
                Log.error("Error handling active text editor change: " + e);
            }
        }));

        State.client.onNotification(Commands.BackendReady, (params: BackendReadyParams) => State.verificationController.handleBackendReadyNotification(params));

        //Heap visualization
        State.client.onNotification(Commands.StepsAsDecorationOptions, params => {
            try {
                let castParams = <StepsAsDecorationOptionsResult>params;
                if (!castParams) {
                    Log.error("Invalid Params for StepsAdDecorationOptions");
                }
                let visualizer = State.getVisualizer(castParams.uri);
                visualizer.storeNewStates(castParams);
            } catch (e) {
                Log.error("Error handling steps as decoration options notification: " + e);
            }
        });

        State.client.onRequest(Commands.HeapGraph, (heapGraph: HeapGraph) => {
            try {
                if (!heapGraph) return;
                if (Helper.areAdvancedFeaturesEnabled()) {
                    let visualizer = State.getVisualizer(heapGraph.fileUri);
                    let state = visualizer.decorationOptions[heapGraph.state];
                    if (Helper.getConfiguration("advancedFeatures").simpleMode === true) {
                        //Simple Mode
                        if (state.isErrorState) {
                            //replace the error state
                            visualizer.focusOnState(heapGraph);
                        } else {
                            //replace the execution state
                            visualizer.setState(heapGraph);
                        }
                    } else {
                        //Advanced Mode
                        if (heapGraph.state != visualizer.previousState) {
                            visualizer.pushState(heapGraph);
                        }
                    }
                } else {
                    Log.log("WARNING: Heap Graph is generated, even though the advancedFeatures are disabled.", LogLevel.Debug);
                }
            } catch (e) {
                Log.error("Error displaying HeapGraph: " + e);
            }
        });

        vscode.window.onDidChangeTextEditorSelection((change) => {
            try {
                if (!change.textEditor.document) {
                    Log.error("document is undefined in onDidChangeTextEditorSelection");
                    return;
                }
                let uri = change.textEditor.document.uri.toString();
                let start = change.textEditor.selection.start;
                let visualizer = State.getVisualizer(uri);
                if (visualizer) {
                    visualizer.showStateSelection(start);
                }
            } catch (e) {
                Log.error("Error handling text editor selection change: " + e);
            }
        });

        /*State.client.onRequest(Commands.StateSelected, change => {
            try {
                let castChange = <{ uri: string, line: number, character: number }>change;
                if (!castChange) {
                    Log.error("error casting stateSelected Request data");
                }
                let visualizer = State.viperFiles.get(castChange.uri).stateVisualizer;
                visualizer.showStateSelection({ line: castChange.line, character: castChange.character });
            } catch (e) {
                Log.error("Error handling state selected request: " + e);
            }
        });*/

        State.client.onNotification(Commands.VerificationNotStarted, uri => {
            try {
                Log.log("Verification not started for " + path.basename(<string>uri), LogLevel.Debug);
                //reset the verifying flag if it is not beeing verified
                State.viperFiles.forEach(file => {
                    file.verifying = false;
                });
                State.isVerifying = false;
                State.addToWorklist(new Task({ type: TaskType.VerificationFailed, uri: URI.parse(<string>uri), manuallyTriggered: true }));
            } catch (e) {
                Log.error("Error handling verification not started request: " + e);
            }
        });

        State.client.onNotification(Commands.StopDebugging, () => {
            State.verificationController.stopDebuggingLocally();
        });

        State.client.onNotification(Commands.StartBackend, data => {
            State.addToWorklist(new Task({
                type: TaskType.StartBackend,
                backend: data.backend,
                forceRestart: data.forceRestart,
                manuallyTriggered: false,
                isViperServerEngine: data.isViperServer
            }));
            State.activeBackend = data.backend;
            State.backendStatusBar.update(data.backend, Color.READY);
            State.hideProgress();
        });

        //Command Handlers
        //verify
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.verify', () => {
            let fileUri = Helper.getActiveFileUri();
            if (!fileUri) {
                Log.log("Cannot verify, no document is open.", LogLevel.Info);
            } else if (!Helper.isViperSourceFile(fileUri)) {
                Log.log("Cannot verify the active file, its not a viper file.", LogLevel.Info);
            } else {
                State.addToWorklist(new Task({ type: TaskType.Verify, uri: fileUri, manuallyTriggered: true }));
            }
        }));

        //verifyAllFilesInWorkspace
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.verifyAllFilesInWorkspace', (folder) => State.verificationController.verifyAllFilesInWorkspace(folder)));

        //toggleAutoVerify
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.toggleAutoVerify', () => toggleAutoVerify()));

        //showAllStates
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.showAllStates', () => {
            if (State.isDebugging) {
                let viperFile = State.getLastActiveFile();
                if ((!Helper.getConfiguration("advancedFeatures").simpleMode === true) && viperFile) {
                    viperFile.stateVisualizer.showAllDecorations();
                }
            }
        }));

        State.context.subscriptions.push(vscode.commands.registerCommand('viper.flushCache', () => flushCache(true)));

        State.context.subscriptions.push(vscode.commands.registerCommand('viper.flushCacheOfActiveFile', () => flushCache(false)));

        //selectBackend
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.selectBackend', (selectBackend) => {
            try {
                if (!State.client) {
                    Log.hint("Extension not ready yet.");
                } else {
                    State.client.sendRequest(Commands.RequestBackendNames, null).then((backendNames: string[]) => {
                        if (backendNames.length > 1) {
                            if (selectBackend && backendNames.some(x => x == selectBackend)) {
                                considerStartingBackend(selectBackend);
                            } else {
                                vscode.window.showQuickPick(backendNames).then(selectedBackend => {
                                    if (selectedBackend && selectedBackend.length > 0) {
                                        considerStartingBackend(selectedBackend);
                                    } else {
                                        Log.log("No backend was selected, don't change the backend", LogLevel.Info);
                                    }
                                });
                            }
                        } else {
                            Log.log("No need to ask user, since there is only one backend.", LogLevel.Debug);
                            considerStartingBackend(backendNames[0]);
                        }
                    }, (reason) => {
                        Log.error("Backend change request was rejected: reason: " + reason.toString());
                    });
                }
            } catch (e) {
                Log.error("Error selecting backend: " + e);
            }
        }));

        //stopVerification
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.stopVerification', () => {
            State.addToWorklist(new Task({ type: TaskType.StopVerification, uri: null, manuallyTriggered: true }));
        }));

        //format
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.format', () => {
            try {
                formatter.formatOpenDoc();
            } catch (e) {
                Log.error("Error handling formating request: " + e);
            }
        }));

        //open logFile
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.openLogFile', () => openLogFile()));

        //remove diagnostics of open file
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.removeDiagnostics', () => removeDiagnostics()));

        //automatic installation and updating of viper tools
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.updateViperTools', () => {
            State.addToWorklist(new Task({ type: TaskType.UpdateViperTools, uri: null, manuallyTriggered: false }));
        }));
    });
}

function flushCache(allFiles: boolean) {
    if (!State.isActiveViperEngine) {
        Log.log("Cannot flush cache, the active backend-engine is not the ViperServer", LogLevel.Info);
        return;
    }

    if (!allFiles) {
        let fileUri = Helper.getActiveFileUri();
        if (!fileUri) {
            Log.log("Cannot flush cache, no active viper file found", LogLevel.Info);
        } else {
            Log.log("Request to flush the cache of " + path.basename(fileUri.fsPath), LogLevel.Info);
            State.client.sendNotification(Commands.FlushCache, fileUri.fsPath);
        }
    } else {
        Log.log("Request to flush the entire cache", LogLevel.Info);
        State.client.sendNotification(Commands.FlushCache, null);
    }
}

function openLogFile() {
    try {
        Log.log("Open logFile located at: " + Log.logFilePath, LogLevel.Info);
        vscode.workspace.openTextDocument(Log.logFilePath).then(textDocument => {
            if (!textDocument) {
                Log.hint("Cannot open the logFile, it is too large to be opened within VSCode.");
            } else {
                vscode.window.showTextDocument(textDocument, vscode.ViewColumn.Two).then(() => {
                    Log.log("Showing logfile succeeded", LogLevel.Debug);
                    if (State.unitTest) State.unitTest.logFileOpened();
                }, error => {
                    Log.error("vscode.window.showTextDocument call failed while opening the logfile: " + error);
                });
            }
        }, error => {
            Log.error("vscode.window.openTextDocument command failed while opening the logfile: " + error);
        });
    } catch (e) {
        Log.error("Error opening logFile: " + e);
    }
}

function considerStartingBackend(backendName: string) {
    if (backendName && (!State.isBackendReady || State.activeBackend != backendName)) {
        State.addToWorklist(new Task({
            type: TaskType.StartBackend,
            backend: backendName,
            manuallyTriggered: true,
            forceRestart: false,
            isViperServerEngine: false //TODO: how to set that correctly

        }));
    } else {
        Log.log("No need to restart backend " + backendName, LogLevel.Info);
    }
}


function showStates(callback) {
    try {
        if (Helper.areAdvancedFeaturesEnabled()) {
            if (!StateVisualizer.showStates) {
                StateVisualizer.showStates = true;
                let visualizer = State.getLastActiveFile().stateVisualizer;
                visualizer.removeSpecialCharacters(() => {
                    visualizer.addCharacterToDecorationOptionLocations(() => {
                        visualizer.showDecorations();
                        callback();
                    });
                });
            } else {
                Log.log("don't show states, they are already shown", LogLevel.Debug);
            }
        }
    } catch (e) {
        Log.error("Error showing States: " + e);
    }
}

function removeDiagnostics() {
    if (vscode.window.activeTextEditor) {
        let uri = vscode.window.activeTextEditor.document.uri
        let file = uri.toString();
        State.diagnosticCollection.delete(uri);
        /*State.client.sendRequest(Commands.RemoveDiagnostics, file).then(success => {
            if (success) {
                Log.log("Diagnostics successfully removed", LogLevel.Debug);
            } else {
                Log.log("Removing diagnostics failed", LogLevel.Debug);
            }
        })*/
    }
}

function checkIfSettingsVersionsSpecified(): Thenable<SettingsError[]> {
    return new Promise((resolve, reject) => {
        try {
            //userSettings
            let userSettingsPath = getUserSettingsPath();
            let errors = checkSettingsFile(userSettingsPath);
            //workspaceSettings
            let workspaceSettingsPath = getWorkspaceSettingsPath();
            if (workspaceSettingsPath && fs.existsSync(workspaceSettingsPath)) {
                errors = errors.concat(checkSettingsFile(workspaceSettingsPath));
            }
            if (errors.length > 0) {
                resolve(errors);
            } else {
                resolve(null);
            }
        } catch (e) {
            Log.error("Error checking Settings files: " + e);
            resolve(null);
        }
    })
}

const settings = [
    "viperSettings.viperServerSettings",
    "viperSettings.paths",
    "viperSettings.preferences",
    "viperSettings.javaSettings",
    "viperSettings.advancedFeatures"]

//check if each specified viper setting has a v field in the file located at path 
function checkSettingsFile(path: string): SettingsError[] {
    let errors: SettingsError[] = [];
    let content = fs.readFileSync(path).toString();
    if (content) {
        let json = JSON.parse(stripJSONComments(content));
        if (json) {
            //check objects
            settings.forEach(viperSetting => {
                if (json[viperSetting] && !json[viperSetting].v) {
                    errors.push({
                        type: SettingsErrorType.Error,
                        msg: viperSetting + " is missing a v field."
                    })
                }
            });
            //check arrays
            let backendSettings = "viperSettings.verificationBackends";
            if (json[backendSettings]) {
                json[backendSettings].forEach(backend => {
                    if (backend && !backend.v) {
                        errors.push({
                            type: SettingsErrorType.Error,
                            msg: "backend " + backend.name + " is missing a v field."
                        })
                    }
                });
            }
        }
    }
    return errors;
}

function getUserSettingsPath(): string {
    let userSettingsPath;
    if (State.isWin) {
        userSettingsPath = path.join(process.env['APPDATA'], "Code", "User", "settings.json");
    } else if (State.isLinux) {
        userSettingsPath = path.join(os.homedir(), ".config", "Code", "User", "settings.json");
    } else {
        userSettingsPath = path.join(os.homedir(), "Library", "Application Support", "Code", "User", "settings.json");
    }
    return userSettingsPath;
}
function getWorkspaceSettingsPath(): string {
    if (vscode.workspace.workspaceFolders) {
        return path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, ".vscode", "settings.json");
    }
    return;
}
