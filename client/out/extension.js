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
let _backendReady = false;
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
    let uri = vscode.window.activeTextEditor.document.uri;
    lastActiveTextEditor = Helper_1.Helper.isViperSourceFile(uri.toString()) ? uri : null;
    startVerificationController();
}
exports.activate = activate;
function resetViperFiles() {
    Log_1.Log.log("Reset all viper files", ViperProtocol_1.LogLevel.Info);
    ExtensionState_1.ExtensionState.viperFiles.forEach(element => {
        element.changed = true;
        element.verified = false;
        element.verifying = false;
        element.decorationsShown = false;
        element.stateVisualizer.completeReset();
    });
}
function isBackendReady(prefix) {
    if (!_backendReady) {
        Log_1.Log.log(prefix + "Backend is not ready.", ViperProtocol_1.LogLevel.Debug);
    }
    return _backendReady;
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
                    Log_1.Log.log("Warning: Only handle viper files, not file: " + path.basename(task.uri.toString()), ViperProtocol_1.LogLevel.Info);
                    continue;
                }
                let fileState = ExtensionState_1.ExtensionState.viperFiles.get(task.uri.toString());
                if (!fileState) {
                    Log_1.Log.error("The file is unknown to the verification controller: " + path.basename(task.uri.toString()), ViperProtocol_1.LogLevel.Debug);
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
                                Log_1.Log.log(dontVerify + "file is closed", ViperProtocol_1.LogLevel.Debug);
                            }
                            else if (fileState.verifying) {
                                Log_1.Log.log(dontVerify + `file is verifying`, ViperProtocol_1.LogLevel.Debug);
                            }
                            else if (!task.manuallyTriggered && fileState.verified) {
                                Log_1.Log.log(dontVerify + `not manuallyTriggered and file is verified`, ViperProtocol_1.LogLevel.Debug);
                            } /* else if (!task.manuallyTriggered && fileState.success === Success.Aborted) {
                                Log.log(dontVerify + `not manuallyTriggered and file was aborted when last verified`, LogLevel.Debug);
                            } else if (!task.manuallyTriggered && fileState.success === Success.Error) {
                                Log.log(dontVerify + `not manuallyTriggered and file caused error when last verified`, LogLevel.Debug);
                            }*/
                            else if (!activeFile) {
                                Log_1.Log.log(dontVerify + `no file is active`, ViperProtocol_1.LogLevel.Debug);
                            }
                            else if (activeFile !== task.uri.toString()) {
                                Log_1.Log.log(dontVerify + `another file is active`, ViperProtocol_1.LogLevel.Debug);
                            }
                            else {
                                verify(fileState, task.manuallyTriggered);
                            }
                        }
                        else {
                            Log_1.Log.log("Backend is not ready, wait for backend to start.", ViperProtocol_1.LogLevel.Info);
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
                            Log_1.Log.log("No change in active viper file", ViperProtocol_1.LogLevel.Debug);
                            return;
                        }
                        let oldFileState = ExtensionState_1.ExtensionState.viperFiles.get(lastActiveTextEditor.toString());
                        if (oldFileState) {
                            oldFileState.decorationsShown = false;
                            oldFileState.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
                            if (ExtensionState_1.ExtensionState.isDebugging) {
                                stopDebugging();
                            }
                        }
                    }
                    let fileState = ExtensionState_1.ExtensionState.viperFiles.get(uri.toString());
                    if (fileState) {
                        fileState.setEditor(editor);
                        if (fileState.verified) {
                        }
                        else {
                            Log_1.Log.log("reverify because the active text editor changed", ViperProtocol_1.LogLevel.Debug);
                            workList.push({ type: TaskType.Verify, uri: uri, manuallyTriggered: false });
                        }
                        Log_1.Log.log("Active viper file changed to " + path.basename(uri.toString()), ViperProtocol_1.LogLevel.Info);
                        lastActiveTextEditor = uri;
                    }
                    else {
                        Log_1.Log.log("No fileState for selected editor, It is not a viper file", ViperProtocol_1.LogLevel.Debug);
                    }
                }
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling active text editor change: " + e);
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
        if (!params.progress)
            Log_1.Log.log("The new state is: " + ViperProtocol_1.VerificationState[params.newState], ViperProtocol_1.LogLevel.Debug);
        let window = vscode.window;
        switch (params.newState) {
            case ViperProtocol_1.VerificationState.Starting:
                _backendReady = false;
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
                Log_1.Log.log("Run " + params.stage + " for " + params.filename);
                updateStatusBarItem(statusBarItem, `File ${params.filename}: Stage ${params.stage}`, 'white');
            case ViperProtocol_1.VerificationState.Ready:
                statusBarProgress.hide();
                abortButton.hide();
                ExtensionState_1.ExtensionState.viperFiles.forEach(file => {
                    file.verifying = false;
                });
                if (!params.verificationCompleted) {
                    updateStatusBarItem(statusBarItem, "ready", 'white');
                }
                else {
                    let uri = vscode.Uri.parse(params.uri);
                    //since at most one file can be verified at a time, set all to non-verified before potentially setting one to verified 
                    ExtensionState_1.ExtensionState.viperFiles.forEach(state => state.verified = false);
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
                            if (Helper_1.Helper.getConfiguration("advancedFeatures") === true && fs.existsSync(symbexDotFile)) {
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
                            let moreInfo = " - see View->Output->Viper for more info";
                            updateStatusBarItem(statusBarItem, `$(x) Internal error` + moreInfo, 'red');
                            msg = `Verifying ${params.filename} failed due to an internal error`;
                            Log_1.Log.log(`Internal Error: failed to verify ${params.filename}: Reason: ` + (params.error && params.error.length > 0 ? params.error : "Unknown Reason: Set loglevel to 5 and see the viper.log file for more details"));
                            Log_1.Log.hint(msg + moreInfo);
                            break;
                    }
                }
                break;
            case ViperProtocol_1.VerificationState.Stopping:
                updateStatusBarItem(statusBarItem, 'preparing', 'orange');
                break;
            case ViperProtocol_1.VerificationState.Stopped:
                updateStatusBarItem(statusBarItem, 'stopped', 'white');
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
        try {
            updateStatusBarItem(backendStatusBar, newBackend, "white");
            if (ExtensionState_1.ExtensionState.viperFiles) {
                ExtensionState_1.ExtensionState.viperFiles.forEach(file => file.success = ViperProtocol_1.Success.None);
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling backend change: " + e);
        }
    });
    state.client.onNotification(ViperProtocol_1.Commands.FileOpened, (uri) => {
        try {
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
        }
        catch (e) {
            Log_1.Log.error("Error handling file opened notification: " + e);
        }
    });
    state.client.onNotification(ViperProtocol_1.Commands.FileClosed, (uri) => {
        try {
            let uriObject = vscode.Uri.parse(uri);
            Log_1.Log.log("File closed: " + path.basename(uriObject.path), ViperProtocol_1.LogLevel.Info);
            let fileState = ExtensionState_1.ExtensionState.viperFiles.get(uri);
            fileState.open = false;
            fileState.verified = false;
            if (lastActiveTextEditor.toString() == uriObject.toString()) {
                lastActiveTextEditor = null;
            }
            fileState.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
        }
        catch (e) {
            Log_1.Log.error("Error handling file closed notification: " + e);
        }
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
    state.context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((params) => {
        try {
            workList.push({ type: TaskType.Save, uri: params.uri });
        }
        catch (e) {
            Log_1.Log.error("Error handling saved document: " + e);
        }
    }));
    state.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        try {
            Log_1.Log.updateSettings();
        }
        catch (e) {
            Log_1.Log.error("Error handling configuration change: " + e);
        }
    }));
    state.client.onNotification(ViperProtocol_1.Commands.BackendReady, (params) => {
        handleBackendReadyNotification(params);
    });
    //Heap visualization
    state.client.onNotification(ViperProtocol_1.Commands.StepsAsDecorationOptions, params => {
        try {
            let castParams = params;
            if (!castParams) {
                Log_1.Log.error("Invalid Params for StepsAdDecorationOptions");
            }
            let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(castParams.uri).stateVisualizer;
            visualizer.storeNewStates(castParams);
        }
        catch (e) {
            Log_1.Log.error("Error handling steps as decoration options notification: " + e);
        }
    });
    state.client.onRequest(ViperProtocol_1.Commands.HeapGraph, (heapGraph) => {
        try {
            if (Helper_1.Helper.getConfiguration("advancedFeatures") === true) {
                let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(heapGraph.fileUri).stateVisualizer;
                let state = visualizer.decorationOptions[heapGraph.state];
                if (Helper_1.Helper.getConfiguration("simpleMode") === true) {
                    //Simple Mode
                    if (state.isErrorState) {
                        //replace the error state
                        visualizer.createAndShowHeap(heapGraph, 0);
                        visualizer.markStateSelection(heapGraph.methodName, heapGraph.state, heapGraph.position);
                    }
                    else {
                        //replace the execution state
                        visualizer.createAndShowHeap(heapGraph, 1);
                        let errorHeap = visualizer.provider.getHeap(0);
                        visualizer.previousState = heapGraph.state;
                        visualizer.markStateSelection(errorHeap.methodName, errorHeap.state, errorHeap.position);
                    }
                }
                else {
                    //Advanced Mode
                    if (heapGraph.state != visualizer.previousState) {
                        visualizer.createAndShowHeap(heapGraph, visualizer.nextHeapIndex);
                        visualizer.markStateSelection(heapGraph.methodName, heapGraph.state, heapGraph.position);
                    }
                }
            }
            else {
                Log_1.Log.log("WARNING: Heap Graph is generated, even though the advancedFeatures are disabled.", ViperProtocol_1.LogLevel.Debug);
            }
        }
        catch (e) {
            Log_1.Log.error("Error displaying HeapGraph: " + e);
        }
    });
    vscode.window.onDidChangeTextEditorSelection((change) => {
        try {
            if (!change.textEditor.document) {
                Log_1.Log.error("document is undefined in onDidChangeTextEditorSelection");
                return;
            }
            let uri = change.textEditor.document.uri.toString();
            let start = change.textEditor.selection.start;
            let fileState = ExtensionState_1.ExtensionState.viperFiles.get(uri);
            if (fileState) {
                fileState.stateVisualizer.showStateSelection(start);
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling text editor selection change: " + e);
        }
    });
    state.client.onRequest(ViperProtocol_1.Commands.StateSelected, change => {
        try {
            let castChange = change;
            if (!castChange) {
                Log_1.Log.error("error casting stateSelected Request data");
            }
            let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(castChange.uri).stateVisualizer;
            visualizer.showStateSelection({ line: castChange.line, character: castChange.character });
        }
        catch (e) {
            Log_1.Log.error("Error handling state selected request: " + e);
        }
    });
    state.client.onNotification(ViperProtocol_1.Commands.VerificationNotStarted, uri => {
        try {
            Log_1.Log.log("Verification not started for " + path.basename(uri), ViperProtocol_1.LogLevel.Debug);
            //reset the verifying flag if it is not beeing verified
            let fileState = ExtensionState_1.ExtensionState.viperFiles.get(uri).verifying = false;
        }
        catch (e) {
            Log_1.Log.error("Error handling verification not started request: " + e);
        }
    });
    state.client.onNotification(ViperProtocol_1.Commands.StopDebugging, () => {
        try {
            Log_1.Log.log("Stop Debugging", ViperProtocol_1.LogLevel.Info);
            let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(lastActiveTextEditor.toString()).stateVisualizer;
            hideStates(() => { }, visualizer);
        }
        catch (e) {
            Log_1.Log.error("Error handling stop debugging request: " + e);
        }
    });
    //Command Handlers
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.verify', () => {
        workList.push({ type: TaskType.Verify, uri: vscode.window.activeTextEditor.document.uri, manuallyTriggered: true });
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.selectBackend', () => {
        try {
            if (!state.client) {
                Log_1.Log.hint("Extension not ready yet.");
            }
            else {
                state.client.sendRequest(ViperProtocol_1.Commands.RequestBackendNames, null).then((backendNames) => {
                    if (backendNames.length > 1) {
                        vscode.window.showQuickPick(backendNames).then(selectedBackend => {
                            if (selectedBackend && selectedBackend.length > 0) {
                                startBackend(selectedBackend);
                            }
                            else {
                                Log_1.Log.log("No backend was selected, don't change the backend");
                            }
                        });
                    }
                    else {
                        Log_1.Log.log("No need to ask user, since there is only one backend.", ViperProtocol_1.LogLevel.Debug);
                        startBackend(backendNames[0]);
                    }
                }, (reason) => {
                    Log_1.Log.error("Backend change request was rejected: reason: " + reason.toString());
                });
            }
        }
        catch (e) {
            Log_1.Log.error("Error selecting backend: " + e);
        }
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.startDebugging', () => {
        try {
            if (Helper_1.Helper.getConfiguration("advancedFeatures") === true) {
                if (!lastActiveTextEditor) {
                    Log_1.Log.log("Don't debug, no viper file open.", ViperProtocol_1.LogLevel.Debug);
                    return;
                }
                let uri = lastActiveTextEditor;
                let filename = path.basename(uri.toString());
                if (!isBackendReady("Don't debug " + filename + ", "))
                    return;
                let fileState = ExtensionState_1.ExtensionState.viperFiles.get(uri.toString());
                if (!fileState || !fileState.verified) {
                    Log_1.Log.log("Don't debug " + filename + ", file is not verified", ViperProtocol_1.LogLevel.Debug);
                    workList.push({ type: TaskType.Verify, uri: uri, manuallyTriggered: false });
                    return;
                }
                if (!fileState.stateVisualizer.readyToDebug) {
                    Log_1.Log.hint("Don't debug " + filename + ", the verification provided no states");
                    return;
                }
                if (Helper_1.Helper.getConfiguration("simpleMode") === true) {
                    if (!fileState.stateVisualizer.decorationOptions.some(option => option.isErrorState)) {
                        Log_1.Log.hint("Don't debug in simple mode, because there is no error state");
                        return;
                    }
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
                };
                if (ExtensionState_1.ExtensionState.isDebugging) {
                    Log_1.Log.hint("Don't debug " + filename + ", the file is already being debugged");
                    return;
                }
                showStates(() => {
                    vscode.commands.executeCommand('vscode.startDebug', launchConfig).then(() => {
                        Log_1.Log.log('Debug session started successfully', ViperProtocol_1.LogLevel.Info);
                        ExtensionState_1.ExtensionState.isDebugging = true;
                    }, err => {
                        Log_1.Log.error("Error starting debugger: " + err.message);
                    });
                });
            }
            else {
                Log_1.Log.hint("Enable the advanced features in the settings to use debugging.");
            }
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
            state.client.sendNotification(ViperProtocol_1.Commands.StopVerification, lastActiveTextEditor.toString());
        }
        else {
            Log_1.Log.hint("Extension not ready yet.");
        }
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.format', () => {
        try {
            formatter.formatOpenDoc();
        }
        catch (e) {
            Log_1.Log.error("Error handling formating request: " + e);
        }
    }));
}
function startBackend(backendName) {
    try {
        _backendReady = false;
        state.client.sendNotification(ViperProtocol_1.Commands.StartBackend, backendName);
    }
    catch (e) {
        Log_1.Log.error("Error starting backend: " + e);
    }
}
function handleBackendReadyNotification(params) {
    try {
        _backendReady = true;
        Log_1.Log.log("Backend ready: " + params.name, ViperProtocol_1.LogLevel.Info);
        updateStatusBarItem(statusBarItem, "ready", 'white');
        //automatically trigger the first verification
        if (params.restarted) {
            //no file is verifying
            resetViperFiles();
            if (lastActiveTextEditor && Helper_1.Helper.getConfiguration('autoVerifyAfterBackendChange') === true) {
                Log_1.Log.log("autoVerify after backend change", ViperProtocol_1.LogLevel.Info);
                workList.push({ type: TaskType.Verify, uri: lastActiveTextEditor, manuallyTriggered: false });
            }
        }
    }
    catch (e) {
        Log_1.Log.error("Error handling backend started notification: " + e);
    }
}
function stopDebugging() {
    Log_1.Log.log("Tell language server to stop debugging", ViperProtocol_1.LogLevel.Debug);
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
            Log_1.Log.log("don't show states, they are already shown", ViperProtocol_1.LogLevel.Debug);
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
                //change fileState
                fileState.changed = false;
                fileState.verified = false;
                fileState.verifying = true;
                let workspace = vscode.workspace.rootPath ? vscode.workspace.rootPath : path.dirname(fileState.uri.fsPath);
                state.client.sendNotification(ViperProtocol_1.Commands.Verify, { uri: uri, manuallyTriggered: manuallyTriggered, workspace: workspace });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2V4dGVuc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFLYixNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUN6QixJQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDNUIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFFN0Isd0JBQW9CLFNBQVMsQ0FBQyxDQUFBO0FBQzlCLE1BQVksTUFBTSxXQUFNLFFBQVEsQ0FBQyxDQUFBO0FBQ2pDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELGdDQUErSSxpQkFBaUIsQ0FBQyxDQUFBO0FBQ2pLLHdCQUFnQixzQ0FBc0MsQ0FBQyxDQUFBO0FBQ3ZELHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUMxQixrQ0FBOEIsbUJBQW1CLENBQUMsQ0FBQTtBQUNsRCx5QkFBcUIsVUFBVSxDQUFDLENBQUE7QUFFaEMsaUNBQTZCLGtCQUFrQixDQUFDLENBQUE7QUFDaEQsaUNBQTZCLGtCQUFrQixDQUFDLENBQUE7QUFFaEQsSUFBSSxhQUFhLENBQUM7QUFDbEIsSUFBSSxpQkFBaUIsQ0FBQztBQUN0QixJQUFJLGdCQUFnQixDQUFDO0FBQ3JCLElBQUksV0FBVyxDQUFDO0FBQ2hCLElBQUksU0FBZ0IsQ0FBQztBQUNyQixJQUFJLEtBQXFCLENBQUM7QUFFMUIsSUFBSSxzQkFBNkIsQ0FBQztBQUVsQyxJQUFJLGlCQUEyQyxDQUFDO0FBQ2hELGlDQUFpQztBQUVqQyxJQUFJLFNBQXlCLENBQUM7QUFFOUIsSUFBSSxRQUFnQixDQUFDO0FBRXJCLElBQUksWUFBb0IsQ0FBQztBQUN6QixJQUFJLGFBQWEsR0FBWSxLQUFLLENBQUM7QUFFbkMsSUFBSSxvQkFBZ0MsQ0FBQztBQVNyQyxJQUFLLFFBRUo7QUFGRCxXQUFLLFFBQVE7SUFDVCx1Q0FBSSxDQUFBO0lBQUUsMkNBQU0sQ0FBQTtJQUFFLHVDQUFJLENBQUEsQ0FBQSxtQ0FBbUM7QUFDekQsQ0FBQyxFQUZJLFFBQVEsS0FBUixRQUFRLFFBRVo7QUFFRCx5REFBeUQ7QUFDekQsMEVBQTBFO0FBQzFFLGtCQUF5QixPQUFnQztJQUNyRCxRQUFRLEdBQUcsRUFBRSxDQUFDO0lBQ2QsK0JBQWMsQ0FBQyxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQTBCLENBQUM7SUFDOUQsU0FBRyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN4QixTQUFHLENBQUMsR0FBRyxDQUFDLDZCQUE2QixFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDdEQsS0FBSyxHQUFHLCtCQUFjLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztJQUM5QyxLQUFLLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztJQUM3QixPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNsQyxpQkFBaUIsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLHVCQUF1QixDQUFDLG9CQUFvQixDQUFDLENBQUM7SUFDbkYsS0FBSyxDQUFDLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLFFBQVE7SUFDdEUsZ0JBQWdCLEVBQUUsQ0FBQztJQUNuQixjQUFjLEVBQUUsQ0FBQztJQUNqQixtQkFBbUIsRUFBRSxDQUFDO0lBQ3RCLFNBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQztJQUNyQixpQkFBaUIsRUFBRSxDQUFDO0lBQ3BCLElBQUksR0FBRyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQztJQUN0RCxvQkFBb0IsR0FBRyxlQUFNLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQztJQUM3RSwyQkFBMkIsRUFBRSxDQUFDO0FBQ2xDLENBQUM7QUFsQmUsZ0JBQVEsV0FrQnZCLENBQUE7QUFFRDtJQUNJLFNBQUcsQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNoRCwrQkFBYyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsT0FBTztRQUNyQyxPQUFPLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztRQUN2QixPQUFPLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztRQUN6QixPQUFPLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztRQUMxQixPQUFPLENBQUMsZ0JBQWdCLEdBQUcsS0FBSyxDQUFDO1FBQ2pDLE9BQU8sQ0FBQyxlQUFlLENBQUMsYUFBYSxFQUFFLENBQUM7SUFDNUMsQ0FBQyxDQUFDLENBQUM7QUFDUCxDQUFDO0FBRUQsd0JBQXdCLE1BQWM7SUFDbEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1FBQ2pCLFNBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFHLHVCQUF1QixFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUNELE1BQU0sQ0FBQyxhQUFhLENBQUM7QUFDekIsQ0FBQztBQUVEO0lBQ0ksSUFBSSxtQkFBbUIsR0FBRyxHQUFHLENBQUMsQ0FBQSxJQUFJO0lBQ2xDLHNCQUFzQixHQUFHLElBQUksYUFBSyxDQUFDO1FBQy9CLElBQUksQ0FBQztZQUNELElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQztZQUNqQixJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFVixzQkFBc0I7WUFDdEIsT0FBTyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDOUQsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3JCLENBQUM7WUFFRCxPQUFPLENBQUMsSUFBSSxJQUFJLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ2xDLElBQUksSUFBSSxHQUFHLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN6QixFQUFFLENBQUMsQ0FBQyxDQUFDLGVBQU0sQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNqRCxJQUFJLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUM7b0JBQzFCLFNBQUcsQ0FBQyxHQUFHLENBQUMsOENBQThDLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDNUcsUUFBUSxDQUFDO2dCQUNiLENBQUM7Z0JBQ0QsSUFBSSxTQUFTLEdBQUcsK0JBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztnQkFDbkUsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO29CQUNiLFNBQUcsQ0FBQyxLQUFLLENBQUMsc0RBQXNELEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDdkgsUUFBUSxDQUFDO2dCQUNiLENBQUM7Z0JBQ0QsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2hCLEtBQUssUUFBUSxDQUFDLE1BQU07d0JBQ2hCLElBQUksVUFBVSxHQUFHLGdCQUFnQixJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxDQUFDO3dCQUN4RSxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDOzRCQUM3Qix5RkFBeUY7NEJBRXpGLElBQUksVUFBVSxDQUFDOzRCQUNmLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO2dDQUNqQyxVQUFVLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDOzRCQUN4RSxDQUFDOzRCQUVELEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0NBQ2xCLFNBQUcsQ0FBQyxHQUFHLENBQUMsVUFBVSxHQUFHLGdCQUFnQixFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7NEJBQzNELENBQUM7NEJBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dDQUM3QixTQUFHLENBQUMsR0FBRyxDQUFDLFVBQVUsR0FBRyxtQkFBbUIsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDOzRCQUc5RCxDQUFDOzRCQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsSUFBSSxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQ0FDdkQsU0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEdBQUcsNENBQTRDLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQzs0QkFDdkYsQ0FBQyxDQUFBOzs7OytCQUlFOzRCQUNILElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7Z0NBQ25CLFNBQUcsQ0FBQyxHQUFHLENBQUMsVUFBVSxHQUFHLG1CQUFtQixFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7NEJBQzlELENBQUM7NEJBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFVBQVUsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztnQ0FDNUMsU0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEdBQUcsd0JBQXdCLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQzs0QkFHbkUsQ0FBQzs0QkFBQyxJQUFJLENBQUMsQ0FBQztnQ0FDSixNQUFNLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDOzRCQUM5QyxDQUFDO3dCQUNMLENBQUM7d0JBQUMsSUFBSSxDQUFDLENBQUM7NEJBQ0osU0FBRyxDQUFDLEdBQUcsQ0FBQyxrREFBa0QsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO3dCQUMvRSxDQUFDO3dCQUNELElBQUksQ0FBQyxJQUFJLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQzt3QkFDMUIsS0FBSyxDQUFDO29CQUNWLEtBQUssUUFBUSxDQUFDLElBQUk7d0JBQ2QsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQzs0QkFDcEMsU0FBUyxDQUFDLHVCQUF1QixHQUFHLEtBQUssQ0FBQzt3QkFDOUMsQ0FBQzt3QkFBQyxJQUFJLENBQUMsQ0FBQzs0QkFDSix1RkFBdUY7NEJBQ3ZGLFNBQVMsQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDOzRCQUN6Qiw4Q0FBOEM7NEJBQzlDLFNBQVMsQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDOzRCQUUzQixFQUFFLENBQUMsQ0FBQywrQkFBYyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7Z0NBQzdCLGFBQWEsRUFBRSxDQUFDOzRCQUNwQixDQUFDOzRCQUNELFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO3dCQUN0RixDQUFDO3dCQUNELElBQUksQ0FBQyxJQUFJLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQzt3QkFDMUIsS0FBSyxDQUFDO2dCQWFkLENBQUM7WUFDTCxDQUFDO1FBQ0wsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3BELFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNyQixDQUFDO0lBQ0wsQ0FBQyxFQUFFLG1CQUFtQixDQUFDLENBQUM7SUFDeEIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUM7SUFFekQsdUNBQXVDO0lBQ3ZDLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLDJCQUEyQixDQUFDO1FBQ3ZFLElBQUksQ0FBQztZQUNELElBQUksTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUM7WUFDNUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDVCxJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQztnQkFDOUIsRUFBRSxDQUFDLENBQUMsZUFBTSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDM0MsRUFBRSxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO3dCQUN2QixFQUFFLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDOzRCQUNyRCxTQUFHLENBQUMsR0FBRyxDQUFDLGdDQUFnQyxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7NEJBQzFELE1BQU0sQ0FBQzt3QkFDWCxDQUFDO3dCQUNELElBQUksWUFBWSxHQUFHLCtCQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO3dCQUNsRixFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDOzRCQUNmLFlBQVksQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7NEJBQ3RDLFlBQVksQ0FBQyxlQUFlLENBQUMsb0NBQW9DLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQzs0QkFDN0UsRUFBRSxDQUFDLENBQUMsK0JBQWMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO2dDQUM3QixhQUFhLEVBQUUsQ0FBQzs0QkFDcEIsQ0FBQzt3QkFDTCxDQUFDO29CQUNMLENBQUM7b0JBQ0QsSUFBSSxTQUFTLEdBQUcsK0JBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO29CQUM5RCxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO3dCQUNaLFNBQVMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7d0JBRTVCLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO3dCQUV6QixDQUFDO3dCQUFDLElBQUksQ0FBQyxDQUFDOzRCQUNKLFNBQUcsQ0FBQyxHQUFHLENBQUMsaURBQWlELEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQzs0QkFDM0UsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQTt3QkFDaEYsQ0FBQzt3QkFDRCxTQUFHLENBQUMsR0FBRyxDQUFDLCtCQUErQixHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQzt3QkFDeEYsb0JBQW9CLEdBQUcsR0FBRyxDQUFDO29CQUMvQixDQUFDO29CQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNKLFNBQUcsQ0FBQyxHQUFHLENBQUMsMERBQTBELEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDeEYsQ0FBQztnQkFDTCxDQUFDO1lBQ0wsQ0FBQztRQUNMLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyw0Q0FBNEMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNoRSxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNSLENBQUM7QUFFRDtJQUNJLFNBQUcsQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDckMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2hCLHdEQUF3RDtJQUN4RCxJQUFJLFlBQVksR0FBRywrQkFBYyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUNsRixZQUFZLENBQUMsZUFBZSxDQUFDLHVCQUF1QixDQUFDO1FBQ2pELFNBQUcsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDMUMsQ0FBQyxDQUFDLENBQUM7QUFDUCxDQUFDO0FBUmUsa0JBQVUsYUFRekIsQ0FBQTtBQUVEO0lBQ0ksU0FBUyxHQUFHLElBQUksK0JBQWMsRUFBRSxDQUFDO0FBQ3JDLENBQUM7QUFFRDtJQUNJLDBDQUEwQztJQUUxQyxpQkFBaUIsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDMUYsYUFBYSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN0RixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsa0JBQWtCLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFFaEUsV0FBVyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNuRixXQUFXLENBQUMsT0FBTyxHQUFHLDRCQUE0QixDQUFDO0lBQ25ELG1CQUFtQixDQUFDLFdBQVcsRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQTtJQUVwRSxLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUNwRCxLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDaEQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBRTlDLGdCQUFnQixHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztBQUM3RixDQUFDO0FBRUQsNkJBQTZCLElBQUksRUFBRSxJQUFZLEVBQUUsS0FBYSxFQUFFLE9BQU8sR0FBVyxJQUFJLEVBQUUsSUFBSSxHQUFZLElBQUk7SUFDeEcsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7SUFDakIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7SUFDbkIsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7SUFDdkIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNQLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNoQixDQUFDO0lBQUMsSUFBSSxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDaEIsQ0FBQztBQUNMLENBQUM7QUFFRDtJQUNJLElBQUksZUFBZSxHQUFHLElBQUksQ0FBQyxDQUFBLElBQUk7SUFDL0IsU0FBUyxHQUFHLElBQUksYUFBSyxDQUFDO1FBQ2xCLHVCQUF1QjtRQUN2QixFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixJQUFJLElBQUksSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxVQUFVLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQztZQUMxRyxFQUFFLENBQUMsQ0FBQyxlQUFNLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDL0MsNEJBQTRCO2dCQUM1QixNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNuRCxDQUFDO1FBQ0wsQ0FBQztJQUNMLENBQUMsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUVwQixLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFFNUMsSUFBSSxrQ0FBa0MsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLDJCQUEyQixDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ25HLElBQUksMkJBQTJCLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyw4QkFBOEIsQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUMvRixLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsa0NBQWtDLENBQUMsQ0FBQztJQUNyRSxLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsMkJBQTJCLENBQUMsQ0FBQztBQUNsRSxDQUFDO0FBRUQ7SUFDSSxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7QUFDdEIsQ0FBQztBQUVELDJCQUEyQixNQUF5QjtJQUNoRCxJQUFJLENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7WUFDakIsU0FBRyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsR0FBRyxpQ0FBaUIsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN2RixJQUFJLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO1FBQzNCLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQ3RCLEtBQUssaUNBQWlCLENBQUMsUUFBUTtnQkFDM0IsYUFBYSxHQUFHLEtBQUssQ0FBQztnQkFDdEIsbUJBQW1CLENBQUMsYUFBYSxFQUFFLFVBQVUsRUFBRSxRQUFRLENBQUEscUNBQXFDLENBQUMsQ0FBQztnQkFDOUYsS0FBSyxDQUFDO1lBQ1YsS0FBSyxpQ0FBaUIsQ0FBQyxtQkFBbUI7Z0JBQ3RDLElBQUksZUFBZSxHQUFHLGVBQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLENBQUMsS0FBSyxJQUFJLENBQUM7Z0JBQ3ZFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7b0JBQ25CLG1CQUFtQixDQUFDLGFBQWEsRUFBRSxnQkFBZ0IsRUFBRSxRQUFRLENBQUMsQ0FBQztvQkFDL0QsbUJBQW1CLENBQUMsaUJBQWlCLEVBQUUsZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsZUFBZSxDQUFDLENBQUM7Z0JBQy9GLENBQUM7Z0JBQ0QsSUFBSSxDQUFDLENBQUM7b0JBQ0YsbUJBQW1CLENBQUMsYUFBYSxFQUFFLGFBQWEsTUFBTSxDQUFDLFFBQVEsSUFBSSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsRUFBRSxRQUFRLENBQUMsQ0FBQztvQkFDbEgsbUJBQW1CLENBQUMsaUJBQWlCLEVBQUUsZUFBZSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLGVBQWUsQ0FBQyxDQUFDO2dCQUM3RyxDQUFDO2dCQUNELFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDbkIsS0FBSyxDQUFDO1lBQ1YsS0FBSyxpQ0FBaUIsQ0FBQyxjQUFjO2dCQUNqQyxtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsa0JBQWtCLE1BQU0sQ0FBQyxRQUFRLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDbkYsS0FBSyxDQUFDO1lBQ1YsS0FBSyxpQ0FBaUIsQ0FBQyxLQUFLO2dCQUN4QixTQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUMsS0FBSyxHQUFHLE9BQU8sR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzNELG1CQUFtQixDQUFDLGFBQWEsRUFBRSxRQUFRLE1BQU0sQ0FBQyxRQUFRLFdBQVcsTUFBTSxDQUFDLEtBQUssRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ2xHLEtBQUssaUNBQWlCLENBQUMsS0FBSztnQkFDeEIsaUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3pCLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFFbkIsK0JBQWMsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUk7b0JBQ2xDLElBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO2dCQUMzQixDQUFDLENBQUMsQ0FBQztnQkFFSCxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7b0JBQ2hDLG1CQUFtQixDQUFDLGFBQWEsRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQ3pELENBQUM7Z0JBQ0QsSUFBSSxDQUFDLENBQUM7b0JBQ0YsSUFBSSxHQUFHLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUV2Qyx1SEFBdUg7b0JBQ3ZILCtCQUFjLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUMsQ0FBQztvQkFDbkUsK0JBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQztvQkFDbkUsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSx1QkFBTyxDQUFDLE9BQU8sSUFBSSxNQUFNLENBQUMsT0FBTyxJQUFJLHVCQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQzt3QkFDdkUsK0JBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO29CQUM5RCxDQUFDO29CQUVELDZGQUE2RjtvQkFDN0YsSUFBSSxHQUFHLEdBQVcsRUFBRSxDQUFDO29CQUNyQixNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQzt3QkFDckIsS0FBSyx1QkFBTyxDQUFDLE9BQU87NEJBQ2hCLEdBQUcsR0FBRyx5QkFBeUIsTUFBTSxDQUFDLFFBQVEsT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDOzRCQUN0RixTQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSx3QkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDOzRCQUMvQixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsV0FBVyxHQUFHLEdBQUcsRUFBRSxZQUFZLENBQUMsQ0FBQzs0QkFDcEUsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDO2dDQUFDLFNBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7NEJBQzVDLGtCQUFrQjs0QkFDbEIsSUFBSSxhQUFhLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxlQUFlLENBQUMsQ0FBQyxDQUFDOzRCQUNuRyxJQUFJLGFBQWEsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsU0FBUyxFQUFFLHdCQUF3QixDQUFDLENBQUMsQ0FBQTs0QkFDM0csRUFBRSxDQUFDLENBQUMsZUFBTSxDQUFDLGdCQUFnQixDQUFDLGtCQUFrQixDQUFDLEtBQUssSUFBSSxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dDQUN2RixJQUFJLFNBQVMsR0FBRywrQkFBYyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dDQUMxRCxTQUFTLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsYUFBYSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7NEJBQ25GLENBQUM7NEJBQ0QsS0FBSyxDQUFDO3dCQUNWLEtBQUssdUJBQU8sQ0FBQyxhQUFhOzRCQUN0QixHQUFHLEdBQUcsV0FBVyxNQUFNLENBQUMsUUFBUSxpQkFBaUIsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQzs0QkFDbEYsU0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsd0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQzs0QkFDL0IsbUJBQW1CLENBQUMsYUFBYSxFQUFFLE9BQU8sR0FBRyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7NEJBQ3pELEtBQUssQ0FBQzt3QkFDVixLQUFLLHVCQUFPLENBQUMsa0JBQWtCOzRCQUMzQixHQUFHLEdBQUcsaUJBQWlCLE1BQU0sQ0FBQyxRQUFRLGlCQUFpQixNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsaUJBQWlCLE1BQU0sQ0FBQyxTQUFTLFNBQVMsTUFBTSxDQUFDLFNBQVMsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLEVBQUUsRUFBRSxDQUFDOzRCQUMxSixTQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSx3QkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDOzRCQUMvQixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsT0FBTyxHQUFHLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQzs0QkFDekQsS0FBSyxDQUFDO3dCQUNWLEtBQUssdUJBQU8sQ0FBQyxrQkFBa0I7NEJBQzNCLEdBQUcsR0FBRyxhQUFhLE1BQU0sQ0FBQyxRQUFRLGlCQUFpQixNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsaUJBQWlCLE1BQU0sQ0FBQyxTQUFTLFNBQVMsTUFBTSxDQUFDLFNBQVMsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLEVBQUUsRUFBRSxDQUFDOzRCQUN0SixTQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSx3QkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDOzRCQUMvQixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsT0FBTyxHQUFHLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQzs0QkFDekQsS0FBSyxDQUFDO3dCQUNWLEtBQUssdUJBQU8sQ0FBQyxPQUFPOzRCQUNoQixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsc0JBQXNCLEVBQUUsUUFBUSxDQUFDLENBQUM7NEJBQ3JFLFNBQUcsQ0FBQyxHQUFHLENBQUMsYUFBYSxNQUFNLENBQUMsUUFBUSxjQUFjLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQzs0QkFDbkUsS0FBSyxDQUFDO3dCQUNWLEtBQUssdUJBQU8sQ0FBQyxLQUFLOzRCQUNkLElBQUksUUFBUSxHQUFHLDBDQUEwQyxDQUFBOzRCQUN6RCxtQkFBbUIsQ0FBQyxhQUFhLEVBQUUscUJBQXFCLEdBQUcsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDOzRCQUM1RSxHQUFHLEdBQUcsYUFBYSxNQUFNLENBQUMsUUFBUSxrQ0FBa0MsQ0FBQzs0QkFDckUsU0FBRyxDQUFDLEdBQUcsQ0FBQyxvQ0FBb0MsTUFBTSxDQUFDLFFBQVEsWUFBWSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEdBQUcsTUFBTSxDQUFDLEtBQUssR0FBRywrRUFBK0UsQ0FBQyxDQUFDLENBQUM7NEJBQ3ROLFNBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHLFFBQVEsQ0FBQyxDQUFDOzRCQUN6QixLQUFLLENBQUM7b0JBQ2QsQ0FBQztnQkFDTCxDQUFDO2dCQUNELEtBQUssQ0FBQztZQUNWLEtBQUssaUNBQWlCLENBQUMsUUFBUTtnQkFDM0IsbUJBQW1CLENBQUMsYUFBYSxFQUFFLFdBQVcsRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFDMUQsS0FBSyxDQUFDO1lBQ1YsS0FBSyxpQ0FBaUIsQ0FBQyxPQUFPO2dCQUMxQixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUN2RCxLQUFLLENBQUM7WUFDVjtnQkFDSSxLQUFLLENBQUM7UUFDZCxDQUFDO0lBQ0wsQ0FBRTtJQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLCtCQUErQixHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ25ELENBQUM7QUFDTCxDQUFDO0FBRUQsK0JBQStCLElBQUk7SUFDL0IsU0FBRyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsRUFBRSx3QkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3ZELGFBQWEsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO0lBQzVCLGFBQWEsQ0FBQyxJQUFJLEdBQUcsa0JBQWtCLENBQUM7SUFFeEMsSUFBSSxrQkFBa0IsR0FBdUIsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQztJQUM3RSxJQUFJLHVCQUF1QixHQUF1QixFQUFFLEtBQUssRUFBRSx5QkFBeUIsRUFBRSxDQUFDO0lBRXZGLE1BQU0sQ0FBQyxNQUFNLENBQUMsc0JBQXNCLENBQUMsMkJBQTJCLEdBQUcsSUFBSSxFQUFFLGtCQUFrQixFQUFFLHVCQUF1QixDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTTtRQUM5SCxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFFZCxDQUFDO1FBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEtBQUssdUJBQXVCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN4RCxJQUFJLENBQUM7Z0JBQ0QsSUFBSSxRQUFRLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUM7Z0JBQ3pDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDWixTQUFHLENBQUMsSUFBSSxDQUFDLHFFQUFxRSxDQUFDLENBQUE7b0JBQy9FLE1BQU0sQ0FBQztnQkFDWCxDQUFDO2dCQUNELG1CQUFtQjtnQkFDbkIsSUFBSSxxQkFBcUIsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsZUFBZSxDQUFDLENBQUM7Z0JBQzVFLFNBQUcsQ0FBQyxHQUFHLENBQUMscUJBQXFCLEdBQUcscUJBQXFCLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDdkUsZUFBTSxDQUFDLGtCQUFrQixDQUFDLHFCQUFxQixDQUFDLENBQUM7Z0JBQ2pELGVBQU0sQ0FBQyxRQUFRLENBQUMscUJBQXFCLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNsRSxDQUFFO1lBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLHNDQUFzQyxHQUFHLENBQUMsQ0FBQyxDQUFBO1lBQ3pELENBQUM7UUFDTCxDQUFDO1FBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEtBQUssa0JBQWtCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNuRCxJQUFJLENBQUM7Z0JBQ0QsZUFBZTtnQkFDZixJQUFJLFlBQVksR0FBRyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDNUMsU0FBRyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsR0FBRyxZQUFZLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDekQsZUFBTSxDQUFDLGtCQUFrQixDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUN4QyxlQUFNLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3pELENBQUU7WUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsaUNBQWlDLEdBQUcsQ0FBQyxDQUFDLENBQUE7WUFDcEQsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNQLENBQUM7QUFFRDtJQUVJLEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsV0FBVyxFQUFFLENBQUMsTUFBeUIsS0FBSyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQzVHLEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsZUFBZSxFQUFFLENBQUMsSUFBSSxLQUFLLHFCQUFxQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDN0YsS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFZO1FBQ3BELFNBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbkIsQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQXlDO1FBQ2hGLFNBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxTQUFHLENBQUMsUUFBUSxJQUFJLHdCQUFRLENBQUMsS0FBSyxHQUFHLEtBQUssR0FBRyxFQUFFLENBQUMsR0FBRyxHQUFHLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNwRixDQUFDLENBQUMsQ0FBQztJQUNILEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsU0FBUyxFQUFFLENBQUMsR0FBeUM7UUFDdEYsU0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFNBQUcsQ0FBQyxRQUFRLElBQUksd0JBQVEsQ0FBQyxLQUFLLEdBQUcsS0FBSyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzFGLENBQUMsQ0FBQyxDQUFDO0lBQ0gsS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxHQUF5QztRQUNsRixTQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsU0FBRyxDQUFDLFFBQVEsSUFBSSx3QkFBUSxDQUFDLEtBQUssR0FBRyxLQUFLLEdBQUcsRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDdEYsQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLGFBQWEsRUFBRSxDQUFDLFVBQWtCO1FBQ25FLElBQUksQ0FBQztZQUNELG1CQUFtQixDQUFDLGdCQUFnQixFQUFFLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUMzRCxFQUFFLENBQUMsQ0FBQywrQkFBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7Z0JBQzVCLCtCQUFjLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLE9BQU8sR0FBRyx1QkFBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzNFLENBQUM7UUFDTCxDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsaUNBQWlDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDckQsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0gsS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxHQUFXO1FBQ3pELElBQUksQ0FBQztZQUNELElBQUksU0FBUyxHQUFlLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2xELFNBQUcsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN6RSxFQUFFLENBQUMsQ0FBQyxDQUFDLCtCQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RDLCtCQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsSUFBSSwrQkFBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDdEUsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLElBQUksU0FBUyxHQUFHLCtCQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDbkQsU0FBUyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7Z0JBQ3RCLFNBQVMsQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO1lBQ2hDLENBQUM7WUFDRCxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZGLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQywyQ0FBMkMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUMvRCxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLFVBQVUsRUFBRSxDQUFDLEdBQVc7UUFDekQsSUFBSSxDQUFDO1lBQ0QsSUFBSSxTQUFTLEdBQWUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbEQsU0FBRyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN4RSxJQUFJLFNBQVMsR0FBRywrQkFBYyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbkQsU0FBUyxDQUFDLElBQUksR0FBRyxLQUFLLENBQUM7WUFDdkIsU0FBUyxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7WUFDM0IsRUFBRSxDQUFDLENBQUMsb0JBQW9CLENBQUMsUUFBUSxFQUFFLElBQUksU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDMUQsb0JBQW9CLEdBQUcsSUFBSSxDQUFDO1lBQ2hDLENBQUM7WUFDRCxTQUFTLENBQUMsZUFBZSxDQUFDLG9DQUFvQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDOUUsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLDJDQUEyQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQy9ELENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUNILEtBQUssQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLHdCQUFRLENBQUMsU0FBUyxFQUFFLENBQUMsR0FBVztRQUNuRCxJQUFJLFNBQVMsR0FBZSxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsRCxJQUFJLHVCQUF1QixHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUM7UUFDL0MsTUFBTSxDQUFDLHVCQUF1QixDQUFDO0lBQ25DLENBQUMsQ0FBQyxDQUFDO0lBQ0gsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsd0JBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxJQUFZO1FBQ3BELElBQUksU0FBUyxHQUFRLGVBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEMsSUFBSSxzQkFBc0IsR0FBRyxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDbEQsTUFBTSxDQUFDLHNCQUFzQixDQUFDO0lBQ2xDLENBQUMsQ0FBQyxDQUFDO0lBQ0gsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMscUJBQXFCLENBQUMsQ0FBQyxNQUFNO1FBQzNFLElBQUksQ0FBQztZQUNELFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDNUQsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLGlDQUFpQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3JELENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0osS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsd0JBQXdCLENBQUM7UUFDdkUsSUFBSSxDQUFDO1lBQ0QsU0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3pCLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUMzRCxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVKLEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsWUFBWSxFQUFFLENBQUMsTUFBMEI7UUFDMUUsOEJBQThCLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDM0MsQ0FBQyxDQUFDLENBQUM7SUFFSCxvQkFBb0I7SUFDcEIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyx3QkFBd0IsRUFBRSxNQUFNO1FBQ2pFLElBQUksQ0FBQztZQUNELElBQUksVUFBVSxHQUFtQyxNQUFNLENBQUM7WUFDeEQsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO2dCQUNkLFNBQUcsQ0FBQyxLQUFLLENBQUMsNkNBQTZDLENBQUMsQ0FBQztZQUM3RCxDQUFDO1lBQ0QsSUFBSSxVQUFVLEdBQUcsK0JBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxlQUFlLENBQUM7WUFDL0UsVUFBVSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMxQyxDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsMkRBQTJELEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDL0UsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0gsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsd0JBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxTQUFvQjtRQUM1RCxJQUFJLENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxlQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUN2RCxJQUFJLFVBQVUsR0FBRywrQkFBYyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLGVBQWUsQ0FBQztnQkFDbEYsSUFBSSxLQUFLLEdBQUcsVUFBVSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDMUQsRUFBRSxDQUFDLENBQUMsZUFBTSxDQUFDLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2pELGFBQWE7b0JBQ2IsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7d0JBQ3JCLHlCQUF5Qjt3QkFDekIsVUFBVSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQzt3QkFDM0MsVUFBVSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQzdGLENBQUM7b0JBQUMsSUFBSSxDQUFDLENBQUM7d0JBQ0osNkJBQTZCO3dCQUM3QixVQUFVLENBQUMsaUJBQWlCLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO3dCQUMzQyxJQUFJLFNBQVMsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDL0MsVUFBVSxDQUFDLGFBQWEsR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDO3dCQUMzQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRSxTQUFTLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQztvQkFDN0YsQ0FBQztnQkFDTCxDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNKLGVBQWU7b0JBQ2YsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLEtBQUssSUFBSSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQzt3QkFDOUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUM7d0JBQ2xFLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUM3RixDQUFDO2dCQUNMLENBQUM7WUFDTCxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osU0FBRyxDQUFDLEdBQUcsQ0FBQyxrRkFBa0YsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2hILENBQUM7UUFDTCxDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsOEJBQThCLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDbEQsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0gsTUFBTSxDQUFDLE1BQU0sQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLE1BQU07UUFDaEQsSUFBSSxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQzlCLFNBQUcsQ0FBQyxLQUFLLENBQUMseURBQXlELENBQUMsQ0FBQztnQkFDckUsTUFBTSxDQUFDO1lBQ1gsQ0FBQztZQUNELElBQUksR0FBRyxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNwRCxJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUM7WUFDOUMsSUFBSSxTQUFTLEdBQUcsK0JBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ25ELEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQ1osU0FBUyxDQUFDLGVBQWUsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN4RCxDQUFDO1FBQ0wsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLCtDQUErQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ25FLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUNILEtBQUssQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLHdCQUFRLENBQUMsYUFBYSxFQUFFLE1BQU07UUFDakQsSUFBSSxDQUFDO1lBQ0QsSUFBSSxVQUFVLEdBQXFELE1BQU0sQ0FBQztZQUMxRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7Z0JBQ2QsU0FBRyxDQUFDLEtBQUssQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO1lBQzFELENBQUM7WUFDRCxJQUFJLFVBQVUsR0FBRywrQkFBYyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLGVBQWUsQ0FBQztZQUMvRSxVQUFVLENBQUMsa0JBQWtCLENBQUMsRUFBRSxJQUFJLEVBQUUsVUFBVSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsVUFBVSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDOUYsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLHlDQUF5QyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzdELENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsc0JBQXNCLEVBQUUsR0FBRztRQUM1RCxJQUFJLENBQUM7WUFDRCxTQUFHLENBQUMsR0FBRyxDQUFDLCtCQUErQixHQUFHLElBQUksQ0FBQyxRQUFRLENBQVMsR0FBRyxDQUFDLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN0Rix1REFBdUQ7WUFDdkQsSUFBSSxTQUFTLEdBQUcsK0JBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFTLEdBQUcsQ0FBQyxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDakYsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLG1EQUFtRCxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3ZFLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsYUFBYSxFQUFFO1FBQ2hELElBQUksQ0FBQztZQUNELFNBQUcsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN6QyxJQUFJLFVBQVUsR0FBRywrQkFBYyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxlQUFlLENBQUM7WUFDaEcsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ3RDLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyx5Q0FBeUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUM3RCxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUE7SUFFRixrQkFBa0I7SUFDbEIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLGtCQUFrQixFQUFFO1FBQ2pGLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFDeEgsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVKLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyx5QkFBeUIsRUFBRTtRQUN4RixJQUFJLENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNoQixTQUFHLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUM7WUFDekMsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLEtBQUssQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUFRLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBc0I7b0JBQ3JGLEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDMUIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLGVBQWU7NEJBQzFELEVBQUUsQ0FBQyxDQUFDLGVBQWUsSUFBSSxlQUFlLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0NBQ2hELFlBQVksQ0FBQyxlQUFlLENBQUMsQ0FBQzs0QkFDbEMsQ0FBQzs0QkFBQyxJQUFJLENBQUMsQ0FBQztnQ0FDSixTQUFHLENBQUMsR0FBRyxDQUFDLG1EQUFtRCxDQUFDLENBQUM7NEJBRWpFLENBQUM7d0JBQ0wsQ0FBQyxDQUFDLENBQUM7b0JBQ1AsQ0FBQztvQkFBQyxJQUFJLENBQUMsQ0FBQzt3QkFDSixTQUFHLENBQUMsR0FBRyxDQUFDLHVEQUF1RCxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7d0JBQ2pGLFlBQVksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDbEMsQ0FBQztnQkFDTCxDQUFDLEVBQUUsQ0FBQyxNQUFNO29CQUNOLFNBQUcsQ0FBQyxLQUFLLENBQUMsK0NBQStDLEdBQUcsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0JBQ25GLENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztRQUNMLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUMvQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNKLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQywwQkFBMEIsRUFBRTtRQUN6RixJQUFJLENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxlQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUN2RCxFQUFFLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztvQkFDeEIsU0FBRyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUM1RCxNQUFNLENBQUM7Z0JBQ1gsQ0FBQztnQkFDRCxJQUFJLEdBQUcsR0FBRyxvQkFBb0IsQ0FBQztnQkFDL0IsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztnQkFDN0MsRUFBRSxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsY0FBYyxHQUFHLFFBQVEsR0FBRyxJQUFJLENBQUMsQ0FBQztvQkFBQyxNQUFNLENBQUM7Z0JBRTlELElBQUksU0FBUyxHQUFHLCtCQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztnQkFDOUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDcEMsU0FBRyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEdBQUcsUUFBUSxHQUFHLHdCQUF3QixFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQzlFLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLGlCQUFpQixFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7b0JBQzdFLE1BQU0sQ0FBQztnQkFDWCxDQUFDO2dCQUNELEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO29CQUMxQyxTQUFHLENBQUMsSUFBSSxDQUFDLGNBQWMsR0FBRyxRQUFRLEdBQUcsdUNBQXVDLENBQUMsQ0FBQztvQkFDOUUsTUFBTSxDQUFDO2dCQUNYLENBQUM7Z0JBRUQsRUFBRSxDQUFDLENBQUMsZUFBTSxDQUFDLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2pELEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFBLENBQUM7d0JBQ2xGLFNBQUcsQ0FBQyxJQUFJLENBQUMsNkRBQTZELENBQUMsQ0FBQzt3QkFDeEUsTUFBTSxDQUFDO29CQUNYLENBQUM7Z0JBQ0wsQ0FBQztnQkFFRCxJQUFJLE9BQU8sR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDO2dCQUN2QixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDZCxPQUFPLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNuRCxDQUFDO2dCQUNELElBQUksWUFBWSxHQUFHO29CQUNmLElBQUksRUFBRSxhQUFhO29CQUNuQixJQUFJLEVBQUUsT0FBTztvQkFDYixPQUFPLEVBQUUsUUFBUTtvQkFDakIsT0FBTyxFQUFFLE9BQU87b0JBQ2hCLFlBQVksRUFBRSxDQUFDO2lCQUNsQixDQUFBO2dCQUNELEVBQUUsQ0FBQyxDQUFDLCtCQUFjLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztvQkFDN0IsU0FBRyxDQUFDLElBQUksQ0FBQyxjQUFjLEdBQUcsUUFBUSxHQUFHLHNDQUFzQyxDQUFDLENBQUM7b0JBQzdFLE1BQU0sQ0FBQztnQkFDWCxDQUFDO2dCQUNELFVBQVUsQ0FBQztvQkFDUCxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxtQkFBbUIsRUFBRSxZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUM7d0JBQ25FLFNBQUcsQ0FBQyxHQUFHLENBQUMsb0NBQW9DLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQzt3QkFDN0QsK0JBQWMsQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO29CQUN0QyxDQUFDLEVBQUUsR0FBRzt3QkFDRixTQUFHLENBQUMsS0FBSyxDQUFDLDJCQUEyQixHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFDekQsQ0FBQyxDQUFDLENBQUM7Z0JBQ1AsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osU0FBRyxDQUFDLElBQUksQ0FBQyxnRUFBZ0UsQ0FBQyxDQUFBO1lBQzlFLENBQUM7UUFDTCxDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsZ0NBQWdDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDcEQsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDSixLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsNEJBQTRCLEVBQUU7UUFDM0YsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDZixTQUFHLENBQUMsR0FBRyxDQUFDLDJCQUEyQixFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDckQsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ25CLGFBQWEsQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDO1lBQy9CLGFBQWEsQ0FBQyxJQUFJLEdBQUcsVUFBVSxDQUFDO1lBQ2hDLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3pCLEtBQUssQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxvQkFBb0IsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQzlGLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLFNBQUcsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsQ0FBQztRQUN6QyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNKLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxrQkFBa0IsRUFBRTtRQUNqRixJQUFJLENBQUM7WUFDRCxTQUFTLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDOUIsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3hELENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ1IsQ0FBQztBQUVELHNCQUFzQixXQUFtQjtJQUNyQyxJQUFJLENBQUM7UUFDRCxhQUFhLEdBQUcsS0FBSyxDQUFDO1FBQ3RCLEtBQUssQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxZQUFZLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDdEUsQ0FBRTtJQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLDBCQUEwQixHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzlDLENBQUM7QUFDTCxDQUFDO0FBRUQsd0NBQXdDLE1BQTBCO0lBQzlELElBQUksQ0FBQztRQUNELGFBQWEsR0FBRyxJQUFJLENBQUM7UUFDckIsU0FBRyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDeEQsbUJBQW1CLENBQUMsYUFBYSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUNyRCw4Q0FBOEM7UUFDOUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDbkIsc0JBQXNCO1lBQ3RCLGVBQWUsRUFBRSxDQUFBO1lBQ2pCLEVBQUUsQ0FBQyxDQUFDLG9CQUFvQixJQUFJLGVBQU0sQ0FBQyxnQkFBZ0IsQ0FBQyw4QkFBOEIsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQzNGLFNBQUcsQ0FBQyxHQUFHLENBQUMsaUNBQWlDLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDMUQsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxvQkFBb0IsRUFBRSxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1lBQ2xHLENBQUM7UUFDTCxDQUFDO0lBQ0wsQ0FBRTtJQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLCtDQUErQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ25FLENBQUM7QUFDTCxDQUFDO0FBRUQ7SUFDSSxTQUFHLENBQUMsR0FBRyxDQUFDLHdDQUF3QyxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbEUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQzFELENBQUM7QUFFRCxvQkFBb0IsUUFBUTtJQUN4QixJQUFJLENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQyxDQUFDLGlDQUFlLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUM5QixpQ0FBZSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7WUFDbEMsSUFBSSxVQUFVLEdBQUcsK0JBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsZUFBZSxDQUFDO1lBQ2hHLFVBQVUsQ0FBQyx1QkFBdUIsQ0FBQztnQkFDL0IsVUFBVSxDQUFDLHVDQUF1QyxDQUFDO29CQUMvQyxVQUFVLENBQUMsZUFBZSxFQUFFLENBQUM7b0JBQzdCLFFBQVEsRUFBRSxDQUFDO2dCQUNmLENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixTQUFHLENBQUMsR0FBRyxDQUFDLDJDQUEyQyxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDekUsQ0FBQztJQUNMLENBQUU7SUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUM1QyxDQUFDO0FBQ0wsQ0FBQztBQUVELG9CQUFvQixRQUFRLEVBQUUsVUFBMkI7SUFDckQsSUFBSSxDQUFDO1FBQ0QsTUFBTSxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsd0NBQXdDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxNQUFNLENBQUMsRUFBRSxLQUFLO1lBQy9GLFNBQUcsQ0FBQyxLQUFLLENBQUMsbURBQW1ELENBQUMsQ0FBQztRQUNuRSxDQUFDLENBQUMsQ0FBQztRQUNILCtCQUFjLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztRQUNuQyxTQUFHLENBQUMsR0FBRyxDQUFDLGtCQUFrQixHQUFHLFVBQVUsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6RSxpQ0FBZSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7UUFDbkMsVUFBVSxDQUFDLHVCQUF1QixDQUFDO1lBQy9CLFVBQVUsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUM3QixVQUFVLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDbkIsUUFBUSxFQUFFLENBQUM7UUFDZixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUU7SUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUMzQyxDQUFDO0FBQ0wsQ0FBQztBQUVELGdCQUFnQixTQUF5QixFQUFFLGlCQUEwQjtJQUNqRSxJQUFJLEdBQUcsR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ25DLEVBQUUsQ0FBQyxDQUFDLGVBQU0sQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDaEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNoQixTQUFHLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFDekMsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osSUFBSSxVQUFVLEdBQUcsK0JBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLGVBQWUsQ0FBQztZQUNwRSxVQUFVLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDM0IsVUFBVSxDQUFDO2dCQUNQLHVCQUF1QjtnQkFDdkIsU0FBRyxDQUFDLFVBQVUsQ0FBQyxTQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQztnQkFFdEMsa0JBQWtCO2dCQUNsQixTQUFTLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQztnQkFDMUIsU0FBUyxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7Z0JBQzNCLFNBQVMsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO2dCQUUzQixJQUFJLFNBQVMsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLFFBQVEsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzNHLEtBQUssQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxNQUFNLEVBQUUsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQzdILENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUNuQixDQUFDO0lBQ0wsQ0FBQztBQUNMLENBQUM7QUFFRCx5QkFBeUIsUUFBZ0I7SUFDckMsSUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDO0lBQ2IsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxRQUFRLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDckMsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUM7SUFDcEIsQ0FBQztJQUNELEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsUUFBUSxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ3RDLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDO0lBQ3BCLENBQUM7SUFDRCxNQUFNLENBQUMsR0FBRyxDQUFDO0FBQ2YsQ0FBQyJ9