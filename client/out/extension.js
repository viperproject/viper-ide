'use strict';
const fs = require('fs');
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
    lastActiveTextEditor = Helper_1.Helper.isViperSourceFile(vscode.window.activeTextEditor.document.uri.toString()) ? vscode.window.activeTextEditor.document.uri : null;
    startVerificationController();
}
exports.activate = activate;
function resetViperFiles() {
    ExtensionState_1.ExtensionState.viperFiles.forEach(element => {
        element.changed = true;
        element.verified = false;
        element.verifying = false;
        element.decorationsShown = false;
        element.stateVisualizer.completeReset();
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
                    Log_1.Log.log("Warning: Only handle viper files, not file: " + task.uri.toString());
                    continue;
                }
                let fileState = ExtensionState_1.ExtensionState.viperFiles.get(task.uri.toString());
                if (!fileState) {
                    Log_1.Log.error("The file is unknown to the verification controller: " + path.basename(task.uri.toString()));
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
                        if (fileState.onlySpecialCharsChanged) {
                            fileState.onlySpecialCharsChanged = false;
                        }
                        else {
                            //Log.log("Save " + path.basename(task.uri.toString()) + " is handled", LogLevel.Info);
                            fileState.changed = true;
                            //TODO: ignore saves due to special characters
                            fileState.verified = false;
                            if (ExtensionState_1.ExtensionState.isDebugging) {
                                stopDebugging();
                            }
                            workList.push({ type: TaskType.Verify, uri: task.uri, manuallyTriggered: false });
                        }
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
                let uri = editor.document.uri;
                if (Helper_1.Helper.isViperSourceFile(uri.toString())) {
                    if (lastActiveTextEditor) {
                        if (lastActiveTextEditor.toString() === uri.toString()) {
                            Log_1.Log.log("No change in active viper file");
                            return;
                        }
                        let oldFileState = ExtensionState_1.ExtensionState.viperFiles.get(lastActiveTextEditor.toString());
                        oldFileState.decorationsShown = false;
                        oldFileState.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
                        if (ExtensionState_1.ExtensionState.isDebugging) {
                            stopDebugging();
                        }
                    }
                    let fileState = ExtensionState_1.ExtensionState.viperFiles.get(uri.toString());
                    fileState.setEditor(editor);
                    if (fileState.verified) {
                    }
                    else {
                        Log_1.Log.log("reverify because the active text editor changed");
                        workList.push({ type: TaskType.Verify, uri: uri, manuallyTriggered: false });
                    }
                    Log_1.Log.log("Active viper file changed to " + path.basename(uri.toString()), ViperProtocol_1.LogLevel.Info);
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
    Log_1.Log.log("deactivate", ViperProtocol_1.LogLevel.Info);
    state.dispose();
    //TODO: make sure no doc contains special chars any more
    let oldFileState = ExtensionState_1.ExtensionState.viperFiles.get(lastActiveTextEditor.toString());
    oldFileState.stateVisualizer.removeSpecialCharacters(() => {
        Log_1.Log.log("deactivated", ViperProtocol_1.LogLevel.Info);
    });
}
exports.deactivate = deactivate;
function registerFormatter() {
    formatter = new ViperFormatter_1.ViperFormatter();
}
function initializeStatusBar() {
    //state.state = VerificationState.Stopped;
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
            case ViperProtocol_1.VerificationState.PostProcessing:
                updateStatusBarItem(statusBarItem, `postprocessing ${params.filename}: `, 'white');
                break;
            case ViperProtocol_1.VerificationState.Stage:
                updateStatusBarItem(statusBarItem, `File ${params.filename}: Stage ${params.stage}`, 'white');
            case ViperProtocol_1.VerificationState.Ready:
                ExtensionState_1.ExtensionState.viperFiles.forEach(file => {
                    file.verifying = false;
                });
                if (!params.verificationCompleted) {
                    updateStatusBarItem(statusBarItem, "ready", 'white');
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
                            //for SymbexLogger
                            let symbexDotFile = path.resolve(path.join(vscode.workspace.rootPath, ".vscode", "dot_input.dot"));
                            let symbexSvgFile = path.resolve(path.join(vscode.workspace.rootPath, ".vscode", "symbExLoggerOutput.svg"));
                            if (fs.existsSync(symbexDotFile)) {
                                let fileState = ExtensionState_1.ExtensionState.viperFiles.get(params.uri);
                                fileState.stateVisualizer.generateSvg(symbexDotFile, symbexSvgFile, () => { });
                            }
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
        Log_1.Log.log("File openend: " + path.basename(uriObject.path), ViperProtocol_1.LogLevel.Info);
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
    state.client.onNotification(ViperProtocol_1.Commands.BackendStarted, name => {
        Log_1.Log.log("Backend started: " + name, ViperProtocol_1.LogLevel.Info);
        backendReady = true;
        //no file is verifying
        resetViperFiles();
        updateStatusBarItem(statusBarItem, "ready", 'white');
        //automatically trigger the first verification
        if (Helper_1.Helper.getConfiguration('autoVerifyAfterBackendChange') === true) {
            if (vscode.window.activeTextEditor.document.languageId === 'viper') {
                Log_1.Log.log("autoVerify after backend change");
                workList.push({ type: TaskType.Verify, uri: vscode.window.activeTextEditor.document.uri, manuallyTriggered: false });
            }
        }
    });
    //Heap visualization
    state.client.onNotification(ViperProtocol_1.Commands.StepsAsDecorationOptions, params => {
        let castParams = params;
        if (!castParams) {
            Log_1.Log.error("Invalid Params for StepsAdDecorationOptions");
        }
        let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(castParams.uri).stateVisualizer;
        visualizer.storeNewStates(castParams);
    });
    state.client.onRequest(ViperProtocol_1.Commands.HeapGraph, (heapGraph) => {
        try {
            //Log.log("HeapGraph",LogLevel.Debug);
            let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(heapGraph.fileUri).stateVisualizer;
            visualizer.createAndShowHeap(heapGraph, visualizer.nextHeapIndex);
            visualizer.nextHeapIndex = 1 - visualizer.nextHeapIndex;
        }
        catch (e) {
            Log_1.Log.error("Error displaying HeapGraph: " + e);
        }
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
    state.client.onNotification(ViperProtocol_1.Commands.VerificationNotStarted, uri => {
        try {
            Log_1.Log.log("Verification not started for " + path.basename(uri));
            //reset the verifying flag if it is not beeing verified
            let fileState = ExtensionState_1.ExtensionState.viperFiles.get(uri).verifying = false;
        }
        catch (e) {
            Log_1.Log.error("Error handling verification not started request: " + e);
        }
    });
    state.client.onNotification(ViperProtocol_1.Commands.StopDebugging, () => {
        Log_1.Log.log("Stop Debugging", ViperProtocol_1.LogLevel.Info);
        let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(lastActiveTextEditor.toString()).stateVisualizer;
        hideStates(() => { }, visualizer);
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
        if (!vscode.window.activeTextEditor) {
            Log_1.Log.log("Don't debug, active file is not editable.", ViperProtocol_1.LogLevel.Debug);
            return;
        }
        let uri = vscode.window.activeTextEditor.document.uri;
        if (!Helper_1.Helper.isViperSourceFile(uri.toString())) {
            Log_1.Log.log("Don't debug, active file is no viper file.", ViperProtocol_1.LogLevel.Debug);
            return;
        }
        if (!backendReady) {
            Log_1.Log.log("Don't debug, backend is not ready.", ViperProtocol_1.LogLevel.Debug);
            return;
        }
        let fileState = ExtensionState_1.ExtensionState.viperFiles.get(uri.toString());
        if (!fileState || !fileState.verified) {
            Log_1.Log.log("Don't debug, file is not verified", ViperProtocol_1.LogLevel.Debug);
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
            };
            showStates(() => {
                vscode.commands.executeCommand('vscode.startDebug', launchConfig).then(() => {
                    Log_1.Log.log('Debug session started successfully', ViperProtocol_1.LogLevel.Info);
                    ExtensionState_1.ExtensionState.isDebugging = true;
                }, err => {
                    Log_1.Log.error("Error starting debugger: " + err.message);
                });
            });
        }
        catch (e) {
            Log_1.Log.error("Error starting debug session: " + e);
        }
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
        showStates(() => { });
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.hideStates', () => {
        let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(lastActiveTextEditor.toString()).stateVisualizer;
        hideStates(() => { }, visualizer);
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.format', () => {
        formatter.formatOpenDoc();
    }));
}
function stopDebugging() {
    Log_1.Log.log("Tell language server to stop debugging");
    state.client.sendNotification(ViperProtocol_1.Commands.StopDebugging);
}
function showStates(callback) {
    try {
        if (!StateVisualizer_1.StateVisualizer.showStates) {
            StateVisualizer_1.StateVisualizer.showStates = true;
            let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(lastActiveTextEditor.toString()).stateVisualizer;
            visualizer.removeSpecialCharacters(() => {
                visualizer.addCharacterToDecorationOptionLocations(() => {
                    visualizer.showDecorations();
                    callback();
                });
            });
        }
        else {
            Log_1.Log.log("don't show states, they are already shown");
        }
    }
    catch (e) {
        Log_1.Log.error("Error showing States: " + e);
    }
}
function hideStates(callback, visualizer) {
    try {
        vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup').then(success => { }, error => {
            Log_1.Log.error("Error changing the focus to the first editorGroup");
        });
        ExtensionState_1.ExtensionState.isDebugging = false;
        Log_1.Log.log("Hide states for " + visualizer.viperFile.name(), ViperProtocol_1.LogLevel.Info);
        StateVisualizer_1.StateVisualizer.showStates = false;
        visualizer.removeSpecialCharacters(() => {
            visualizer.hideDecorations();
            visualizer.reset();
            callback();
        });
    }
    catch (e) {
        Log_1.Log.error("Error hiding States: " + e);
    }
}
function verify(fileState, manuallyTriggered) {
    let uri = fileState.uri.toString();
    if (Helper_1.Helper.isViperSourceFile(uri)) {
        if (!state.client) {
            Log_1.Log.hint("Extension not ready yet.");
        }
        else {
            let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(uri).stateVisualizer;
            visualizer.completeReset();
            hideStates(() => {
                //delete old SymbExLog:
                Log_1.Log.deleteFile(Log_1.Log.symbExLogFilePath);
                Log_1.Log.log("verify " + path.basename(uri));
                //change fileState
                fileState.changed = false;
                fileState.verified = false;
                fileState.verifying = true;
                let workspace = vscode.workspace.rootPath ? vscode.workspace.rootPath : path.dirname(fileState.uri.fsPath);
                state.client.sendRequest(ViperProtocol_1.Commands.Verify, { uri: uri, manuallyTriggered: manuallyTriggered, workspace: workspace });
            }, visualizer);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2V4dGVuc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFLYixNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUN6QixJQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDNUIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFFN0Isd0JBQW9CLFNBQVMsQ0FBQyxDQUFBO0FBQzlCLE1BQVksTUFBTSxXQUFNLFFBQVEsQ0FBQyxDQUFBO0FBQ2pDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELGdDQUF1SixpQkFBaUIsQ0FBQyxDQUFBO0FBQ3pLLHdCQUFnQixzQ0FBc0MsQ0FBQyxDQUFBO0FBQ3ZELHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUMxQixrQ0FBOEIsbUJBQW1CLENBQUMsQ0FBQTtBQUNsRCx5QkFBcUIsVUFBVSxDQUFDLENBQUE7QUFFaEMsaUNBQTZCLGtCQUFrQixDQUFDLENBQUE7QUFDaEQsaUNBQTZCLGtCQUFrQixDQUFDLENBQUE7QUFFaEQsSUFBSSxhQUFhLENBQUM7QUFDbEIsSUFBSSxpQkFBaUIsQ0FBQztBQUN0QixJQUFJLGdCQUFnQixDQUFDO0FBQ3JCLElBQUksV0FBVyxDQUFDO0FBQ2hCLElBQUksU0FBZ0IsQ0FBQztBQUNyQixJQUFJLEtBQXFCLENBQUM7QUFFMUIsSUFBSSxzQkFBNkIsQ0FBQztBQUVsQyxJQUFJLGlCQUEyQyxDQUFDO0FBQ2hELGlDQUFpQztBQUVqQyxJQUFJLFNBQXlCLENBQUM7QUFFOUIsSUFBSSxRQUFnQixDQUFDO0FBRXJCLElBQUksWUFBb0IsQ0FBQztBQUN6QixJQUFJLFlBQVksR0FBWSxLQUFLLENBQUM7QUFFbEMsSUFBSSxvQkFBZ0MsQ0FBQztBQVNyQyxJQUFLLFFBRUo7QUFGRCxXQUFLLFFBQVE7SUFDVCx1Q0FBSSxDQUFBO0lB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