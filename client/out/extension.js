'use strict';
var ps = require('ps-node');
const path = require('path');
const Timer_1 = require('./Timer');
const vscode = require('vscode');
const ExtensionState_1 = require('./ExtensionState');
const ViperProtocol_1 = require('./ViperProtocol');
const index_1 = require('../node_modules/vscode-uri/lib/index');
const Log_1 = require('./Log');
const StateVisualizer_1 = require('./StateVisualizer');
const Helper_1 = require('./Helper');
const ViperFormatter_1 = require('./ViperFormatter');
const ViperFileState_1 = require('./ViperFileState');
let statusBarItem;
let statusBarProgress;
let backendStatusBar;
let abortButton;
let autoSaver;
let state;
let verificationController;
let fileSystemWatcher;
//let manuallyTriggered: boolean;
let formatter;
let workList;
let verifiedFile;
let backendReady = false;
let lastActiveTextEditor;
var TaskType;
(function (TaskType) {
    TaskType[TaskType["Save"] = 0] = "Save";
    TaskType[TaskType["Verify"] = 1] = "Verify";
    TaskType[TaskType["NoOp"] = 2] = "NoOp"; //Open,Close, VerificationCompleted
})(TaskType || (TaskType = {}));
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    workList = [];
    ExtensionState_1.ExtensionState.viperFiles = new Map();
    Log_1.Log.initialize(context);
    Log_1.Log.log('Viper-Client is now active!', ViperProtocol_1.LogLevel.Info);
    state = ExtensionState_1.ExtensionState.createExtensionState();
    state.checkOperatingSystem();
    context.subscriptions.push(state);
    fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/*.sil, **/*.vpr');
    state.startLanguageServer(context, fileSystemWatcher, false); //break?
    registerHandlers();
    startAutoSaver();
    initializeStatusBar();
    Log_1.Log.deleteDotFiles();
    registerFormatter();
    lastActiveTextEditor = vscode.window.activeTextEditor.document.uri;
    startVerificationController();
}
exports.activate = activate;
function resetViperFiles() {
    ExtensionState_1.ExtensionState.viperFiles.forEach(element => {
        element.changed = true;
        element.verified = false;
        element.verifying = false;
        element.decorationsShown = false;
    });
}
function startVerificationController() {
    let verificationTimeout = 100; //ms
    verificationController = new Timer_1.Timer(() => {
        try {
            let done = false;
            let i = 0;
            //remove leading NoOps
            while (workList.length > 0 && workList[0].type == TaskType.NoOp) {
                workList.shift();
            }
            while (!done && workList.length > i) {
                let task = workList[i++];
                if (!Helper_1.Helper.isViperSourceFile(task.uri.toString())) {
                    task.type = TaskType.NoOp;
                    Log_1.Log.log("Warning: only handle viper files, not file: " + task.uri.toString());
                }
                let fileState = ExtensionState_1.ExtensionState.viperFiles.get(task.uri.toString());
                if (!fileState) {
                    Log_1.Log.error("The file is unknown to the verification controller: " + path.basename(task.uri.toString()));
                    return;
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
                                Log_1.Log.log(`Don't verify ${path.basename(task.uri.toString())}: file is closed`, ViperProtocol_1.LogLevel.Debug);
                            }
                            else if (fileState.verifying) {
                                Log_1.Log.log(`Don't verify ${path.basename(task.uri.toString())}: file is verifying`, ViperProtocol_1.LogLevel.Debug);
                            }
                            else if (!task.manuallyTriggered && fileState.verified) {
                                Log_1.Log.log(`Don't verify ${path.basename(task.uri.toString())}: !manuallyTriggered and file is verified`, ViperProtocol_1.LogLevel.Debug);
                            }
                            else if (!task.manuallyTriggered && fileState.success === ViperProtocol_1.Success.Aborted) {
                                Log_1.Log.log(`Don't verify ${path.basename(task.uri.toString())}: !manuallyTriggered and file was aborted when last verified`, ViperProtocol_1.LogLevel.Debug);
                            }
                            else if (!task.manuallyTriggered && fileState.success === ViperProtocol_1.Success.Error) {
                                Log_1.Log.log(`Don't verify ${path.basename(task.uri.toString())}: !manuallyTriggered and file caused error when last verified`, ViperProtocol_1.LogLevel.Debug);
                            }
                            else if (!activeFile) {
                                fileState.needsVerification = true;
                                Log_1.Log.log(`Verify ${path.basename(task.uri.toString())} later: no file is active`, ViperProtocol_1.LogLevel.Debug);
                            }
                            else if (activeFile !== task.uri.toString()) {
                                fileState.needsVerification = true;
                                Log_1.Log.log(`Verify ${path.basename(task.uri.toString())} later: !another file is active`, ViperProtocol_1.LogLevel.Debug);
                            }
                            else if (fileState.decorationsShown && !task.manuallyTriggered) {
                                fileState.needsVerification = true;
                                Log_1.Log.log(`Verify ${path.basename(task.uri.toString())} later: !manuallyTriggered and the decorations are shown`, ViperProtocol_1.LogLevel.Debug);
                            }
                            else {
                                verify(fileState, task.manuallyTriggered);
                            }
                        }
                        else {
                            fileState.needsVerification = true;
                            Log_1.Log.log(`Verify ${path.basename(task.uri.toString())} later: !backend is not ready`, ViperProtocol_1.LogLevel.Debug);
                        }
                        task.type = TaskType.NoOp;
                        break;
                    case TaskType.Save:
                        //Log.log("Save " + path.basename(task.uri.toString()) + " is handled", LogLevel.Info);
                        fileState.changed = true;
                        //TODO: ignore saves due to special characters
                        fileState.verified = false;
                        workList.push({ type: TaskType.Verify, uri: task.uri, manuallyTriggered: false });
                        task.type = TaskType.NoOp;
                        break;
                }
            }
        }
        catch (e) {
            Log_1.Log.error("Error in verification controller: " + e);
            workList.shift();
        }
    }, verificationTimeout);
    state.context.subscriptions.push(verificationController);
    //trigger verification texteditorChange
    state.context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        try {
            let editor = vscode.window.activeTextEditor;
            if (editor) {
                if (Helper_1.Helper.isViperSourceFile(editor.document.uri.toString())) {
                    if (lastActiveTextEditor) {
                        if (lastActiveTextEditor.toString() === editor.document.uri.toString()) {
                            return;
                        }
                        let oldFileState = ExtensionState_1.ExtensionState.viperFiles.get(lastActiveTextEditor.toString());
                        oldFileState.decorationsShown = false;
                        oldFileState.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
                    }
                    let uri = vscode.window.activeTextEditor.document.uri;
                    let fileState = ExtensionState_1.ExtensionState.viperFiles.get(uri.toString());
                    fileState.setEditor(editor);
                    if (fileState.verified) {
                        fileState.stateVisualizer.addCharacterToDecorationOptionLocations();
                        fileState.stateVisualizer.showDecorations();
                    }
                    else {
                        Log_1.Log.log("reverify because the active text editor changed");
                        workList.push({ type: TaskType.Verify, uri: uri, manuallyTriggered: false });
                    }
                    lastActiveTextEditor = uri;
                }
            }
        }
        catch (e) {
            Log_1.Log.log("Error handling active text editor change: " + e);
        }
    }));
}
function deactivate() {
    //return new Promise((resolve, reject) => {
    Log_1.Log.log("deactivate", ViperProtocol_1.LogLevel.Info);
    state.dispose();
    //TODO: make sure no doc contains special chars any more
    let oldFileState = ExtensionState_1.ExtensionState.viperFiles.get(lastActiveTextEditor.toString());
    oldFileState.stateVisualizer.removeSpecialCharacters(() => {
        Log_1.Log.log("deactivated", ViperProtocol_1.LogLevel.Info);
        //resolve(true);
    });
    //});
}
exports.deactivate = deactivate;
function registerFormatter() {
    formatter = new ViperFormatter_1.ViperFormatter();
}
function initializeStatusBar() {
    state.state = ViperProtocol_1.VerificationState.Stopped;
    statusBarProgress = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 11);
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    updateStatusBarItem(statusBarItem, "Hello from Viper", "white");
    abortButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9);
    abortButton.command = "extension.stopVerification";
    updateStatusBarItem(abortButton, "$(x) Stop", "orange", null, false);
    state.context.subscriptions.push(statusBarProgress);
    state.context.subscriptions.push(statusBarItem);
    state.context.subscriptions.push(abortButton);
    backendStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 12);
}
function updateStatusBarItem(item, text, color, tooltip = null, show = true) {
    item.text = text;
    item.color = color;
    item.tooltip = tooltip;
    if (show) {
        item.show();
    }
    else {
        item.hide();
    }
}
function startAutoSaver() {
    let autoSaveTimeout = 1000; //ms
    autoSaver = new Timer_1.Timer(() => {
        //only save viper files
        if (vscode.window.activeTextEditor != null && vscode.window.activeTextEditor.document.languageId == 'viper') {
            if (Helper_1.Helper.getConfiguration('autoSave') === true) {
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
function handleStateChange(params) {
    try {
        Log_1.Log.log("The new state is: " + ViperProtocol_1.VerificationState[params.newState], ViperProtocol_1.LogLevel.Debug);
        let window = vscode.window;
        switch (params.newState) {
            case ViperProtocol_1.VerificationState.Starting:
                backendReady = false;
                updateStatusBarItem(statusBarItem, 'starting', 'orange' /*,"Starting " + params.backendName*/);
                break;
            case ViperProtocol_1.VerificationState.VerificationRunning:
                let showProgressBar = Helper_1.Helper.getConfiguration('showProgress') === true;
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
            case ViperProtocol_1.VerificationState.Ready:
                backendReady = true;
                //no file is verifying
                ExtensionState_1.ExtensionState.viperFiles.forEach(file => {
                    file.verifying = false;
                });
                if (!params.verificationCompleted) {
                    updateStatusBarItem(statusBarItem, "ready", 'white');
                    //automatically trigger the first verification
                    if (params.verificationNeeded && Helper_1.Helper.getConfiguration('autoVerifyAfterBackendChange') === true) {
                        if (vscode.window.activeTextEditor.document.languageId === 'viper') {
                            Log_1.Log.log("autoVerify after backend change");
                            resetViperFiles();
                            workList.push({ type: TaskType.Verify, uri: vscode.window.activeTextEditor.document.uri, manuallyTriggered: false });
                        }
                    }
                }
                else {
                    let uri = vscode.Uri.parse(params.uri);
                    ExtensionState_1.ExtensionState.viperFiles.get(params.uri).success = params.success;
                    if (params.success != ViperProtocol_1.Success.Aborted && params.success != ViperProtocol_1.Success.Error) {
                        ExtensionState_1.ExtensionState.viperFiles.get(params.uri).verified = true;
                    }
                    //workList.push({ type: TaskType.VerificationCompleted, uri: uri, success: params.success });
                    let msg = "";
                    switch (params.success) {
                        case ViperProtocol_1.Success.Success:
                            msg = `Successfully verified ${params.filename} in ${params.time.toFixed(1)} seconds`;
                            Log_1.Log.log(msg, ViperProtocol_1.LogLevel.Default);
                            updateStatusBarItem(statusBarItem, "$(check) " + msg, 'lightgreen');
                            if (params.manuallyTriggered)
                                Log_1.Log.hint(msg);
                            break;
                        case ViperProtocol_1.Success.ParsingFailed:
                            msg = `Parsing ${params.filename} failed after ${params.time.toFixed(1)} seconds`;
                            Log_1.Log.log(msg, ViperProtocol_1.LogLevel.Default);
                            updateStatusBarItem(statusBarItem, "$(x) " + msg, 'red');
                            break;
                        case ViperProtocol_1.Success.TypecheckingFailed:
                            msg = `Type checking ${params.filename} failed after ${params.time.toFixed(1)} seconds with ${params.nofErrors} error${params.nofErrors == 1 ? "s" : ""}`;
                            Log_1.Log.log(msg, ViperProtocol_1.LogLevel.Default);
                            updateStatusBarItem(statusBarItem, "$(x) " + msg, 'red');
                            break;
                        case ViperProtocol_1.Success.VerificationFailed:
                            msg = `Verifying ${params.filename} failed after ${params.time.toFixed(1)} seconds with ${params.nofErrors} error${params.nofErrors == 1 ? "s" : ""}`;
                            Log_1.Log.log(msg, ViperProtocol_1.LogLevel.Default);
                            updateStatusBarItem(statusBarItem, "$(x) " + msg, 'red');
                            break;
                        case ViperProtocol_1.Success.Aborted:
                            updateStatusBarItem(statusBarItem, "Verification aborted", 'orange');
                            Log_1.Log.log(`Verifying ${params.filename} was aborted`, ViperProtocol_1.LogLevel.Info);
                            break;
                        case ViperProtocol_1.Success.Error:
                            let msg2 = " - see View->Output->Viper for more info";
                            updateStatusBarItem(statusBarItem, `$(x) Internal error` + msg2, 'red');
                            msg = `Verifying ${params.filename} failed due to an internal error`;
                            Log_1.Log.log(msg);
                            Log_1.Log.hint(msg + msg2);
                            break;
                    }
                }
                statusBarProgress.hide();
                abortButton.hide();
                break;
            case ViperProtocol_1.VerificationState.Stopping:
                updateStatusBarItem(statusBarItem, 'preparing', 'orange');
                break;
            default:
                break;
        }
    }
    catch (e) {
        Log_1.Log.error("Error handling state change: " + e);
    }
}
function handleInvalidSettings(data) {
    Log_1.Log.log("Invalid Settings detected", ViperProtocol_1.LogLevel.Default);
    statusBarItem.color = 'red';
    statusBarItem.text = "Invalid Settings";
    let userSettingsButton = { title: "Open User Settings" };
    let workspaceSettingsButton = { title: "Open Workspace Settings" };
    vscode.window.showInformationMessage("Viper: Invalid settings: " + data, userSettingsButton, workspaceSettingsButton).then((choice) => {
        if (!choice) {
        }
        else if (choice.title === workspaceSettingsButton.title) {
            try {
                let rootPath = vscode.workspace.rootPath;
                if (!rootPath) {
                    Log_1.Log.hint("Only if a folder is opened, the workspace settings can be accessed.");
                    return;
                }
                //workspaceSettings
                let workspaceSettingsPath = path.join(rootPath, '.vscode', 'settings.json');
                Log_1.Log.log("WorkspaceSettings: " + workspaceSettingsPath, ViperProtocol_1.LogLevel.Debug);
                Helper_1.Helper.makeSureFileExists(workspaceSettingsPath);
                Helper_1.Helper.showFile(workspaceSettingsPath, vscode.ViewColumn.Two);
            }
            catch (e) {
                Log_1.Log.error("Error accessing workspace settings: " + e);
            }
        }
        else if (choice.title === userSettingsButton.title) {
            try {
                //user Settings
                let userSettings = state.userSettingsPath();
                Log_1.Log.log("UserSettings: " + userSettings, ViperProtocol_1.LogLevel.Debug);
                Helper_1.Helper.makeSureFileExists(userSettings);
                Helper_1.Helper.showFile(userSettings, vscode.ViewColumn.Two);
            }
            catch (e) {
                Log_1.Log.error("Error accessing user settings: " + e);
            }
        }
    });
}
function registerHandlers() {
    state.client.onNotification(ViperProtocol_1.Commands.StateChange, (params) => handleStateChange(params));
    state.client.onNotification(ViperProtocol_1.Commands.InvalidSettings, (data) => handleInvalidSettings(data));
    state.client.onNotification(ViperProtocol_1.Commands.Hint, (data) => {
        Log_1.Log.hint(data);
    });
    state.client.onNotification(ViperProtocol_1.Commands.Log, (msg) => {
        Log_1.Log.log((Log_1.Log.logLevel >= ViperProtocol_1.LogLevel.Debug ? "S: " : "") + msg.data, msg.logLevel);
    });
    state.client.onNotification(ViperProtocol_1.Commands.ToLogFile, (msg) => {
        Log_1.Log.toLogFile((Log_1.Log.logLevel >= ViperProtocol_1.LogLevel.Debug ? "S: " : "") + msg.data, msg.logLevel);
    });
    state.client.onNotification(ViperProtocol_1.Commands.Error, (msg) => {
        Log_1.Log.error((Log_1.Log.logLevel >= ViperProtocol_1.LogLevel.Debug ? "S: " : "") + msg.data, msg.logLevel);
    });
    state.client.onNotification(ViperProtocol_1.Commands.BackendChange, (newBackend) => {
        updateStatusBarItem(backendStatusBar, newBackend, "white");
    });
    state.client.onNotification(ViperProtocol_1.Commands.FileOpened, (uri) => {
        let uriObject = vscode.Uri.parse(uri);
        Log_1.Log.log("File openend: " + uriObject.path, ViperProtocol_1.LogLevel.Info);
        if (!ExtensionState_1.ExtensionState.viperFiles.has(uri)) {
            ExtensionState_1.ExtensionState.viperFiles.set(uri, new ViperFileState_1.ViperFileState(uriObject));
        }
        else {
            let fileState = ExtensionState_1.ExtensionState.viperFiles.get(uri);
            fileState.open = true;
            fileState.verifying = false;
        }
        workList.push({ type: TaskType.Verify, uri: uriObject, manuallyTriggered: false });
    });
    state.client.onNotification(ViperProtocol_1.Commands.FileClosed, (uri) => {
        let uriObject = vscode.Uri.parse(uri);
        Log_1.Log.log("File closed: " + uriObject.path, ViperProtocol_1.LogLevel.Info);
        let fileState = ExtensionState_1.ExtensionState.viperFiles.get(uri);
        fileState.open = false;
        fileState.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
    });
    state.client.onRequest(ViperProtocol_1.Commands.UriToPath, (uri) => {
        let uriObject = vscode.Uri.parse(uri);
        let platformIndependentPath = uriObject.fsPath;
        return platformIndependentPath;
    });
    state.client.onRequest(ViperProtocol_1.Commands.PathToUri, (path) => {
        let uriObject = index_1.default.file(path);
        let platformIndependentUri = uriObject.toString();
        return platformIndependentUri;
    });
    state.client.onRequest(ViperProtocol_1.Commands.AskUserToSelectBackend, (backendNames) => {
        //only ask the user if there is a choice
        if (backendNames.length > 1) {
            vscode.window.showQuickPick(backendNames).then(selectedBackend => {
                state.client.sendRequest(ViperProtocol_1.Commands.SelectBackend, selectedBackend);
            });
        }
        else {
            state.client.sendRequest(ViperProtocol_1.Commands.SelectBackend, backendNames[0]);
        }
    });
    state.context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((params) => {
        workList.push({ type: TaskType.Save, uri: params.uri });
    }));
    state.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        Log_1.Log.updateSettings();
    }));
    //Heap visualization
    state.client.onNotification(ViperProtocol_1.Commands.StepsAsDecorationOptions, params => {
        let castParams = params;
        if (!castParams) {
            Log_1.Log.error("Invalid Params for StepsAdDecorationOptions");
        }
        let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(castParams.uri).stateVisualizer;
        visualizer.storeNewStates(castParams.decorations);
    });
    state.client.onRequest(ViperProtocol_1.Commands.HeapGraph, (heapGraph) => {
        //Log.log("HeapGraph",LogLevel.Debug);
        let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(heapGraph.fileUri).stateVisualizer;
        visualizer.createAndShowHeap(heapGraph, visualizer.nextHeapIndex);
        visualizer.nextHeapIndex = 1 - visualizer.nextHeapIndex;
    });
    vscode.window.onDidChangeTextEditorSelection((change) => {
        //Log.log("OnDidChangeTextEditorSelection",LogLevel.Debug);
        if (!change.textEditor.document) {
            Log_1.Log.error("document is undefined in onDidChangeTextEditorSelection");
            return;
        }
        let uri = change.textEditor.document.uri.toString();
        let start = change.textEditor.selection.start;
        let fileState = ExtensionState_1.ExtensionState.viperFiles.get(uri);
        fileState.stateVisualizer.showStateSelection(start);
    });
    state.client.onRequest(ViperProtocol_1.Commands.StateSelected, change => {
        //Log.log("stateSelected",LogLevel.Debug);
        let castChange = change;
        if (!castChange) {
            Log_1.Log.error("error casting stateSelected Request data");
        }
        let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(castChange.uri).stateVisualizer;
        visualizer.showStateSelection({ line: castChange.line, character: castChange.character });
    });
    //Command Handlers
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.verify', () => {
        workList.push({ type: TaskType.Verify, uri: vscode.window.activeTextEditor.document.uri, manuallyTriggered: true });
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.selectBackend', () => {
        if (!state.client) {
            Log_1.Log.hint("Extension not ready yet.");
        }
        else {
            backendReady = false;
            state.client.sendRequest(ViperProtocol_1.Commands.RequestBackendNames, null);
        }
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.startDebugging', () => {
        let openDoc = vscode.window.activeTextEditor.document.uri.path;
        if (state.isWin) {
            openDoc = openDoc.substring(1, openDoc.length);
        }
        let launchConfig = {
            name: "Viper Debug",
            type: "viper",
            request: "launch",
            program: openDoc,
            stopOnEntry: true
        };
        vscode.commands.executeCommand('vscode.startDebug', launchConfig).then(() => {
            Log_1.Log.log('Debug session started successfully', ViperProtocol_1.LogLevel.Info);
        }, err => {
            Log_1.Log.error(err.message);
        });
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.stopVerification', () => {
        if (state.client) {
            Log_1.Log.log("Verification stop request", ViperProtocol_1.LogLevel.Debug);
            abortButton.hide();
            statusBarItem.color = 'orange';
            statusBarItem.text = "aborting";
            statusBarProgress.hide();
            state.client.sendRequest(ViperProtocol_1.Commands.StopVerification, vscode.window.activeTextEditor.document.uri.toString());
        }
        else {
            Log_1.Log.hint("Extension not ready yet.");
        }
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.showStates', () => {
        StateVisualizer_1.StateVisualizer.showStates = true;
        let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(lastActiveTextEditor.toString()).stateVisualizer;
        visualizer.removeSpecialCharacters(() => {
            visualizer.addCharacterToDecorationOptionLocations();
            visualizer.showDecorations();
        });
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.hideStates', () => {
        StateVisualizer_1.StateVisualizer.showStates = false;
        ExtensionState_1.ExtensionState.viperFiles.forEach(file => {
            file.stateVisualizer.removeSpecialCharacters(() => {
                file.stateVisualizer.hideDecorations();
            });
        });
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.format', () => {
        formatter.formatOpenDoc();
    }));
}
function verify(fileState, manuallyTriggered) {
    let uri = fileState.uri.toString();
    if (Helper_1.Helper.isViperSourceFile(uri)) {
        if (!state.client) {
            Log_1.Log.hint("Extension not ready yet.");
        }
        else {
            let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(uri).stateVisualizer;
            visualizer.removeSpecialCharacters(() => {
                visualizer.hideDecorations();
                visualizer.reset();
                Log_1.Log.log("verify " + path.basename(uri));
                //change fileState
                fileState.changed = false;
                fileState.verified = false;
                fileState.verifying = true;
                let workspace = vscode.workspace.rootPath ? vscode.workspace.rootPath : path.dirname(fileState.uri.fsPath);
                state.client.sendRequest(ViperProtocol_1.Commands.Verify, { uri: uri, manuallyTriggered: manuallyTriggered, workspace: workspace });
            });
        }
    }
}
function progressBarText(progress) {
    let bar = "";
    for (var i = 0; i < progress / 10; i++) {
        bar = bar + "⚫";
    }
    for (var i = 10; i > progress / 10; i--) {
        bar = bar + "⚪";
    }
    return bar;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2V4dGVuc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFNYixJQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDNUIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFFN0Isd0JBQW9CLFNBQVMsQ0FBQyxDQUFBO0FBQzlCLE1BQVksTUFBTSxXQUFNLFFBQVEsQ0FBQyxDQUFBO0FBQ2pDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELGdDQUF1SCxpQkFBaUIsQ0FBQyxDQUFBO0FBQ3pJLHdCQUFnQixzQ0FBc0MsQ0FBQyxDQUFBO0FBQ3ZELHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUMxQixrQ0FBOEIsbUJBQW1CLENBQUMsQ0FBQTtBQUNsRCx5QkFBcUIsVUFBVSxDQUFDLENBQUE7QUFFaEMsaUNBQTZCLGtCQUFrQixDQUFDLENBQUE7QUFDaEQsaUNBQTZCLGtCQUFrQixDQUFDLENBQUE7QUFFaEQsSUFBSSxhQUFhLENBQUM7QUFDbEIsSUFBSSxpQkFBaUIsQ0FBQztBQUN0QixJQUFJLGdCQUFnQixDQUFDO0FBQ3JCLElBQUksV0FBVyxDQUFDO0FBQ2hCLElBQUksU0FBZ0IsQ0FBQztBQUNyQixJQUFJLEtBQXFCLENBQUM7QUFFMUIsSUFBSSxzQkFBNkIsQ0FBQztBQUVsQyxJQUFJLGlCQUEyQyxDQUFDO0FBQ2hELGlDQUFpQztBQUVqQyxJQUFJLFNBQXlCLENBQUM7QUFFOUIsSUFBSSxRQUFnQixDQUFDO0FBRXJCLElBQUksWUFBb0IsQ0FBQztBQUN6QixJQUFJLFlBQVksR0FBWSxLQUFLLENBQUM7QUFFbEMsSUFBSSxvQkFBZ0MsQ0FBQztBQVNyQyxJQUFLLFFBRUo7QUFGRCxXQUFLLFFBQVE7SUFDVCx1Q0FBSSxDQUFBO0lBQUUsMkNBQU0sQ0FBQTtJQUFFLHVDQUFJLENBQUEsQ0FBQSxt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