'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import * as debug from './debug';
import * as fs from 'fs';
var ps = require('ps-node');
import * as path from 'path';
import {LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind, NotificationType } from 'vscode-languageclient';
import {Timer} from './Timer';
import * as vscode from 'vscode';
import {ExtensionState} from './ExtensionState';
import {BackendReadyParams, StepsAsDecorationOptionsResult, HeapGraph, VerificationState, Commands, StateChangeParams, LogLevel, Success} from './ViperProtocol';
import Uri from '../node_modules/vscode-uri/lib/index';
import {Log} from './Log';
import {StateVisualizer} from './StateVisualizer';
import {Helper} from './Helper';
import {MyDecorationOptions} from './StateVisualizer';
import {ViperFormatter} from './ViperFormatter';
import {ViperFileState} from './ViperFileState';

let statusBarItem;
let statusBarProgress;
let backendStatusBar;
let abortButton;
let autoSaver: Timer;
let state: ExtensionState;

let verificationController: Timer;

let fileSystemWatcher: vscode.FileSystemWatcher;
//let manuallyTriggered: boolean;

let formatter: ViperFormatter;

let workList: Task[];

let verifiedFile: string;
let _backendReady: boolean = false;

let lastActiveTextEditor: vscode.Uri;

interface Task {
    type: TaskType;
    uri?: vscode.Uri;
    manuallyTriggered?: boolean;
    success?: Success;
}

enum TaskType {
    Save, Verify, NoOp//Open,Close, VerificationCompleted
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    workList = [];
    ExtensionState.viperFiles = new Map<string, ViperFileState>();
    Log.initialize(context);
    Log.log('Viper-Client is now active!', LogLevel.Info);
    state = ExtensionState.createExtensionState();
    state.checkOperatingSystem();
    context.subscriptions.push(state);
    fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/*.sil, **/*.vpr');
    state.startLanguageServer(context, fileSystemWatcher, false); //break?
    registerHandlers();
    startAutoSaver();
    initializeStatusBar();
    Log.deleteDotFiles();
    registerFormatter();
    let uri = vscode.window.activeTextEditor.document.uri;
    lastActiveTextEditor = Helper.isViperSourceFile(uri.toString()) ? uri : null;
    startVerificationController();
}

function resetViperFiles() {
    Log.log("Reset all viper files", LogLevel.Info);
    ExtensionState.viperFiles.forEach(element => {
        element.changed = true;
        element.verified = false;
        element.verifying = false;
        element.decorationsShown = false;
        element.stateVisualizer.completeReset();
    });
}

function isBackendReady(prefix: string) {
    if (!_backendReady) {
        Log.log(prefix + "Backend is not ready.", LogLevel.Debug);
    }
    return _backendReady;
}

function startVerificationController() {
    let verificationTimeout = 100;//ms
    verificationController = new Timer(() => {
        try {
            let done = false;
            let i = 0;

            //remove leading NoOps
            while (workList.length > 0 && workList[0].type == TaskType.NoOp) {
                workList.shift();
            }

            while (!done && workList.length > i) {
                let task = workList[i++];
                if (!Helper.isViperSourceFile(task.uri.toString())) {
                    task.type = TaskType.NoOp;
                    Log.log("Warning: Only handle viper files, not file: " + path.basename(task.uri.toString()), LogLevel.Info);
                    continue;
                }
                let fileState = ExtensionState.viperFiles.get(task.uri.toString());
                if (!fileState) {
                    Log.error("The file is unknown to the verification controller: " + path.basename(task.uri.toString()), LogLevel.Debug);
                    continue;
                }
                switch (task.type) {
                    case TaskType.Verify:
                        let dontVerify = `Don't verify ${path.basename(task.uri.toString())}: `;
                        if (isBackendReady(dontVerify)) {
                            //Log.log("Verify " + path.basename(task.uri.toString()) + " is handled", LogLevel.Info);

                            let activeFile;
                            if (vscode.window.activeTextEditor) {
                                activeFile = vscode.window.activeTextEditor.document.uri.toString();
                            }

                            if (!fileState.open) {
                                Log.log(dontVerify + "file is closed", LogLevel.Debug);
                            } else if (fileState.verifying) {
                                Log.log(dontVerify + `file is verifying`, LogLevel.Debug);
                                //} else if (!task.manuallyTriggered && !fileState.changed) {
                                //    Log.log(dontVerify+`!manuallyTriggered and file is not changed`, LogLevel.Debug);
                            } else if (!task.manuallyTriggered && fileState.verified) {
                                Log.log(dontVerify + `not manuallyTriggered and file is verified`, LogLevel.Debug);
                            }/* else if (!task.manuallyTriggered && fileState.success === Success.Aborted) {
                                Log.log(dontVerify + `not manuallyTriggered and file was aborted when last verified`, LogLevel.Debug);
                            } else if (!task.manuallyTriggered && fileState.success === Success.Error) {
                                Log.log(dontVerify + `not manuallyTriggered and file caused error when last verified`, LogLevel.Debug);
                            }*/
                            else if (!activeFile) {
                                Log.log(dontVerify + `no file is active`, LogLevel.Debug);
                            } else if (activeFile !== task.uri.toString()) {
                                Log.log(dontVerify + `another file is active`, LogLevel.Debug);
                                // } else if (fileState.decorationsShown && !task.manuallyTriggered) {
                                //     Log.log(dontVerify+`not manuallyTriggered and the decorations are shown`, LogLevel.Debug);
                            } else {
                                verify(fileState, task.manuallyTriggered);
                            }
                        } else {
                            Log.log("Backend is not ready, wait for backend to start.", LogLevel.Info);
                        }
                        task.type = TaskType.NoOp;
                        break;
                    case TaskType.Save:
                        if (fileState.onlySpecialCharsChanged) {
                            fileState.onlySpecialCharsChanged = false;
                        } else {
                            //Log.log("Save " + path.basename(task.uri.toString()) + " is handled", LogLevel.Info);
                            fileState.changed = true;
                            //TODO: ignore saves due to special characters
                            fileState.verified = false;

                            if (ExtensionState.isDebugging) {
                                stopDebugging();
                            }
                            workList.push({ type: TaskType.Verify, uri: task.uri, manuallyTriggered: false });
                        }
                        task.type = TaskType.NoOp;
                        break;
                    // case TaskType.VerificationCompleted:
                    //     task.type = TaskType.NoOp;
                    //     break;
                    // case TaskType.Open:
                    //     Log.log("Open " + task.uri.path + " is handled", LogLevel.Info);
                    //     workList.push({ type: TaskType.Verify, uri: task.uri, manuallyTriggered: false });
                    //     task.type = TaskType.NoOp;
                    //     break;
                    // case TaskType.Close:
                    //     viperFiles.get(task.uri.toString()).open = false;
                    //     task.type = TaskType.NoOp;
                    //     break;
                }
            }
        } catch (e) {
            Log.error("Error in verification controller: " + e);
            workList.shift();
        }
    }, verificationTimeout);
    state.context.subscriptions.push(verificationController);

    //trigger verification texteditorChange
    state.context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        try {
            let editor = vscode.window.activeTextEditor;
            if (editor) {
                let uri = editor.document.uri;
                if (Helper.isViperSourceFile(uri.toString())) {
                    if (lastActiveTextEditor) {
                        if (lastActiveTextEditor.toString() === uri.toString()) {
                            Log.log("No change in active viper file", LogLevel.Debug);
                            return;
                        }
                        let oldFileState = ExtensionState.viperFiles.get(lastActiveTextEditor.toString());
                        oldFileState.decorationsShown = false;
                        oldFileState.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
                        if (ExtensionState.isDebugging) {
                            stopDebugging();
                        }
                    }
                    let fileState = ExtensionState.viperFiles.get(uri.toString());
                    if (fileState) {
                        fileState.setEditor(editor);

                        if (fileState.verified) {
                            //showStates(()=>{});
                        } else {
                            Log.log("reverify because the active text editor changed", LogLevel.Debug);
                            workList.push({ type: TaskType.Verify, uri: uri, manuallyTriggered: false })
                        }
                        Log.log("Active viper file changed to " + path.basename(uri.toString()), LogLevel.Info);
                        lastActiveTextEditor = uri;
                    } else {
                        Log.log("No fileState for selected editor, It is not a viper file", LogLevel.Debug);
                    }
                }
            }
        } catch (e) {
            Log.error("Error handling active text editor change: " + e);
        }
    }));
}

export function deactivate() {
    Log.log("deactivate", LogLevel.Info);
    state.dispose();
    //TODO: make sure no doc contains special chars any more
    let oldFileState = ExtensionState.viperFiles.get(lastActiveTextEditor.toString());
    oldFileState.stateVisualizer.removeSpecialCharacters(() => {
        Log.log("deactivated", LogLevel.Info);
    });
}

function registerFormatter() {
    formatter = new ViperFormatter();
}

function initializeStatusBar() {
    //state.state = VerificationState.Stopped;

    statusBarProgress = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 11);
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    updateStatusBarItem(statusBarItem, "Hello from Viper", "white");

    abortButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9);
    abortButton.command = "extension.stopVerification";
    updateStatusBarItem(abortButton, "$(x) Stop", "orange", null, false)

    state.context.subscriptions.push(statusBarProgress);
    state.context.subscriptions.push(statusBarItem);
    state.context.subscriptions.push(abortButton);

    backendStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 12);
}

function updateStatusBarItem(item, text: string, color: string, tooltip: string = null, show: boolean = true) {
    item.text = text;
    item.color = color;
    item.tooltip = tooltip;
    if (show) {
        item.show();
    } else {
        item.hide();
    }
}

function startAutoSaver() {
    let autoSaveTimeout = 1000;//ms
    autoSaver = new Timer(() => {
        //only save viper files
        if (vscode.window.activeTextEditor != null && vscode.window.activeTextEditor.document.languageId == 'viper') {
            if (Helper.getConfiguration('autoSave') === true) {
                //manuallyTriggered = false;
                vscode.window.activeTextEditor.document.save();
            }
        }
    }, autoSaveTimeout);

    state.context.subscriptions.push(autoSaver);

    let onActiveTextEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(resetAutoSaver);
    let onTextEditorSelectionChange = vscode.window.onDidChangeTextEditorSelection(resetAutoSaver);
    state.context.subscriptions.push(onActiveTextEditorChangeDisposable);
    state.context.subscriptions.push(onTextEditorSelectionChange);
}

function resetAutoSaver() {
    autoSaver.reset();
}

function handleStateChange(params: StateChangeParams) {
    try {
        if (!params.progress)
            Log.log("The new state is: " + VerificationState[params.newState], LogLevel.Debug);
        let window = vscode.window;
        switch (params.newState) {
            case VerificationState.Starting:
                _backendReady = false;
                updateStatusBarItem(statusBarItem, 'starting', 'orange'/*,"Starting " + params.backendName*/);
                break;
            case VerificationState.VerificationRunning:
                let showProgressBar = Helper.getConfiguration('showProgress') === true;
                if (!params.progress) {
                    updateStatusBarItem(statusBarItem, "pre-processing", 'orange');
                    updateStatusBarItem(statusBarProgress, progressBarText(0), 'white', null, showProgressBar);
                }
                else {
                    updateStatusBarItem(statusBarItem, `verifying ${params.filename}: ` + params.progress.toFixed(1) + "%", 'orange');
                    updateStatusBarItem(statusBarProgress, progressBarText(params.progress), 'white', null, showProgressBar);
                }
                abortButton.show();
                break;
            case VerificationState.PostProcessing:
                updateStatusBarItem(statusBarItem, `postprocessing ${params.filename}: `, 'white');
                break;
            case VerificationState.Stage:
                Log.log("Run " + params.stage + " for " + params.filename);
                updateStatusBarItem(statusBarItem, `File ${params.filename}: Stage ${params.stage}`, 'white');
            case VerificationState.Ready:
                statusBarProgress.hide();
                abortButton.hide();

                ExtensionState.viperFiles.forEach(file => {
                    file.verifying = false;
                });

                if (!params.verificationCompleted) {
                    updateStatusBarItem(statusBarItem, "ready", 'white');
                }
                else {
                    let uri = vscode.Uri.parse(params.uri);

                    //since at most one file can be verified at a time, set all to non-verified before potentially setting one to verified 
                    ExtensionState.viperFiles.forEach(state => state.verified = false);
                    ExtensionState.viperFiles.get(params.uri).success = params.success;
                    if (params.success != Success.Aborted && params.success != Success.Error) {
                        ExtensionState.viperFiles.get(params.uri).verified = true;
                    }

                    //workList.push({ type: TaskType.VerificationCompleted, uri: uri, success: params.success });
                    let msg: string = "";
                    switch (params.success) {
                        case Success.Success:
                            msg = `Successfully verified ${params.filename} in ${params.time.toFixed(1)} seconds`;
                            Log.log(msg, LogLevel.Default);
                            updateStatusBarItem(statusBarItem, "$(check) " + msg, 'lightgreen');
                            if (params.manuallyTriggered) Log.hint(msg);
                            //for SymbexLogger
                            let symbexDotFile = path.resolve(path.join(vscode.workspace.rootPath, ".vscode", "dot_input.dot"));
                            let symbexSvgFile = path.resolve(path.join(vscode.workspace.rootPath, ".vscode", "symbExLoggerOutput.svg"))
                            if (Helper.getConfiguration("advancedFeatures") === true && fs.existsSync(symbexDotFile)) {
                                let fileState = ExtensionState.viperFiles.get(params.uri);
                                fileState.stateVisualizer.generateSvg(symbexDotFile, symbexSvgFile, () => { });
                            }
                            break;
                        case Success.ParsingFailed:
                            msg = `Parsing ${params.filename} failed after ${params.time.toFixed(1)} seconds`;
                            Log.log(msg, LogLevel.Default);
                            updateStatusBarItem(statusBarItem, "$(x) " + msg, 'red');
                            break;
                        case Success.TypecheckingFailed:
                            msg = `Type checking ${params.filename} failed after ${params.time.toFixed(1)} seconds with ${params.nofErrors} error${params.nofErrors == 1 ? "s" : ""}`;
                            Log.log(msg, LogLevel.Default);
                            updateStatusBarItem(statusBarItem, "$(x) " + msg, 'red');
                            break;
                        case Success.VerificationFailed:
                            msg = `Verifying ${params.filename} failed after ${params.time.toFixed(1)} seconds with ${params.nofErrors} error${params.nofErrors == 1 ? "s" : ""}`;
                            Log.log(msg, LogLevel.Default);
                            updateStatusBarItem(statusBarItem, "$(x) " + msg, 'red');
                            break;
                        case Success.Aborted:
                            updateStatusBarItem(statusBarItem, "Verification aborted", 'orange');
                            Log.log(`Verifying ${params.filename} was aborted`, LogLevel.Info);
                            break;
                        case Success.Error:
                            let moreInfo = " - see View->Output->Viper for more info"
                            updateStatusBarItem(statusBarItem, `$(x) Internal error` + moreInfo, 'red');
                            msg = `Verifying ${params.filename} failed due to an internal error`;
                            Log.log(`Internal Error: failed to verify ${params.filename}: Reason: ` + (params.error && params.error.length > 0 ? params.error : "Unknown Reason: Set loglevel to 5 and see the viper.log file for more details"));
                            Log.hint(msg + moreInfo);
                            break;
                    }
                }
                break;
            case VerificationState.Stopping:
                updateStatusBarItem(statusBarItem, 'preparing', 'orange');
                break;
            case VerificationState.Stopped:
                updateStatusBarItem(statusBarItem, 'stopped', 'white');
                break;
            default:
                break;
        }
    } catch (e) {
        Log.error("Error handling state change: " + e);
    }
}

function handleInvalidSettings(data) {
    Log.log("Invalid Settings detected", LogLevel.Default);
    statusBarItem.color = 'red';
    statusBarItem.text = "Invalid Settings";

    let userSettingsButton: vscode.MessageItem = { title: "Open User Settings" };
    let workspaceSettingsButton: vscode.MessageItem = { title: "Open Workspace Settings" };

    vscode.window.showInformationMessage("Viper: Invalid settings: " + data, userSettingsButton, workspaceSettingsButton).then((choice) => {
        if (!choice) {

        } else if (choice.title === workspaceSettingsButton.title) {
            try {
                let rootPath = vscode.workspace.rootPath;
                if (!rootPath) {
                    Log.hint("Only if a folder is opened, the workspace settings can be accessed.")
                    return;
                }
                //workspaceSettings
                let workspaceSettingsPath = path.join(rootPath, '.vscode', 'settings.json');
                Log.log("WorkspaceSettings: " + workspaceSettingsPath, LogLevel.Debug);
                Helper.makeSureFileExists(workspaceSettingsPath);
                Helper.showFile(workspaceSettingsPath, vscode.ViewColumn.Two);
            } catch (e) {
                Log.error("Error accessing workspace settings: " + e)
            }
        } else if (choice.title === userSettingsButton.title) {
            try {
                //user Settings
                let userSettings = state.userSettingsPath();
                Log.log("UserSettings: " + userSettings, LogLevel.Debug);
                Helper.makeSureFileExists(userSettings);
                Helper.showFile(userSettings, vscode.ViewColumn.Two);
            } catch (e) {
                Log.error("Error accessing user settings: " + e)
            }
        }
    });
}

function registerHandlers() {

    state.client.onNotification(Commands.StateChange, (params: StateChangeParams) => handleStateChange(params));
    state.client.onNotification(Commands.InvalidSettings, (data) => handleInvalidSettings(data));
    state.client.onNotification(Commands.Hint, (data: string) => {
        Log.hint(data);
    });
    state.client.onNotification(Commands.Log, (msg: { data: string, logLevel: LogLevel }) => {
        Log.log((Log.logLevel >= LogLevel.Debug ? "S: " : "") + msg.data, msg.logLevel);
    });
    state.client.onNotification(Commands.ToLogFile, (msg: { data: string, logLevel: LogLevel }) => {
        Log.toLogFile((Log.logLevel >= LogLevel.Debug ? "S: " : "") + msg.data, msg.logLevel);
    });
    state.client.onNotification(Commands.Error, (msg: { data: string, logLevel: LogLevel }) => {
        Log.error((Log.logLevel >= LogLevel.Debug ? "S: " : "") + msg.data, msg.logLevel);
    });

    state.client.onNotification(Commands.BackendChange, (newBackend: string) => {
        try {
            updateStatusBarItem(backendStatusBar, newBackend, "white");
            if (ExtensionState.viperFiles) {
                ExtensionState.viperFiles.forEach(file => file.success = Success.None);
            }
        } catch (e) {
            Log.error("Error handling backend change: " + e);
        }
    });
    state.client.onNotification(Commands.FileOpened, (uri: string) => {
        try {
            let uriObject: vscode.Uri = vscode.Uri.parse(uri);
            Log.log("File openend: " + path.basename(uriObject.path), LogLevel.Info);
            if (!ExtensionState.viperFiles.has(uri)) {
                ExtensionState.viperFiles.set(uri, new ViperFileState(uriObject));
            } else {
                let fileState = ExtensionState.viperFiles.get(uri);
                fileState.open = true;
                fileState.verifying = false;
            }
            workList.push({ type: TaskType.Verify, uri: uriObject, manuallyTriggered: false });
        } catch (e) {
            Log.error("Error handling file opened notification: " + e);
        }
    });
    state.client.onNotification(Commands.FileClosed, (uri: string) => {
        try {
            let uriObject: vscode.Uri = vscode.Uri.parse(uri);
            Log.log("File closed: " + path.basename(uriObject.path), LogLevel.Info);
            let fileState = ExtensionState.viperFiles.get(uri);
            fileState.open = false;
            fileState.verified = false;
            if (lastActiveTextEditor.toString() == uriObject.toString()) {
                lastActiveTextEditor = null;
            }
            fileState.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
        } catch (e) {
            Log.error("Error handling file closed notification: " + e);
        }
    });
    state.client.onRequest(Commands.UriToPath, (uri: string) => {
        let uriObject: vscode.Uri = vscode.Uri.parse(uri);
        let platformIndependentPath = uriObject.fsPath;
        return platformIndependentPath;
    });
    state.client.onRequest(Commands.PathToUri, (path: string) => {
        let uriObject: Uri = Uri.file(path);
        let platformIndependentUri = uriObject.toString();
        return platformIndependentUri;
    });
    state.context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((params) => {
        try {
            workList.push({ type: TaskType.Save, uri: params.uri });
        } catch (e) {
            Log.error("Error handling saved document: " + e);
        }
    }));
    state.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        try {
            Log.updateSettings();
        } catch (e) {
            Log.error("Error handling configuration change: " + e);
        }
    }));

    state.client.onNotification(Commands.BackendReady, (params: BackendReadyParams) => {
        handleBackendReadyNotification(params);
    });

    //Heap visualization
    state.client.onNotification(Commands.StepsAsDecorationOptions, params => {
        try {
            let castParams = <StepsAsDecorationOptionsResult>params;
            if (!castParams) {
                Log.error("Invalid Params for StepsAdDecorationOptions");
            }
            let visualizer = ExtensionState.viperFiles.get(castParams.uri).stateVisualizer;
            visualizer.storeNewStates(castParams);
        } catch (e) {
            Log.error("Error handling steps as decoration options notification: " + e);
        }
    });
    state.client.onRequest(Commands.HeapGraph, (heapGraph: HeapGraph) => {
        try {
            if (Helper.getConfiguration("advancedFeatures") === true) {
                let visualizer = ExtensionState.viperFiles.get(heapGraph.fileUri).stateVisualizer;
                if (heapGraph.state != visualizer.previousState) {
                    visualizer.createAndShowHeap(heapGraph, visualizer.nextHeapIndex);
                    visualizer.nextHeapIndex = 1 - visualizer.nextHeapIndex;
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
            let fileState = ExtensionState.viperFiles.get(uri);
            if (fileState) {
                fileState.stateVisualizer.showStateSelection(start);
            }
        } catch (e) {
            Log.error("Error handling text editor selection change: " + e);
        }
    });
    state.client.onRequest(Commands.StateSelected, change => {
        try {
            let castChange = <{ uri: string, line: number, character: number }>change;
            if (!castChange) {
                Log.error("error casting stateSelected Request data");
            }
            let visualizer = ExtensionState.viperFiles.get(castChange.uri).stateVisualizer;
            visualizer.showStateSelection({ line: castChange.line, character: castChange.character });
        } catch (e) {
            Log.error("Error handling state selected request: " + e);
        }
    });

    state.client.onNotification(Commands.VerificationNotStarted, uri => {
        try {
            Log.log("Verification not started for " + path.basename(<string>uri), LogLevel.Debug);
            //reset the verifying flag if it is not beeing verified
            let fileState = ExtensionState.viperFiles.get(<string>uri).verifying = false;
        } catch (e) {
            Log.error("Error handling verification not started request: " + e);
        }
    });

    state.client.onNotification(Commands.StopDebugging, () => {
        try {
            Log.log("Stop Debugging", LogLevel.Info);
            let visualizer = ExtensionState.viperFiles.get(lastActiveTextEditor.toString()).stateVisualizer;
            hideStates(() => { }, visualizer);
        } catch (e) {
            Log.error("Error handling stop debugging request: " + e);
        }
    })

    //Command Handlers
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.verify', () => {
        workList.push({ type: TaskType.Verify, uri: vscode.window.activeTextEditor.document.uri, manuallyTriggered: true });
    }));

    state.context.subscriptions.push(vscode.commands.registerCommand('extension.selectBackend', () => {
        try {
            if (!state.client) {
                Log.hint("Extension not ready yet.");
            } else {
                state.client.sendRequest(Commands.RequestBackendNames, null).then((backendNames: string[]) => {
                    if (backendNames.length > 1) {
                        vscode.window.showQuickPick(backendNames).then(selectedBackend => {
                            if (selectedBackend && selectedBackend.length > 0) {
                                startBackend(selectedBackend);
                            } else {
                                Log.log("No backend was selected, don't change the backend");

                            }
                        });
                    } else {
                        Log.log("No need to ask user, since there is only one backend.", LogLevel.Debug);
                        startBackend(backendNames[0]);
                    }
                }, (reason) => {
                    Log.error("Backend change request was rejected: reason: " + reason.toString());
                });
            }
        } catch (e) {
            Log.error("Error selecting backend: " + e);
        }
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.startDebugging', () => {
        try {
            if (Helper.getConfiguration("advancedFeatures") === true) {
                if (!lastActiveTextEditor) {
                    Log.log("Don't debug, no viper file open.", LogLevel.Debug);
                    return;
                }
                let uri = lastActiveTextEditor;
                let filename = path.basename(uri.toString());
                if (!isBackendReady("Don't debug " + filename + ", ")) return;

                let fileState = ExtensionState.viperFiles.get(uri.toString());
                if (!fileState || !fileState.verified) {
                    Log.log("Don't debug " + filename + ", file is not verified", LogLevel.Debug);
                    workList.push({ type: TaskType.Verify, uri: uri, manuallyTriggered: false });
                    return;
                }
                if (!fileState.stateVisualizer.readyToDebug) {
                    Log.hint("Don't debug " + filename + ", the verification provided no states");
                    return;
                }

                let openDoc = uri.path;
                if (state.isWin) {
                    openDoc = openDoc.substring(1, openDoc.length);
                }
                let launchConfig = {
                    name: "Viper Debug",
                    type: "viper",
                    request: "launch",
                    program: openDoc,
                    startInState: 0
                }
                if (ExtensionState.isDebugging) {
                    Log.hint("Don't debug " + filename + ", the file is already being debugged");
                    return;
                }
                showStates(() => {
                    vscode.commands.executeCommand('vscode.startDebug', launchConfig).then(() => {
                        Log.log('Debug session started successfully', LogLevel.Info);
                        ExtensionState.isDebugging = true;
                    }, err => {
                        Log.error("Error starting debugger: " + err.message);
                    });
                });
            } else {
                Log.hint("Enable the advanced features in the settings to use debugging.")
            }
        } catch (e) {
            Log.error("Error starting debug session: " + e);
        }
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.stopVerification', () => {
        if (state.client) {
            Log.log("Verification stop request", LogLevel.Debug);
            abortButton.hide();
            statusBarItem.color = 'orange';
            statusBarItem.text = "aborting";
            statusBarProgress.hide();
            state.client.sendNotification(Commands.StopVerification, lastActiveTextEditor.toString());
        } else {
            Log.hint("Extension not ready yet.");
        }
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.format', () => {
        try {
            formatter.formatOpenDoc();
        } catch (e) {
            Log.error("Error handling formating request: " + e);
        }
    }));
}

function startBackend(backendName: string) {
    try {
        _backendReady = false;
        state.client.sendNotification(Commands.StartBackend, backendName);
    } catch (e) {
        Log.error("Error starting backend: " + e);
    }
}

function handleBackendReadyNotification(params: BackendReadyParams) {
    try {
        _backendReady = true;
        Log.log("Backend ready: " + params.name, LogLevel.Info);
        updateStatusBarItem(statusBarItem, "ready", 'white');
        //automatically trigger the first verification
        if (params.restarted) {
            //no file is verifying
            resetViperFiles()
            if (lastActiveTextEditor && Helper.getConfiguration('autoVerifyAfterBackendChange') === true) {
                Log.log("autoVerify after backend change", LogLevel.Info);
                workList.push({ type: TaskType.Verify, uri: lastActiveTextEditor, manuallyTriggered: false });
            }
        }
    } catch (e) {
        Log.error("Error handling backend started notification: " + e);
    }
}

function stopDebugging() {
    Log.log("Tell language server to stop debugging", LogLevel.Debug);
    state.client.sendNotification(Commands.StopDebugging);
}

function showStates(callback) {
    try {
        if (!StateVisualizer.showStates) {
            StateVisualizer.showStates = true;
            let visualizer = ExtensionState.viperFiles.get(lastActiveTextEditor.toString()).stateVisualizer;
            visualizer.removeSpecialCharacters(() => {
                visualizer.addCharacterToDecorationOptionLocations(() => {
                    visualizer.showDecorations();
                    callback();
                });
            });
        } else {
            Log.log("don't show states, they are already shown", LogLevel.Debug);
        }
    } catch (e) {
        Log.error("Error showing States: " + e);
    }
}

function hideStates(callback, visualizer: StateVisualizer) {
    try {
        vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup').then(success => { }, error => {
            Log.error("Error changing the focus to the first editorGroup");
        });
        ExtensionState.isDebugging = false;
        Log.log("Hide states for " + visualizer.viperFile.name(), LogLevel.Info);
        StateVisualizer.showStates = false;
        visualizer.removeSpecialCharacters(() => {
            visualizer.hideDecorations();
            visualizer.reset();
            callback();
        });
    } catch (e) {
        Log.error("Error hiding States: " + e);
    }
}

function verify(fileState: ViperFileState, manuallyTriggered: boolean) {
    let uri = fileState.uri.toString();
    if (Helper.isViperSourceFile(uri)) {
        if (!state.client) {
            Log.hint("Extension not ready yet.");
        } else {
            let visualizer = ExtensionState.viperFiles.get(uri).stateVisualizer;
            visualizer.completeReset();
            hideStates(() => {
                //delete old SymbExLog:
                Log.deleteFile(Log.symbExLogFilePath);

                //change fileState
                fileState.changed = false;
                fileState.verified = false;
                fileState.verifying = true;

                let workspace = vscode.workspace.rootPath ? vscode.workspace.rootPath : path.dirname(fileState.uri.fsPath);
                state.client.sendNotification(Commands.Verify, { uri: uri, manuallyTriggered: manuallyTriggered, workspace: workspace });
            }, visualizer);
        }
    }
}

function progressBarText(progress: number): string {
    let bar = "";
    for (var i = 0; i < progress / 10; i++) {
        bar = bar + "⚫";
    }
    for (var i = 10; i > progress / 10; i--) {
        bar = bar + "⚪";
    }
    return bar;
}
