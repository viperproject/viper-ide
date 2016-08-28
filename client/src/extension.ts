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
import {StepsAsDecorationOptionsResult, HeapGraph, Backend, ViperSettings, VerificationState, Commands, UpdateStatusBarParams, LogLevel, Success} from './ViperProtocol';
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
let backendReady: boolean = false;

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
    lastActiveTextEditor = Helper.isViperSourceFile(vscode.window.activeTextEditor.document.uri.toString()) ? vscode.window.activeTextEditor.document.uri : null;
    startVerificationController();
}

function resetViperFiles() {
    ExtensionState.viperFiles.forEach(element => {
        element.changed = true;
        element.verified = false;
        element.verifying = false;
        element.decorationsShown = false;
        element.stateVisualizer.completeReset();
    });
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
                    Log.log("Warning: Only handle viper files, not file: " + task.uri.toString());
                    continue;
                }
                let fileState = ExtensionState.viperFiles.get(task.uri.toString());
                if (!fileState) {
                    Log.error("The file is unknown to the verification controller: " + path.basename(task.uri.toString()));
                    continue;
                }
                switch (task.type) {
                    case TaskType.Verify:
                        if (backendReady) {
                            //Log.log("Verify " + path.basename(task.uri.toString()) + " is handled", LogLevel.Info);

                            let activeFile;
                            if (vscode.window.activeTextEditor) {
                                activeFile = vscode.window.activeTextEditor.document.uri.toString();
                            }

                            if (!fileState.open) {
                                Log.log(`Don't verify ${path.basename(task.uri.toString())}: file is closed`, LogLevel.Debug);
                            } else if (fileState.verifying) {
                                Log.log(`Don't verify ${path.basename(task.uri.toString())}: file is verifying`, LogLevel.Debug);
                                //} else if (!task.manuallyTriggered && !fileState.changed) {
                                //    Log.log(`Don't verify ${path.basename(task.uri.toString())}: !manuallyTriggered and file is not changed`, LogLevel.Debug);
                            } else if (!task.manuallyTriggered && fileState.verified) {
                                Log.log(`Don't verify ${path.basename(task.uri.toString())}: !manuallyTriggered and file is verified`, LogLevel.Debug);
                            } else if (!task.manuallyTriggered && fileState.success === Success.Aborted) {
                                Log.log(`Don't verify ${path.basename(task.uri.toString())}: !manuallyTriggered and file was aborted when last verified`, LogLevel.Debug);
                            } else if (!task.manuallyTriggered && fileState.success === Success.Error) {
                                Log.log(`Don't verify ${path.basename(task.uri.toString())}: !manuallyTriggered and file caused error when last verified`, LogLevel.Debug);
                            }
                            else if (!activeFile) {
                                fileState.needsVerification = true;
                                Log.log(`Verify ${path.basename(task.uri.toString())} later: no file is active`, LogLevel.Debug);
                            } else if (activeFile !== task.uri.toString()) {
                                fileState.needsVerification = true;
                                Log.log(`Verify ${path.basename(task.uri.toString())} later: !another file is active`, LogLevel.Debug);
                            } else if (fileState.decorationsShown && !task.manuallyTriggered) {
                                fileState.needsVerification = true;
                                Log.log(`Verify ${path.basename(task.uri.toString())} later: !manuallyTriggered and the decorations are shown`, LogLevel.Debug);
                            } else {
                                verify(fileState, task.manuallyTriggered);
                            }
                        } else {
                            fileState.needsVerification = true;
                            Log.log(`Verify ${path.basename(task.uri.toString())} later: !backend is not ready`, LogLevel.Debug);
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
                            Log.log("No change in active viper file");
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
                    fileState.setEditor(editor);

                    if (fileState.verified) {
                        //showStates(()=>{});
                    } else {
                        Log.log("reverify because the active text editor changed");
                        workList.push({ type: TaskType.Verify, uri: uri, manuallyTriggered: false })
                    }
                    Log.log("Active viper file changed to " + path.basename(uri.toString()), LogLevel.Info);
                    lastActiveTextEditor = uri;
                }
            }
        } catch (e) {
            Log.log("Error handling active text editor change: " + e);
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

function handleStateChange(params: UpdateStatusBarParams) {
    try {
        Log.log("The new state is: " + VerificationState[params.newState], LogLevel.Debug);
        let window = vscode.window;
        switch (params.newState) {
            case VerificationState.Starting:
                backendReady = false;
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
                updateStatusBarItem(statusBarItem, `File ${params.filename}: Stage ${params.stage}`, 'white');
            case VerificationState.Ready:
                ExtensionState.viperFiles.forEach(file => {
                    file.verifying = false;
                });

                if (!params.verificationCompleted) {
                    updateStatusBarItem(statusBarItem, "ready", 'white');
                }
                else {
                    let uri = vscode.Uri.parse(params.uri);

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
                            if (fs.existsSync(symbexDotFile)) {
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
                            let msg2 = " - see View->Output->Viper for more info"
                            updateStatusBarItem(statusBarItem, `$(x) Internal error` + msg2, 'red');
                            msg = `Verifying ${params.filename} failed due to an internal error`;
                            Log.log(msg);
                            Log.hint(msg + msg2);
                            break;
                    }
                }
                statusBarProgress.hide();
                abortButton.hide();
                break;
            case VerificationState.Stopping:
                updateStatusBarItem(statusBarItem, 'preparing', 'orange');
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

    state.client.onNotification(Commands.StateChange, (params: UpdateStatusBarParams) => handleStateChange(params));
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
        updateStatusBarItem(backendStatusBar, newBackend, "white");
    });
    state.client.onNotification(Commands.FileOpened, (uri: string) => {
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
    });
    state.client.onNotification(Commands.FileClosed, (uri: string) => {
        let uriObject: vscode.Uri = vscode.Uri.parse(uri);
        Log.log("File closed: " + uriObject.path, LogLevel.Info);
        let fileState = ExtensionState.viperFiles.get(uri);
        fileState.open = false;
        fileState.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
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
    state.client.onRequest(Commands.AskUserToSelectBackend, (backendNames: string[]) => {
        //only ask the user if there is a choice
        if (backendNames.length > 1) {
            vscode.window.showQuickPick(backendNames).then(selectedBackend => {
                state.client.sendRequest(Commands.SelectBackend, selectedBackend);
            });
        } else {
            state.client.sendRequest(Commands.SelectBackend, backendNames[0]);
        }
    });
    state.context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((params) => {
        workList.push({ type: TaskType.Save, uri: params.uri });
    }));
    state.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        Log.updateSettings();
    }));

    state.client.onNotification(Commands.BackendStarted, name => {
        Log.log("Backend started: " + name, LogLevel.Info);
        backendReady = true;
        //no file is verifying
        resetViperFiles()
        updateStatusBarItem(statusBarItem, "ready", 'white');
        //automatically trigger the first verification
        if (Helper.getConfiguration('autoVerifyAfterBackendChange') === true) {
            if (vscode.window.activeTextEditor.document.languageId === 'viper') {
                Log.log("autoVerify after backend change");
                workList.push({ type: TaskType.Verify, uri: vscode.window.activeTextEditor.document.uri, manuallyTriggered: false });
            }
        }
    });

    //Heap visualization
    state.client.onNotification(Commands.StepsAsDecorationOptions, params => {
        let castParams = <StepsAsDecorationOptionsResult>params;
        if (!castParams) {
            Log.error("Invalid Params for StepsAdDecorationOptions");
        }
        let visualizer = ExtensionState.viperFiles.get(castParams.uri).stateVisualizer;
        visualizer.storeNewStates(castParams);
    });
    state.client.onRequest(Commands.HeapGraph, (heapGraph: HeapGraph) => {
        try {
            //Log.log("HeapGraph",LogLevel.Debug);
            let visualizer = ExtensionState.viperFiles.get(heapGraph.fileUri).stateVisualizer;
            visualizer.createAndShowHeap(heapGraph, visualizer.nextHeapIndex);
            visualizer.nextHeapIndex = 1 - visualizer.nextHeapIndex;
        } catch (e) {
            Log.error("Error displaying HeapGraph: " + e);
        }
    });
    vscode.window.onDidChangeTextEditorSelection((change) => {
        //Log.log("OnDidChangeTextEditorSelection",LogLevel.Debug);
        if (!change.textEditor.document) {
            Log.error("document is undefined in onDidChangeTextEditorSelection");
            return;
        }
        let uri = change.textEditor.document.uri.toString();
        let start = change.textEditor.selection.start;
        let fileState = ExtensionState.viperFiles.get(uri);
        fileState.stateVisualizer.showStateSelection(start);
    });
    state.client.onRequest(Commands.StateSelected, change => {
        //Log.log("stateSelected",LogLevel.Debug);
        let castChange = <{ uri: string, line: number, character: number }>change;
        if (!castChange) {
            Log.error("error casting stateSelected Request data");
        }
        let visualizer = ExtensionState.viperFiles.get(castChange.uri).stateVisualizer;
        visualizer.showStateSelection({ line: castChange.line, character: castChange.character });
    });

    state.client.onNotification(Commands.VerificationNotStarted, uri => {
        try {
            Log.log("Verification not started for " + path.basename(<string>uri));
            //reset the verifying flag if it is not beeing verified
            let fileState = ExtensionState.viperFiles.get(<string>uri).verifying = false;
        } catch (e) {
            Log.error("Error handling verification not started request: " + e);
        }
    });

    state.client.onNotification(Commands.StopDebugging, () => {
        Log.log("Stop Debugging", LogLevel.Info);
        let visualizer = ExtensionState.viperFiles.get(lastActiveTextEditor.toString()).stateVisualizer;
        hideStates(() => { }, visualizer);
    })

    //Command Handlers
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.verify', () => {
        workList.push({ type: TaskType.Verify, uri: vscode.window.activeTextEditor.document.uri, manuallyTriggered: true });
    }));

    state.context.subscriptions.push(vscode.commands.registerCommand('extension.selectBackend', () => {
        if (!state.client) {
            Log.hint("Extension not ready yet.");
        } else {
            backendReady = false;
            state.client.sendRequest(Commands.RequestBackendNames, null);
        }
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.startDebugging', () => {
        if (!vscode.window.activeTextEditor) {
            Log.log("Don't debug, active file is not editable.", LogLevel.Debug);
            return;
        }
        let uri = vscode.window.activeTextEditor.document.uri;
        if (!Helper.isViperSourceFile(uri.toString())) {
            Log.log("Don't debug, active file is no viper file.", LogLevel.Debug);
            return;
        }
        if (!backendReady) {
            Log.log("Don't debug, backend is not ready.", LogLevel.Debug);
            return;
        }
        let fileState = ExtensionState.viperFiles.get(uri.toString());
        if (!fileState || !fileState.verified) {
            Log.log("Don't debug, file is not verified", LogLevel.Debug);
            return;
        }

        try {
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
            showStates(() => {
                vscode.commands.executeCommand('vscode.startDebug', launchConfig).then(() => {
                    Log.log('Debug session started successfully', LogLevel.Info);
                    ExtensionState.isDebugging = true;
                }, err => {
                    Log.error("Error starting debugger: " + err.message);
                });
            });
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
            state.client.sendRequest(Commands.StopVerification, vscode.window.activeTextEditor.document.uri.toString());
        } else {
            Log.hint("Extension not ready yet.");
        }
    }));

    state.context.subscriptions.push(vscode.commands.registerCommand('extension.showStates', () => {
        showStates(() => { });
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.hideStates', () => {
        let visualizer = ExtensionState.viperFiles.get(lastActiveTextEditor.toString()).stateVisualizer;
        hideStates(() => { }, visualizer);
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.format', () => {
        formatter.formatOpenDoc();
    }));
}

function stopDebugging() {
    Log.log("Tell language server to stop debugging");
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
            Log.log("don't show states, they are already shown");
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

                Log.log("verify " + path.basename(uri));
                //change fileState
                fileState.changed = false;
                fileState.verified = false;
                fileState.verifying = true;

                let workspace = vscode.workspace.rootPath ? vscode.workspace.rootPath : path.dirname(fileState.uri.fsPath);
                state.client.sendRequest(Commands.Verify, { uri: uri, manuallyTriggered: manuallyTriggered, workspace: workspace });
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
