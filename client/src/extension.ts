'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import * as fs from 'fs';
import * as path from 'path';
import { Timer } from './Timer';
import * as vscode from 'vscode';
import { State } from './ExtensionState';
import { Common, Progress, HintMessage, Versions, VerifyParams, TimingInfo, SettingsCheckedParams, SettingsErrorType, BackendReadyParams, StepsAsDecorationOptionsResult, HeapGraph, VerificationState, Commands, StateChangeParams, LogLevel, Success } from './ViperProtocol';
import Uri from 'vscode-uri/lib/index';
import { Log } from './Log';
import { StateVisualizer, MyDecorationOptions } from './StateVisualizer';
import { Helper } from './Helper';
import { ViperFormatter } from './ViperFormatter';
import { ViperFileState } from './ViperFileState';
import { StatusBar, Color } from './StatusBar';
import { VerificationController, TaskType, CheckResult } from './VerificationController';

let autoSaver: Timer;

let fileSystemWatcher: vscode.FileSystemWatcher;
let formatter: ViperFormatter;

let lastVersionWithSettingsChange: Versions;

export function initializeUnitTest(resolve) {
    State.unitTest = resolve;
    //activate(context);
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    Helper.loadViperFileExtensions();

    Log.log('The ViperIDE is starting up.', LogLevel.Info);

    let ownPackageJson = vscode.extensions.getExtension("rukaelin.viper").packageJSON;
    let defaultConfiguration = ownPackageJson.contributes.configuration.properties;

    lastVersionWithSettingsChange = {
        nailgunSettingsVersion: "0.5.418",
        backendSettingsVersion: "0.5.417",
        pathSettingsVersion: "0.2.15",
        userPreferencesVersion: "0.5.406",
        javaSettingsVersion: "0.2.15",
        advancedFeaturesVersion: "0.5.417",
        defaultSettings: defaultConfiguration
    }

    Log.initialize();
    Log.log('Viper-Client is now active.', LogLevel.Info);
    State.checkOperatingSystem();
    State.context = context;
    State.verificationController = new VerificationController();
    fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/{' + Helper.viperFileEndings.join(",") + "}");
    State.startLanguageServer(context, fileSystemWatcher, false); //break?
    registerHandlers();
    startAutoSaver();
    State.initializeStatusBar(context);
    registerFormatter();
    if (vscode.window.activeTextEditor) {
        let uri = vscode.window.activeTextEditor.document.uri;
        State.setLastActiveFile(uri, vscode.window.activeTextEditor);
    } else {
        Log.log("No active text editor found", LogLevel.Info);
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

export function deactivate(): Promise<any> {
    return new Promise((resolve, reject) => {
        Log.log("deactivate", LogLevel.Info);
        State.dispose().then(() => {
            Log.log("State disposed", LogLevel.Debug);
            //TODO: make sure no doc contains special chars any more
            let oldFile = State.getLastActiveFile();
            if (oldFile) {
                Log.log("Removing special chars of last opened file.", LogLevel.Debug);
                oldFile.stateVisualizer.removeSpecialCharacters(() => {
                    Log.log("Close Log", LogLevel.Debug);
                    Log.dispose();
                    Log.log("Deactivated", LogLevel.Info)
                    resolve();
                });
            } else {
                Log.log("Close Log", LogLevel.Debug);
                Log.dispose();
                Log.log("Deactivated", LogLevel.Info)
                resolve();
            }
        }).catch(e => {
            Log.error("error disposing: " + e);
        });
    });
}

function registerFormatter() {
    formatter = new ViperFormatter();
}

function toggleAutoVerify() {
    State.autoVerify = !State.autoVerify;
    if (State.autoVerify) {
        State.statusBarItem.update("Auto Verify is " + (State.autoVerify ? "on" : "off"), Color.SUCCESS);
    }
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
            Log.log((Log.logLevel >= LogLevel.Debug ? "S: " : "") + msg.data, msg.logLevel);
        });
        State.client.onNotification(Commands.Progress, (msg: { data: Progress, logLevel: LogLevel }) => {
            Log.progress(msg.data, msg.logLevel);
        });
        State.client.onNotification(Commands.ToLogFile, (msg: { data: string, logLevel: LogLevel }) => {
            Log.toLogFile((Log.logLevel >= LogLevel.Debug ? "S: " : "") + msg.data, msg.logLevel);
        });
        State.client.onNotification(Commands.Error, (msg: { data: string, logLevel: LogLevel }) => {
            Log.error((Log.logLevel >= LogLevel.Debug ? "S: " : "") + msg.data, msg.logLevel);
        });

        State.client.onNotification(Commands.ViperUpdateComplete, (success) => {
            if (success) {
                Log.hint("The ViperTools update is complete.");
                State.statusBarItem.update("ViperTools update completed", Color.SUCCESS);
                if (State.unitTest) {
                    State.unitTest({ event: "ViperUpdateComplete" });
                }
            } else {
                Log.hint("The ViperTools update failed. Missing permission: change the ViperTools path in the Settings or manually install the ViperTools.");
                State.statusBarItem.update("ViperTools update failed", Color.ERROR);
                if (State.unitTest) {
                    State.unitTest({ event: "ViperUpdateFailed" });
                }
            }
            State.addToWorklist({ type: TaskType.ViperToolsUpdateComplete, uri: null, manuallyTriggered: false });
            State.statusBarProgress.hide();
        });
        State.client.onNotification(Commands.FileOpened, (uri: string) => {
            try {
                Log.log("File openend: " + path.basename(uri), LogLevel.Info);
                let uriObject: Uri = Uri.parse(uri);
                let fileState = State.getFileState(uri);
                if (fileState) {
                    fileState.open = true;
                    fileState.verifying = false;
                    State.addToWorklist({ type: TaskType.Verify, uri: uriObject, manuallyTriggered: false });
                }
            } catch (e) {
                Log.error("Error handling file opened notification: " + e);
            }
        });
        State.client.onNotification(Commands.FileClosed, (uri: string) => {
            try {
                let uriObject: Uri = Uri.parse(uri);
                Log.log("File closed: " + path.basename(uriObject.path), LogLevel.Info);
                let fileState = State.getFileState(uri);
                if (fileState) {
                    fileState.open = false;
                    fileState.verified = false;
                }
                fileState.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
            } catch (e) {
                Log.error("Error handling file closed notification: " + e);
            }
        });
        State.client.onRequest(Commands.RequestRequiredVersion, () => {
            return getRequiredVersion();
        });
        State.client.onRequest(Commands.GetViperFileEndings, () => {
            Helper.loadViperFileExtensions();
            return Helper.viperFileEndings;
        });
        State.context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((params) => {
            try {
                State.addToWorklist({ type: TaskType.Save, uri: params.uri });
            } catch (e) {
                Log.error("Error handling saved document: " + e);
            }
        }));
        State.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
            try {
                Log.updateSettings();
                State.verificationController.stopDebuggingOnServer();
                State.verificationController.stopDebuggingLocally();
            } catch (e) {
                Log.error("Error handling configuration change: " + e);
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
                                Log.log("The active text editor changed, consider reverification of " + fileState.name(), LogLevel.Debug);
                                State.addToWorklist({ type: TaskType.Verify, uri: uri, manuallyTriggered: false })
                            } else {
                                Log.log("Don't reverify, the file is already verified", LogLevel.Debug);
                            }
                            //Log.log("Active viper file changed to " + fileState.name(), LogLevel.Info);
                        }
                    }
                }
            } catch (e) {
                Log.error("Error handling active text editor change: " + e);
            }
        }));

        State.client.onNotification(Commands.BackendReady, (params: BackendReadyParams) => handleBackendReadyNotification(params));

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
                State.addToWorklist({ type: TaskType.VerificationFailed, uri: Uri.parse(<string>uri), manuallyTriggered: true });
            } catch (e) {
                Log.error("Error handling verification not started request: " + e);
            }
        });

        State.client.onNotification(Commands.StopDebugging, () => {
            State.verificationController.stopDebuggingLocally();
        });

        State.client.onNotification(Commands.StartBackend, (backend) => {
            State.addToWorklist({ type: TaskType.StartBackend, backend: backend, manuallyTriggered: false });
            State.activeBackend = backend;
            State.backendStatusBar.update(backend, Color.READY);
            State.statusBarProgress.hide();
            State.abortButton.hide();
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
                State.addToWorklist({ type: TaskType.Verify, uri: fileUri, manuallyTriggered: true });
            }
        }));

        //verifyAllFilesInWorkspace
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.verifyAllFilesInWorkspace', () => State.verificationController.verifyAllFilesInWorkspace()));

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

        //start Debugging
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.startDebugging', () => startDebugging()));

        //stopVerification
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.stopVerification', () => {
            State.addToWorklist({ type: TaskType.StopVerification, uri: null, manuallyTriggered: true });
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
            State.addToWorklist({ type: TaskType.UpdateViperTools, uri: null, manuallyTriggered: false });
        }));
    });
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
                    if (State.unitTest) {
                        State.unitTest({ event: 'LogFileOpened' });
                    }
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

function canStartDebugging(): CheckResult {
    try {
        let result = false;
        let reason: string;
        let fileState = State.getLastActiveFile();
        if (!Helper.areAdvancedFeaturesEnabled()) {
            reason = "Don't debug, You must first Enable the advanced features in the settings.";
        } else if (!fileState) {
            reason = "Don't debug, no viper file open.";
        } else {
            let uri = fileState.uri;
            let filename = path.basename(uri.toString());
            let dontDebugString = `Don't debug ${filename}, `;
            if (!State.isBackendReady) {
                reason = dontDebugString + "the backend is not ready";
            } else if (State.isVerifying) {
                reason = dontDebugString + "a verification is running", LogLevel.Debug;
            } else if (!fileState.verified) {
                reason = dontDebugString + "the file is not verified, the verificaion will be started.", LogLevel.Debug;
                State.addToWorklist({ type: TaskType.Verify, uri: uri, manuallyTriggered: false });
            } else if (!fileState.stateVisualizer.readyToDebug) {
                reason = dontDebugString + "the verification provided no states";
            } else if (Helper.getConfiguration("advancedFeatures").simpleMode === true && !fileState.stateVisualizer.decorationOptions.some(option => option.isErrorState)) {
                reason = `Don't debug ${filename}. In simple mode debugging can only be started when there is an error state.`;
            } else {
                result = true;
            }
        }
        return {
            result: result,
            reason: reason,
            error: null
        };
    } catch (e) {
        let error = "Error checking if Debugging can be started " + e;
        Log.error(error);
        return {
            result: false,
            reason: null,
            error: error
        };
    }
}

function considerStartingBackend(backendName: string) {
    if (backendName && (!State.isBackendReady || State.activeBackend != backendName)) {
        State.addToWorklist({ type: TaskType.StartBackend, backend: backendName, manuallyTriggered: true })
    } else {
        Log.log("No need to restart backend " + backendName, LogLevel.Info);
    }
}

function startDebugging() {
    try {
        //check if all the requirements are met to start debugging
        let canDebug = canStartDebugging();
        if (canDebug.result) {
            let lastActiveFile = State.getLastActiveFile();
            if (!lastActiveFile) {
                Log.hint("Don't debug there is no file to debug.");
                return;
            }
            let uri = lastActiveFile.uri;
            let filename = path.basename(uri.toString());
            let openDoc = uri.path;
            if (State.isWin) {
                openDoc = openDoc.substring(1, openDoc.length);
            }
            let launchConfig = {
                name: "Viper Debug",
                type: "viper",
                request: "launch",
                program: openDoc,
                startInState: 0,
                //console:"externalConsole"
                internalConsoleOptions: "neverOpen"
            }
            if (State.isDebugging) {
                Log.hint("Don't debug " + filename + ", the file is already being debugged");
                return;
            }
            showStates(() => {
                vscode.commands.executeCommand('vscode.startDebug', launchConfig).then(() => {
                    Log.log('Debug session started successfully', LogLevel.Info);
                    State.isDebugging = true;
                    vscode.commands.executeCommand("workbench.view.debug");
                }, err => {
                    Log.error("Error starting debugger: " + err.message);
                });
            });
        } else if (canDebug.reason) {
            Log.hint(canDebug.reason);
        }
    } catch (e) {
        Log.error("Error starting debug session: " + e);
    }
}

function handleBackendReadyNotification(params: BackendReadyParams) {
    try {
        if (!State.isVerifying) {
            State.statusBarItem.update("ready", Color.READY);
        }
        if (params.restarted) {
            //no file is verifying
            State.resetViperFiles()
            State.addToWorklist({ type: TaskType.Clear, uri: Helper.getActiveFileUri(), manuallyTriggered: false });
            if (Helper.getConfiguration('preferences').autoVerifyAfterBackendChange === true) {
                Log.log("AutoVerify after backend change", LogLevel.Info);
                State.addToWorklist({ type: TaskType.Verify, uri: Helper.getActiveFileUri(), manuallyTriggered: false });
            }
            //for unit testing
            if (State.unitTest) {
                State.unitTest({ event: "BackendStarted", backend: params.name });
            }
        }
        Log.log("Backend ready: " + params.name, LogLevel.Info);
        State.addToWorklist({ type: TaskType.BackendStarted, backend: params.name, manuallyTriggered: true });
    } catch (e) {
        Log.error("Error handling backend started notification: " + e);
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
        let file = vscode.window.activeTextEditor.document.uri.toString();
        State.client.sendRequest(Commands.RemoveDiagnostics, file).then(success => {
            if (success) {
                Log.log("Diagnostics successfully removed", LogLevel.Debug);
            } else {
                Log.log("Removing diagnostics failed", LogLevel.Debug);
            }
        })
    }
}