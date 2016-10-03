'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const fs = require('fs');
const path = require('path');
const Timer_1 = require('./Timer');
const vscode = require('vscode');
const ExtensionState_1 = require('./ExtensionState');
const ViperProtocol_1 = require('./ViperProtocol');
const index_1 = require('vscode-uri/lib/index');
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
let formatter;
let workList;
let verifiedFile;
let _backendReady = false;
let lastActiveTextEditor;
//for timing:
let verificationStartTime;
let timings;
let oldTimings;
let progressUpdater;
let lastProgress;
let progressLabel = "";
var TaskType;
(function (TaskType) {
    TaskType[TaskType["Save"] = 0] = "Save";
    TaskType[TaskType["Verify"] = 1] = "Verify";
    TaskType[TaskType["NoOp"] = 2] = "NoOp";
})(TaskType || (TaskType = {}));
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    lastVersionWithSettingsChange = "0.2.15"; //null means latest version
    workList = [];
    ExtensionState_1.ExtensionState.viperFiles = new Map();
    Log_1.Log.initialize();
    Log_1.Log.log('Viper-Client is now active!', ViperProtocol_1.LogLevel.Info);
    state = ExtensionState_1.ExtensionState.createExtensionState();
    ExtensionState_1.ExtensionState.checkOperatingSystem();
    context.subscriptions.push(state);
    fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/*.sil, **/*.vpr');
    state.startLanguageServer(context, fileSystemWatcher, false); //break?
    registerHandlers();
    startAutoSaver();
    initializeStatusBar();
    registerFormatter();
    let uri = vscode.window.activeTextEditor.document.uri;
    lastActiveTextEditor = Helper_1.Helper.isViperSourceFile(uri.toString()) ? uri : null;
    startVerificationController();
}
exports.activate = activate;
let lastVersionWithSettingsChange;
function getRequiredVersion() {
    try {
        if (lastVersionWithSettingsChange)
            return lastVersionWithSettingsChange;
        else {
            //TODO: is this still the name of the extension?
            return vscode.extensions.getExtension("rukaelin.viper-advanced").packageJSON.version;
        }
    }
    catch (e) {
        Log_1.Log.error("Error checking settings version: " + e);
        return null;
    }
}
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
                            if (!task.manuallyTriggered && !autoVerify) {
                                Log_1.Log.log(dontVerify + "autoVerify is disabled.", ViperProtocol_1.LogLevel.Debug);
                            }
                            if (!fileState.open) {
                                Log_1.Log.log(dontVerify + "file is closed", ViperProtocol_1.LogLevel.Debug);
                            }
                            else if (fileState.verifying) {
                                Log_1.Log.log(dontVerify + `file is verifying`, ViperProtocol_1.LogLevel.Debug);
                            }
                            else if (!task.manuallyTriggered && fileState.verified) {
                                Log_1.Log.log(dontVerify + `not manuallyTriggered and file is verified`, ViperProtocol_1.LogLevel.Debug);
                            }
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
                            fileState.verified = false;
                            stopDebuggingOnServer();
                            stopDebuggingLocally();
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
                        //if the active editor changed, remove special characters from the previous one
                        if (lastActiveTextEditor.toString() !== uri.toString()) {
                            let oldFileState = ExtensionState_1.ExtensionState.viperFiles.get(lastActiveTextEditor.toString());
                            if (oldFileState) {
                                oldFileState.decorationsShown = false;
                                oldFileState.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
                                stopDebuggingOnServer();
                                stopDebuggingLocally();
                            }
                        }
                    }
                    let fileState = ExtensionState_1.ExtensionState.viperFiles.get(uri.toString());
                    if (fileState) {
                        fileState.setEditor(editor);
                        if (!fileState.verified) {
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
    console.log("deactivate");
    state.dispose();
    console.log("state disposed");
    //TODO: make sure no doc contains special chars any more
    console.log("Removing special chars of last opened file.");
    let oldFileState = ExtensionState_1.ExtensionState.viperFiles.get(lastActiveTextEditor.toString());
    oldFileState.stateVisualizer.removeSpecialCharacters(() => {
        console.log("deactivated");
    });
    console.log("Close Log");
    Log_1.Log.dispose();
    console.log("Deactivated");
}
exports.deactivate = deactivate;
function registerFormatter() {
    formatter = new ViperFormatter_1.ViperFormatter();
}
function initializeStatusBar() {
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
let autoVerify = true;
function toggleAutoVerify() {
    autoVerify = !autoVerify;
    if (autoVerify) {
        statusBarItem.color = 'white';
        statusBarItem.text = "Auto Verify is " + (autoVerify ? "on" : "off");
    }
}
function startAutoSaver() {
    let autoSaveTimeout = 1000; //ms
    autoSaver = new Timer_1.Timer(() => {
        //only save viper files
        if (vscode.window.activeTextEditor != null && vscode.window.activeTextEditor.document.languageId == 'viper') {
            if (Helper_1.Helper.getConfiguration('preferences').autoSave === true) {
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
                updateStatusBarItem(statusBarItem, 'starting', 'orange');
                break;
            case ViperProtocol_1.VerificationState.VerificationRunning:
                progressLabel = `verifying ${params.filename}:`;
                addTiming(params.progress, 'orange');
                abortButton.show();
                break;
            case ViperProtocol_1.VerificationState.PostProcessing:
                progressLabel = `postprocessing ${params.filename}:`;
                addTiming(params.progress, 'white');
                break;
            case ViperProtocol_1.VerificationState.Stage:
                Log_1.Log.log("Run " + params.stage + " for " + params.filename);
                updateStatusBarItem(statusBarItem, `File ${params.filename}: Stage ${params.stage}`, 'white');
            case ViperProtocol_1.VerificationState.Ready:
                statusBarProgress.hide();
                abortButton.hide();
                clearInterval(progressUpdater);
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
                    let verifiedFile = ExtensionState_1.ExtensionState.viperFiles.get(params.uri);
                    if (params.success != ViperProtocol_1.Success.Aborted && params.success != ViperProtocol_1.Success.Error) {
                        verifiedFile.verified = true;
                    }
                    //complete the timing measurement
                    addTiming(100, 'white', true);
                    if (Helper_1.Helper.getConfiguration("preferences").showProgress === true) {
                        verifiedFile.stateVisualizer.addTimingInformationToFile({ total: params.time, timings: timings });
                    }
                    //workList.push({ type: TaskType.VerificationCompleted, uri: uri, success: params.success });
                    let msg = "";
                    switch (params.success) {
                        case ViperProtocol_1.Success.Success:
                            msg = `Successfully verified ${params.filename} in ${formatSeconds(params.time)}`;
                            Log_1.Log.log(msg, ViperProtocol_1.LogLevel.Default);
                            updateStatusBarItem(statusBarItem, "$(check) " + msg, 'lightgreen');
                            if (params.manuallyTriggered)
                                Log_1.Log.hint(msg);
                            //for SymbexLogger
                            let symbexDotFile = Log_1.Log.getSymbExDotPath();
                            let symbexSvgFile = Log_1.Log.getSymbExSvgPath();
                            if (Helper_1.Helper.getConfiguration("advancedFeatures").enabled === true && fs.existsSync(symbexDotFile)) {
                                let fileState = ExtensionState_1.ExtensionState.viperFiles.get(params.uri);
                                fileState.stateVisualizer.generateSvg(symbexDotFile, symbexSvgFile, () => { });
                            }
                            break;
                        case ViperProtocol_1.Success.ParsingFailed:
                            msg = `Parsing ${params.filename} failed after ${formatSeconds(params.time)}`;
                            Log_1.Log.log(msg, ViperProtocol_1.LogLevel.Default);
                            updateStatusBarItem(statusBarItem, "$(x) " + msg, 'red');
                            break;
                        case ViperProtocol_1.Success.TypecheckingFailed:
                            msg = `Type checking ${params.filename} failed after ${formatSeconds(params.time)} with ${params.nofErrors} error${params.nofErrors == 1 ? "s" : ""}`;
                            Log_1.Log.log(msg, ViperProtocol_1.LogLevel.Default);
                            updateStatusBarItem(statusBarItem, "$(x) " + msg, 'red');
                            break;
                        case ViperProtocol_1.Success.VerificationFailed:
                            msg = `Verifying ${params.filename} failed after ${formatSeconds(params.time)} with ${params.nofErrors} error${params.nofErrors == 1 ? "s" : ""}`;
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
                clearInterval(progressUpdater);
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
function handleSettingsCheckResult(params) {
    if (params.errors && params.errors.length > 0) {
        let nofErrors = 0;
        let nofWarnings = 0;
        let message = "";
        params.errors.forEach(error => {
            switch (error.type) {
                case ViperProtocol_1.SettingsErrorType.Error:
                    nofErrors++;
                    Log_1.Log.error("Settings Error: " + error.msg, ViperProtocol_1.LogLevel.Default);
                    break;
                case ViperProtocol_1.SettingsErrorType.Warning:
                    nofWarnings++;
                    Log_1.Log.log("Settings Warning: " + error.msg);
                    break;
            }
            message = error.msg;
        });
        let errorCounts = ((nofErrors > 0 ? ("" + nofErrors + " Error" + (nofErrors > 1 ? "s" : "")) : "") + (nofWarnings > 0 ? (" " + nofWarnings + " Warning" + (nofWarnings > 1 ? "s" : "")) : "")).trim();
        //update status bar
        Log_1.Log.log(errorCounts + " in settings detected.", ViperProtocol_1.LogLevel.Default);
        statusBarItem.text = errorCounts + " in settings";
        if (nofErrors > 0) {
            statusBarItem.color = 'red';
        }
        else if (nofWarnings > 0) {
            statusBarItem.color = 'orange';
        }
        if (nofErrors + nofWarnings > 1)
            message = "see View->Output->Viper";
        let userSettingsButton = { title: "Open User Settings" };
        let workspaceSettingsButton = { title: "Open Workspace Settings" };
        vscode.window.showInformationMessage("Viper Settings: " + errorCounts + ": " + message, userSettingsButton, workspaceSettingsButton).then((choice) => {
            try {
                if (choice && choice.title === workspaceSettingsButton.title) {
                    vscode.commands.executeCommand("workbench.action.openWorkspaceSettings");
                }
                else if (choice && choice.title === userSettingsButton.title) {
                    vscode.commands.executeCommand("workbench.action.openGlobalSettings");
                }
            }
            catch (e) {
                Log_1.Log.error("Error accessing " + choice.title + " settings: " + e);
            }
        });
    }
}
function registerHandlers() {
    state.client.onNotification(ViperProtocol_1.Commands.StateChange, (params) => handleStateChange(params));
    state.client.onNotification(ViperProtocol_1.Commands.SettingsChecked, (data) => handleSettingsCheckResult(data));
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
            let uriObject = index_1.default.parse(uri);
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
    state.client.onRequest(ViperProtocol_1.Commands.RequestRequiredVersion, () => {
        return getRequiredVersion();
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
            stopDebuggingOnServer();
            stopDebuggingLocally();
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
            if (Helper_1.Helper.getConfiguration("advancedFeatures").enabled === true) {
                let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(heapGraph.fileUri).stateVisualizer;
                let state = visualizer.decorationOptions[heapGraph.state];
                if (Helper_1.Helper.getConfiguration("advancedFeatures").simpleMode === true) {
                    //Simple Mode
                    if (state.isErrorState) {
                        //replace the error state
                        visualizer.focusOnState(heapGraph);
                    }
                    else {
                        //replace the execution state
                        visualizer.setState(heapGraph, 1);
                    }
                }
                else {
                    //Advanced Mode
                    if (heapGraph.state != visualizer.previousState) {
                        visualizer.pushState(heapGraph);
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
    /*state.client.onRequest(Commands.StateSelected, change => {
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
    });*/
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
        stopDebuggingLocally();
    });
    //Command Handlers
    //verify
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.verify', () => {
        workList.push({ type: TaskType.Verify, uri: vscode.window.activeTextEditor.document.uri, manuallyTriggered: true });
    }));
    //toggleAutoVerify
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.toggleAutoVerify', () => {
        toggleAutoVerify();
    }));
    //selectBackend
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
    //start Debugging
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.startDebugging', () => {
        try {
            if (Helper_1.Helper.getConfiguration("advancedFeatures").enabled === true) {
                if (!lastActiveTextEditor) {
                    Log_1.Log.log("Don't debug, no viper file open.", ViperProtocol_1.LogLevel.Debug);
                    return;
                }
                let uri = lastActiveTextEditor;
                let filename = path.basename(uri.toString());
                let dontDebugString = "Don't debug " + filename + ", ";
                if (!isBackendReady(dontDebugString))
                    return;
                let fileState = ExtensionState_1.ExtensionState.viperFiles.get(uri.toString());
                if (!fileState || !fileState.verified) {
                    Log_1.Log.log(dontDebugString + "file is not verified", ViperProtocol_1.LogLevel.Debug);
                    workList.push({ type: TaskType.Verify, uri: uri, manuallyTriggered: false });
                    return;
                }
                if (!fileState.stateVisualizer.readyToDebug) {
                    Log_1.Log.hint(dontDebugString + "the verification provided no states");
                    return;
                }
                if (Helper_1.Helper.getConfiguration("advancedFeatures").simpleMode === true) {
                    if (!fileState.stateVisualizer.decorationOptions.some(option => option.isErrorState)) {
                        Log_1.Log.hint("Don't debug in simple mode, because there is no error state");
                        return;
                    }
                }
                let openDoc = uri.path;
                if (ExtensionState_1.ExtensionState.isWin) {
                    openDoc = openDoc.substring(1, openDoc.length);
                }
                let launchConfig = {
                    name: "Viper Debug",
                    type: "viper",
                    request: "launch",
                    program: openDoc,
                    startInState: 0,
                    externalConsole: true
                };
                if (ExtensionState_1.ExtensionState.isDebugging) {
                    Log_1.Log.hint("Don't debug " + filename + ", the file is already being debugged");
                    return;
                }
                showStates(() => {
                    vscode.commands.executeCommand('vscode.startDebug', launchConfig).then(() => {
                        Log_1.Log.log('Debug session started successfully', ViperProtocol_1.LogLevel.Info);
                        ExtensionState_1.ExtensionState.isDebugging = true;
                        vscode.commands.executeCommand("workbench.view.debug");
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
    //stopVerification
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.stopVerification', () => {
        if (state.client) {
            clearInterval(progressUpdater);
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
    //format
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.format', () => {
        try {
            formatter.formatOpenDoc();
        }
        catch (e) {
            Log_1.Log.error("Error handling formating request: " + e);
        }
    }));
    //open logFile
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.openLogFile', () => {
        try {
            Log_1.Log.log("Open logFile located at: " + Log_1.Log.logFilePath, ViperProtocol_1.LogLevel.Info);
            vscode.workspace.openTextDocument(Log_1.Log.logFilePath).then(textDocument => {
                vscode.window.showTextDocument(textDocument, vscode.ViewColumn.Two);
            });
        }
        catch (e) {
            Log_1.Log.error("Error opening log file: " + e);
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
            if (lastActiveTextEditor && Helper_1.Helper.getConfiguration('preferences').autoVerifyAfterBackendChange === true) {
                Log_1.Log.log("autoVerify after backend change", ViperProtocol_1.LogLevel.Info);
                workList.push({ type: TaskType.Verify, uri: lastActiveTextEditor, manuallyTriggered: false });
            }
        }
    }
    catch (e) {
        Log_1.Log.error("Error handling backend started notification: " + e);
    }
}
function stopDebuggingOnServer() {
    if (ExtensionState_1.ExtensionState.isDebugging) {
        Log_1.Log.log("Tell language server to stop debugging", ViperProtocol_1.LogLevel.Debug);
        state.client.sendNotification(ViperProtocol_1.Commands.StopDebugging);
    }
}
function stopDebuggingLocally() {
    try {
        if (ExtensionState_1.ExtensionState.isDebugging) {
            Log_1.Log.log("Stop Debugging", ViperProtocol_1.LogLevel.Info);
            let visualizer = ExtensionState_1.ExtensionState.viperFiles.get(lastActiveTextEditor.toString()).stateVisualizer;
            hideStates(() => { }, visualizer);
        }
    }
    catch (e) {
        Log_1.Log.error("Error handling stop debugging request: " + e);
    }
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
    //reset timing;
    verificationStartTime = Date.now();
    timings = [];
    //load expected timing
    let expectedTimings = fileState.stateVisualizer.getLastTiming();
    if (expectedTimings && expectedTimings.total) {
        Log_1.Log.log("Verification is expected to take " + formatSeconds(expectedTimings.total), ViperProtocol_1.LogLevel.Info);
        oldTimings = expectedTimings;
    }
    clearInterval(progressUpdater);
    progressUpdater = setInterval(() => {
        let progress = getProgress(lastProgress);
        if (progress != lastProgress) {
            Log_1.Log.log("Progress: " + progress, ViperProtocol_1.LogLevel.Debug);
            statusBarProgress.text = progressBarText(progress);
            statusBarItem.text = progressLabel + " " + formatProgress(progress);
        }
    }, 500);
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
                Log_1.Log.deleteFile(Log_1.Log.getSymbExLogPath());
                //change fileState
                fileState.changed = false;
                fileState.verified = false;
                fileState.verifying = true;
                let workspace = vscode.workspace.rootPath ? vscode.workspace.rootPath : path.dirname(fileState.uri.fsPath);
                let params = { uri: uri, manuallyTriggered: manuallyTriggered, workspace: workspace };
                state.client.sendNotification(ViperProtocol_1.Commands.Verify, params);
            }, visualizer);
        }
    }
}
function addTiming(paramProgress, color, hide = false) {
    let showProgressBar = Helper_1.Helper.getConfiguration('preferences').showProgress === true;
    timings.push(Date.now() - verificationStartTime);
    let progress = getProgress(paramProgress || 0);
    Log_1.Log.log("Progress: " + progress, ViperProtocol_1.LogLevel.Debug);
    lastProgress = progress;
    if (hide)
        statusBarProgress.hide();
    else {
        updateStatusBarItem(statusBarProgress, progressBarText(progress), 'white', null, showProgressBar);
        updateStatusBarItem(statusBarItem, progressLabel + " " + formatProgress(progress), color);
    }
}
function getProgress(progress) {
    try {
        let timeSpentUntilLastStep = timings[timings.length - 1];
        let timeAlreadySpent = Date.now() - verificationStartTime;
        if (oldTimings && oldTimings.timings) {
            let old = oldTimings.timings;
            if (old.length >= timings.length) {
                let timeSpentLastTime = old[timings.length - 1];
                let oldTotal = old[old.length - 1];
                let timeSpent = timeSpentUntilLastStep;
                if (old.length > timings.length && (timeAlreadySpent - timeSpentUntilLastStep) > (old[timings.length] - old[timings.length - 1])) {
                    //if this time we should already have completed the step, factor that in
                    timeSpentLastTime = old[timings.length];
                    timeSpent = timeAlreadySpent;
                }
                let leftToCompute = oldTotal - timeSpentLastTime;
                let estimatedTotal = timeSpent + leftToCompute;
                progress = 100 * Math.min((timeAlreadySpent / estimatedTotal), 1);
            }
            //don't show 100%, because otherwise people think it is done.
            if (progress > 99)
                progress = 99;
        }
        return progress;
    }
    catch (e) {
        Log_1.Log.error("Error computing progress: " + e);
    }
}
function progressBarText(progress) {
    progress = Math.floor(progress);
    let bar = "";
    for (var i = 0; i < progress / 10; i++) {
        bar = bar + "⚫";
    }
    for (var i = 10; i > progress / 10; i--) {
        bar = bar + "⚪";
    }
    return bar;
}
function formatSeconds(time) {
    return time.toFixed(1) + " seconds";
}
function formatProgress(progress) {
    if (!progress)
        return "0%";
    return progress.toFixed(0) + "%";
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2V4dGVuc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFDYiw2REFBNkQ7QUFDN0QsOEVBQThFO0FBRTlFLE1BQVksRUFBRSxXQUFNLElBQUksQ0FBQyxDQUFBO0FBQ3pCLE1BQVksSUFBSSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBQzdCLHdCQUFvQixTQUFTLENBQUMsQ0FBQTtBQUM5QixNQUFZLE1BQU0sV0FBTSxRQUFRLENBQUMsQ0FBQTtBQUNqQyxpQ0FBNkIsa0JBQWtCLENBQUMsQ0FBQTtBQUNoRCxnQ0FBbU4saUJBQWlCLENBQUMsQ0FBQTtBQUNyTyx3QkFBZ0Isc0JBQXNCLENBQUMsQ0FBQTtBQUN2QyxzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsa0NBQThCLG1CQUFtQixDQUFDLENBQUE7QUFDbEQseUJBQXFCLFVBQVUsQ0FBQyxDQUFBO0FBQ2hDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBRWhELElBQUksYUFBYSxDQUFDO0FBQ2xCLElBQUksaUJBQWlCLENBQUM7QUFDdEIsSUFBSSxnQkFBZ0IsQ0FBQztBQUNyQixJQUFJLFdBQVcsQ0FBQztBQUNoQixJQUFJLFNBQWdCLENBQUM7QUFDckIsSUFBSSxLQUFxQixDQUFDO0FBRTFCLElBQUksc0JBQTZCLENBQUM7QUFFbEMsSUFBSSxpQkFBMkMsQ0FBQztBQUVoRCxJQUFJLFNBQXlCLENBQUM7QUFFOUIsSUFBSSxRQUFnQixDQUFDO0FBRXJCLElBQUksWUFBb0IsQ0FBQztBQUN6QixJQUFJLGFBQWEsR0FBWSxLQUFLLENBQUM7QUFFbkMsSUFBSSxvQkFBZ0MsQ0FBQztBQUVyQyxhQUFhO0FBQ2IsSUFBSSxxQkFBNkIsQ0FBQztBQUNsQyxJQUFJLE9BQWlCLENBQUM7QUFDdEIsSUFBSSxVQUFzQixDQUFDO0FBQzNCLElBQUksZUFBZSxDQUFDO0FBQ3BCLElBQUksWUFBb0IsQ0FBQztBQUN6QixJQUFJLGFBQWEsR0FBRyxFQUFFLENBQUM7QUFTdkIsSUFBSyxRQUVKO0FBRkQsV0FBSyxRQUFRO0lBQ1QsdUNBQUksQ0FBQTtJQUFFLDJDQUFNLENBQUE7SUFBRSx1Q0FBSSxDQUFBO0FBQ3RCLENBQUMsRUFGSSxRQUFRLEtBQVIsUUFBUSxRQUVaO0FBRUQseURBQXlEO0FBQ3pELDBFQUEwRTtBQUMxRSxrQkFBeUIsT0FBZ0M7SUFDckQsNkJBQTZCLEdBQUcsUUFBUSxDQUFDLENBQUMsMkJBQTJCO0lBQ3JFLFFBQVEsR0FBRyxFQUFFLENBQUM7SUFDZCwrQkFBYyxDQUFDLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBMEIsQ0FBQztJQUM5RCxTQUFHLENBQUMsVUFBVSxFQUFFLENBQUM7SUFDakIsU0FBRyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3RELEtBQUssR0FBRywrQkFBYyxDQUFDLG9CQUFvQixFQUFFLENBQUM7SUFDOUMsK0JBQWMsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO0lBQ3RDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2xDLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsdUJBQXVCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztJQUNuRixLQUFLLENBQUMsbUJBQW1CLENBQUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsUUFBUTtJQUN0RSxnQkFBZ0IsRUFBRSxDQUFDO0lBQ25CLGNBQWMsRUFBRSxDQUFDO0lBQ2pCLG1CQUFtQixFQUFFLENBQUM7SUFDdEIsaUJBQWlCLEVBQUUsQ0FBQztJQUNwQixJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUM7SUFDdEQsb0JBQW9CLEdBQUcsZUFBTSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUM7SUFDN0UsMkJBQTJCLEVBQUUsQ0FBQztBQUNsQyxDQUFDO0FBbEJlLGdCQUFRLFdBa0J2QixDQUFBO0FBRUQsSUFBSSw2QkFBcUMsQ0FBQztBQUUxQztJQUNJLElBQUksQ0FBQztRQUNELEVBQUUsQ0FBQyxDQUFDLDZCQUE2QixDQUFDO1lBQzlCLE1BQU0sQ0FBQyw2QkFBNkIsQ0FBQztRQUN6QyxJQUFJLENBQUMsQ0FBQztZQUNGLGdEQUFnRDtZQUNoRCxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMseUJBQXlCLENBQUMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDO1FBQ3pGLENBQUM7SUFDTCxDQUFFO0lBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsbUNBQW1DLEdBQUcsQ0FBQyxDQUFDLENBQUE7UUFDbEQsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDO0FBQ0wsQ0FBQztBQUNEO0lBQ0ksU0FBRyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hELCtCQUFjLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxPQUFPO1FBQ3JDLE9BQU8sQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO1FBQ3ZCLE9BQU8sQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO1FBQ3pCLE9BQU8sQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBQzFCLE9BQU8sQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7UUFDakMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxhQUFhLEVBQUUsQ0FBQztJQUM1QyxDQUFDLENBQUMsQ0FBQztBQUNQLENBQUM7QUFFRCx3QkFBd0IsTUFBYztJQUNsQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFDakIsU0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsdUJBQXVCLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBQ0QsTUFBTSxDQUFDLGFBQWEsQ0FBQztBQUN6QixDQUFDO0FBRUQ7SUFDSSxJQUFJLG1CQUFtQixHQUFHLEdBQUcsQ0FBQyxDQUFBLElBQUk7SUFDbEMsc0JBQXNCLEdBQUcsSUFBSSxhQUFLLENBQUM7UUFDL0IsSUFBSSxDQUFDO1lBQ0QsSUFBSSxJQUFJLEdBQUcsS0FBSyxDQUFDO1lBQ2pCLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUVWLHNCQUFzQjtZQUN0QixPQUFPLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUM5RCxRQUFRLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDckIsQ0FBQztZQUVELE9BQU8sQ0FBQyxJQUFJLElBQUksUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDbEMsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3pCLEVBQUUsQ0FBQyxDQUFDLENBQUMsZUFBTSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2pELElBQUksQ0FBQyxJQUFJLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQztvQkFDMUIsU0FBRyxDQUFDLEdBQUcsQ0FBQyw4Q0FBOEMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUM1RyxRQUFRLENBQUM7Z0JBQ2IsQ0FBQztnQkFDRCxJQUFJLFNBQVMsR0FBRywrQkFBYyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUNuRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7b0JBQ2IsU0FBRyxDQUFDLEtBQUssQ0FBQyxzREFBc0QsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUN2SCxRQUFRLENBQUM7Z0JBQ2IsQ0FBQztnQkFDRCxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDaEIsS0FBSyxRQUFRLENBQUMsTUFBTTt3QkFDaEIsSUFBSSxVQUFVLEdBQUcsZ0JBQWdCLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxJQUFJLENBQUM7d0JBQ3hFLEVBQUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7NEJBQzdCLHlGQUF5Rjs0QkFFekYsSUFBSSxVQUFVLENBQUM7NEJBQ2YsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7Z0NBQ2pDLFVBQVUsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7NEJBQ3hFLENBQUM7NEJBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO2dDQUN6QyxTQUFHLENBQUMsR0FBRyxDQUFDLFVBQVUsR0FBRyx5QkFBeUIsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDOzRCQUNwRSxDQUFDOzRCQUNELEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0NBQ2xCLFNBQUcsQ0FBQyxHQUFHLENBQUMsVUFBVSxHQUFHLGdCQUFnQixFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7NEJBQzNELENBQUM7NEJBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dDQUM3QixTQUFHLENBQUMsR0FBRyxDQUFDLFVBQVUsR0FBRyxtQkFBbUIsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDOzRCQUM5RCxDQUFDOzRCQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsSUFBSSxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQ0FDdkQsU0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEdBQUcsNENBQTRDLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQzs0QkFDdkYsQ0FBQzs0QkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO2dDQUNyQixTQUFHLENBQUMsR0FBRyxDQUFDLFVBQVUsR0FBRyxtQkFBbUIsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDOzRCQUM5RCxDQUFDOzRCQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxVQUFVLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0NBQzVDLFNBQUcsQ0FBQyxHQUFHLENBQUMsVUFBVSxHQUFHLHdCQUF3QixFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7NEJBQ25FLENBQUM7NEJBQUMsSUFBSSxDQUFDLENBQUM7Z0NBQ0osTUFBTSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQzs0QkFDOUMsQ0FBQzt3QkFDTCxDQUFDO3dCQUFDLElBQUksQ0FBQyxDQUFDOzRCQUNKLFNBQUcsQ0FBQyxHQUFHLENBQUMsa0RBQWtELEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQzt3QkFDL0UsQ0FBQzt3QkFDRCxJQUFJLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUM7d0JBQzFCLEtBQUssQ0FBQztvQkFDVixLQUFLLFFBQVEsQ0FBQyxJQUFJO3dCQUNkLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7NEJBQ3BDLFNBQVMsQ0FBQyx1QkFBdUIsR0FBRyxLQUFLLENBQUM7d0JBQzlDLENBQUM7d0JBQUMsSUFBSSxDQUFDLENBQUM7NEJBQ0osdUZBQXVGOzRCQUN2RixTQUFTLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQzs0QkFDekIsU0FBUyxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7NEJBQzNCLHFCQUFxQixFQUFFLENBQUM7NEJBQ3hCLG9CQUFvQixFQUFFLENBQUM7NEJBQ3ZCLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO3dCQUN0RixDQUFDO3dCQUNELElBQUksQ0FBQyxJQUFJLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQzt3QkFDMUIsS0FBSyxDQUFDO2dCQUNkLENBQUM7WUFDTCxDQUFDO1FBQ0wsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3BELFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNyQixDQUFDO0lBQ0wsQ0FBQyxFQUFFLG1CQUFtQixDQUFDLENBQUM7SUFDeEIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUM7SUFFekQsdUNBQXVDO0lBQ3ZDLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLDJCQUEyQixDQUFDO1FBQ3ZFLElBQUksQ0FBQztZQUNELElBQUksTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUM7WUFDNUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDVCxJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQztnQkFDOUIsRUFBRSxDQUFDLENBQUMsZUFBTSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDM0MsRUFBRSxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO3dCQUN2QiwrRUFBK0U7d0JBQy9FLEVBQUUsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxLQUFLLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7NEJBQ3JELElBQUksWUFBWSxHQUFHLCtCQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDOzRCQUNsRixFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO2dDQUNmLFlBQVksQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7Z0NBQ3RDLFlBQVksQ0FBQyxlQUFlLENBQUMsb0NBQW9DLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQ0FDN0UscUJBQXFCLEVBQUUsQ0FBQztnQ0FDeEIsb0JBQW9CLEVBQUUsQ0FBQzs0QkFDM0IsQ0FBQzt3QkFDTCxDQUFDO29CQUNMLENBQUM7b0JBQ0QsSUFBSSxTQUFTLEdBQUcsK0JBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO29CQUM5RCxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO3dCQUNaLFNBQVMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7d0JBQzVCLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7NEJBQ3RCLFNBQUcsQ0FBQyxHQUFHLENBQUMsaURBQWlELEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQzs0QkFDM0UsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQTt3QkFDaEYsQ0FBQzt3QkFDRCxTQUFHLENBQUMsR0FBRyxDQUFDLCtCQUErQixHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQzt3QkFDeEYsb0JBQW9CLEdBQUcsR0FBRyxDQUFDO29CQUMvQixDQUFDO29CQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNKLFNBQUcsQ0FBQyxHQUFHLENBQUMsMERBQTBELEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDeEYsQ0FBQztnQkFDTCxDQUFDO1lBQ0wsQ0FBQztRQUNMLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyw0Q0FBNEMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNoRSxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNSLENBQUM7QUFFRDtJQUNJLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDMUIsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2hCLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUM5Qix3REFBd0Q7SUFDeEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO0lBQzNELElBQUksWUFBWSxHQUFHLCtCQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ2xGLFlBQVksQ0FBQyxlQUFlLENBQUMsdUJBQXVCLENBQUM7UUFDakQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUMvQixDQUFDLENBQUMsQ0FBQztJQUNILE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDekIsU0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQTtBQUM5QixDQUFDO0FBYmUsa0JBQVUsYUFhekIsQ0FBQTtBQUVEO0lBQ0ksU0FBUyxHQUFHLElBQUksK0JBQWMsRUFBRSxDQUFDO0FBQ3JDLENBQUM7QUFFRDtJQUNJLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztJQUMxRixhQUFhLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3RGLG1CQUFtQixDQUFDLGFBQWEsRUFBRSxrQkFBa0IsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUVoRSxXQUFXLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ25GLFdBQVcsQ0FBQyxPQUFPLEdBQUcsNEJBQTRCLENBQUM7SUFDbkQsbUJBQW1CLENBQUMsV0FBVyxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFBO0lBRXBFLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQ3BELEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUNoRCxLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7SUFFOUMsZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0FBQzdGLENBQUM7QUFFRCw2QkFBNkIsSUFBSSxFQUFFLElBQVksRUFBRSxLQUFhLEVBQUUsT0FBTyxHQUFXLElBQUksRUFBRSxJQUFJLEdBQVksSUFBSTtJQUN4RyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztJQUNqQixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztJQUNuQixJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztJQUN2QixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ1AsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2hCLENBQUM7SUFBQyxJQUFJLENBQUMsQ0FBQztRQUNKLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNoQixDQUFDO0FBQ0wsQ0FBQztBQUVELElBQUksVUFBVSxHQUFZLElBQUksQ0FBQztBQUUvQjtJQUNJLFVBQVUsR0FBRyxDQUFDLFVBQVUsQ0FBQztJQUN6QixFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQ2IsYUFBYSxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUM7UUFDOUIsYUFBYSxDQUFDLElBQUksR0FBRyxpQkFBaUIsR0FBRyxDQUFDLFVBQVUsR0FBRyxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUM7SUFDekUsQ0FBQztBQUNMLENBQUM7QUFFRDtJQUNJLElBQUksZUFBZSxHQUFHLElBQUksQ0FBQyxDQUFBLElBQUk7SUFDL0IsU0FBUyxHQUFHLElBQUksYUFBSyxDQUFDO1FBQ2xCLHVCQUF1QjtRQUN2QixFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixJQUFJLElBQUksSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxVQUFVLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQztZQUMxRyxFQUFFLENBQUMsQ0FBQyxlQUFNLENBQUMsZ0JBQWdCLENBQUMsYUFBYSxDQUFDLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQzNELE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ25ELENBQUM7UUFDTCxDQUFDO0lBQ0wsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxDQUFDO0lBRXBCLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUU1QyxJQUFJLGtDQUFrQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsMkJBQTJCLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDbkcsSUFBSSwyQkFBMkIsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLDhCQUE4QixDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQy9GLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO0lBQ3JFLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO0FBQ2xFLENBQUM7QUFFRDtJQUNJLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztBQUN0QixDQUFDO0FBRUQsMkJBQTJCLE1BQXlCO0lBQ2hELElBQUksQ0FBQztRQUNELEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQztZQUNqQixTQUFHLENBQUMsR0FBRyxDQUFDLG9CQUFvQixHQUFHLGlDQUFpQixDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZGLElBQUksTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7UUFDM0IsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDdEIsS0FBSyxpQ0FBaUIsQ0FBQyxRQUFRO2dCQUMzQixhQUFhLEdBQUcsS0FBSyxDQUFDO2dCQUN0QixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUN6RCxLQUFLLENBQUM7WUFDVixLQUFLLGlDQUFpQixDQUFDLG1CQUFtQjtnQkFDdEMsYUFBYSxHQUFHLGFBQWEsTUFBTSxDQUFDLFFBQVEsR0FBRyxDQUFDO2dCQUNoRCxTQUFTLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFDckMsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNuQixLQUFLLENBQUM7WUFDVixLQUFLLGlDQUFpQixDQUFDLGNBQWM7Z0JBQ2pDLGFBQWEsR0FBRyxrQkFBa0IsTUFBTSxDQUFDLFFBQVEsR0FBRyxDQUFDO2dCQUNyRCxTQUFTLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDcEMsS0FBSyxDQUFDO1lBQ1YsS0FBSyxpQ0FBaUIsQ0FBQyxLQUFLO2dCQUN4QixTQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUMsS0FBSyxHQUFHLE9BQU8sR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzNELG1CQUFtQixDQUFDLGFBQWEsRUFBRSxRQUFRLE1BQU0sQ0FBQyxRQUFRLFdBQVcsTUFBTSxDQUFDLEtBQUssRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ2xHLEtBQUssaUNBQWlCLENBQUMsS0FBSztnQkFDeEIsaUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3pCLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDbkIsYUFBYSxDQUFDLGVBQWUsQ0FBQyxDQUFDO2dCQUUvQiwrQkFBYyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSTtvQkFDbEMsSUFBSSxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7Z0JBQzNCLENBQUMsQ0FBQyxDQUFDO2dCQUVILEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQztvQkFDaEMsbUJBQW1CLENBQUMsYUFBYSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDekQsQ0FBQztnQkFDRCxJQUFJLENBQUMsQ0FBQztvQkFDRixJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBRXZDLHVIQUF1SDtvQkFDdkgsK0JBQWMsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQyxDQUFDO29CQUNuRSwrQkFBYyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDO29CQUVuRSxJQUFJLFlBQVksR0FBRywrQkFBYyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUM3RCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxJQUFJLHVCQUFPLENBQUMsT0FBTyxJQUFJLE1BQU0sQ0FBQyxPQUFPLElBQUksdUJBQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO3dCQUN2RSxZQUFZLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztvQkFDakMsQ0FBQztvQkFFRCxpQ0FBaUM7b0JBQ2pDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUM5QixFQUFFLENBQUMsQ0FBQyxlQUFNLENBQUMsZ0JBQWdCLENBQUMsYUFBYSxDQUFDLENBQUMsWUFBWSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7d0JBQy9ELFlBQVksQ0FBQyxlQUFlLENBQUMsMEJBQTBCLENBQUMsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztvQkFDdEcsQ0FBQztvQkFDRCw2RkFBNkY7b0JBQzdGLElBQUksR0FBRyxHQUFXLEVBQUUsQ0FBQztvQkFDckIsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7d0JBQ3JCLEtBQUssdUJBQU8sQ0FBQyxPQUFPOzRCQUNoQixHQUFHLEdBQUcseUJBQXlCLE1BQU0sQ0FBQyxRQUFRLE9BQU8sYUFBYSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDOzRCQUNsRixTQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSx3QkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDOzRCQUMvQixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsV0FBVyxHQUFHLEdBQUcsRUFBRSxZQUFZLENBQUMsQ0FBQzs0QkFDcEUsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDO2dDQUFDLFNBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7NEJBQzVDLGtCQUFrQjs0QkFDbEIsSUFBSSxhQUFhLEdBQUcsU0FBRyxDQUFDLGdCQUFnQixFQUFFLENBQUM7NEJBQzNDLElBQUksYUFBYSxHQUFHLFNBQUcsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDOzRCQUMzQyxFQUFFLENBQUMsQ0FBQyxlQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxPQUFPLEtBQUssSUFBSSxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dDQUMvRixJQUFJLFNBQVMsR0FBRywrQkFBYyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dDQUMxRCxTQUFTLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsYUFBYSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7NEJBQ25GLENBQUM7NEJBQ0QsS0FBSyxDQUFDO3dCQUNWLEtBQUssdUJBQU8sQ0FBQyxhQUFhOzRCQUN0QixHQUFHLEdBQUcsV0FBVyxNQUFNLENBQUMsUUFBUSxpQkFBaUIsYUFBYSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDOzRCQUM5RSxTQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSx3QkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDOzRCQUMvQixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsT0FBTyxHQUFHLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQzs0QkFDekQsS0FBSyxDQUFDO3dCQUNWLEtBQUssdUJBQU8sQ0FBQyxrQkFBa0I7NEJBQzNCLEdBQUcsR0FBRyxpQkFBaUIsTUFBTSxDQUFDLFFBQVEsaUJBQWlCLGFBQWEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsTUFBTSxDQUFDLFNBQVMsU0FBUyxNQUFNLENBQUMsU0FBUyxJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsRUFBRSxFQUFFLENBQUM7NEJBQ3RKLFNBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLHdCQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7NEJBQy9CLG1CQUFtQixDQUFDLGFBQWEsRUFBRSxPQUFPLEdBQUcsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDOzRCQUN6RCxLQUFLLENBQUM7d0JBQ1YsS0FBSyx1QkFBTyxDQUFDLGtCQUFrQjs0QkFDM0IsR0FBRyxHQUFHLGFBQWEsTUFBTSxDQUFDLFFBQVEsaUJBQWlCLGFBQWEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsTUFBTSxDQUFDLFNBQVMsU0FBUyxNQUFNLENBQUMsU0FBUyxJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsRUFBRSxFQUFFLENBQUM7NEJBQ2xKLFNBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLHdCQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7NEJBQy9CLG1CQUFtQixDQUFDLGFBQWEsRUFBRSxPQUFPLEdBQUcsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDOzRCQUN6RCxLQUFLLENBQUM7d0JBQ1YsS0FBSyx1QkFBTyxDQUFDLE9BQU87NEJBQ2hCLG1CQUFtQixDQUFDLGFBQWEsRUFBRSxzQkFBc0IsRUFBRSxRQUFRLENBQUMsQ0FBQzs0QkFDckUsU0FBRyxDQUFDLEdBQUcsQ0FBQyxhQUFhLE1BQU0sQ0FBQyxRQUFRLGNBQWMsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDOzRCQUNuRSxLQUFLLENBQUM7d0JBQ1YsS0FBSyx1QkFBTyxDQUFDLEtBQUs7NEJBQ2QsSUFBSSxRQUFRLEdBQUcsMENBQTBDLENBQUE7NEJBQ3pELG1CQUFtQixDQUFDLGFBQWEsRUFBRSxxQkFBcUIsR0FBRyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7NEJBQzVFLEdBQUcsR0FBRyxhQUFhLE1BQU0sQ0FBQyxRQUFRLGtDQUFrQyxDQUFDOzRCQUNyRSxTQUFHLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxNQUFNLENBQUMsUUFBUSxZQUFZLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSyxJQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsR0FBRyxNQUFNLENBQUMsS0FBSyxHQUFHLCtFQUErRSxDQUFDLENBQUMsQ0FBQzs0QkFDdE4sU0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLEdBQUcsUUFBUSxDQUFDLENBQUM7NEJBQ3pCLEtBQUssQ0FBQztvQkFDZCxDQUFDO2dCQUNMLENBQUM7Z0JBQ0QsS0FBSyxDQUFDO1lBQ1YsS0FBSyxpQ0FBaUIsQ0FBQyxRQUFRO2dCQUMzQixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUMxRCxLQUFLLENBQUM7WUFDVixLQUFLLGlDQUFpQixDQUFDLE9BQU87Z0JBQzFCLGFBQWEsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDL0IsbUJBQW1CLENBQUMsYUFBYSxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDdkQsS0FBSyxDQUFDO1lBQ1Y7Z0JBQ0ksS0FBSyxDQUFDO1FBQ2QsQ0FBQztJQUNMLENBQUU7SUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUNuRCxDQUFDO0FBQ0wsQ0FBQztBQUlELG1DQUFtQyxNQUE2QjtJQUM1RCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO1FBQ2xCLElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztRQUNwQixJQUFJLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDakIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSztZQUN2QixNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDakIsS0FBSyxpQ0FBaUIsQ0FBQyxLQUFLO29CQUN4QixTQUFTLEVBQUUsQ0FBQztvQkFDWixTQUFHLENBQUMsS0FBSyxDQUFDLGtCQUFrQixHQUFHLEtBQUssQ0FBQyxHQUFHLEVBQUUsd0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFDNUQsS0FBSyxDQUFDO2dCQUNWLEtBQUssaUNBQWlCLENBQUMsT0FBTztvQkFDMUIsV0FBVyxFQUFFLENBQUM7b0JBQ2QsU0FBRyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQzFDLEtBQUssQ0FBQztZQUNkLENBQUM7WUFDRCxPQUFPLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQztRQUN4QixDQUFDLENBQUMsQ0FBQTtRQUVGLElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLFNBQVMsR0FBRyxRQUFRLEdBQUcsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsV0FBVyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxXQUFXLEdBQUcsVUFBVSxHQUFHLENBQUMsV0FBVyxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBRXRNLG1CQUFtQjtRQUNuQixTQUFHLENBQUMsR0FBRyxDQUFDLFdBQVcsR0FBRyx3QkFBd0IsRUFBRSx3QkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2xFLGFBQWEsQ0FBQyxJQUFJLEdBQUcsV0FBVyxHQUFHLGNBQWMsQ0FBQztRQUNsRCxFQUFFLENBQUMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoQixhQUFhLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNoQyxDQUFDO1FBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3pCLGFBQWEsQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDO1FBQ25DLENBQUM7UUFFRCxFQUFFLENBQUMsQ0FBQyxTQUFTLEdBQUcsV0FBVyxHQUFHLENBQUMsQ0FBQztZQUFDLE9BQU8sR0FBRyx5QkFBeUIsQ0FBQztRQUVyRSxJQUFJLGtCQUFrQixHQUF1QixFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxDQUFDO1FBQzdFLElBQUksdUJBQXVCLEdBQXVCLEVBQUUsS0FBSyxFQUFFLHlCQUF5QixFQUFFLENBQUM7UUFDdkYsTUFBTSxDQUFDLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQyxrQkFBa0IsR0FBRyxXQUFXLEdBQUcsSUFBSSxHQUFHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU07WUFDN0ksSUFBSSxDQUFDO2dCQUNELEVBQUUsQ0FBQyxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsS0FBSyxLQUFLLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQzNELE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLHdDQUF3QyxDQUFDLENBQUE7Z0JBQzVFLENBQUM7Z0JBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsS0FBSyxLQUFLLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQzdELE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLHFDQUFxQyxDQUFDLENBQUE7Z0JBQ3pFLENBQUM7WUFDTCxDQUFFO1lBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLGtCQUFrQixHQUFHLE1BQU0sQ0FBQyxLQUFLLEdBQUcsYUFBYSxHQUFHLENBQUMsQ0FBQyxDQUFBO1lBQ3BFLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7QUFDTCxDQUFDO0FBRUQ7SUFFSSxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDLE1BQXlCLEtBQUssaUJBQWlCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUM1RyxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLGVBQWUsRUFBRSxDQUFDLElBQTJCLEtBQUsseUJBQXlCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUN4SCxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLElBQUksRUFBRSxDQUFDLElBQVk7UUFDcEQsU0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNuQixDQUFDLENBQUMsQ0FBQztJQUNILEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBeUM7UUFDaEYsU0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFNBQUcsQ0FBQyxRQUFRLElBQUksd0JBQVEsQ0FBQyxLQUFLLEdBQUcsS0FBSyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3BGLENBQUMsQ0FBQyxDQUFDO0lBQ0gsS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxHQUF5QztRQUN0RixTQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsU0FBRyxDQUFDLFFBQVEsSUFBSSx3QkFBUSxDQUFDLEtBQUssR0FBRyxLQUFLLEdBQUcsRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDMUYsQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLEtBQUssRUFBRSxDQUFDLEdBQXlDO1FBQ2xGLFNBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxTQUFHLENBQUMsUUFBUSxJQUFJLHdCQUFRLENBQUMsS0FBSyxHQUFHLEtBQUssR0FBRyxFQUFFLENBQUMsR0FBRyxHQUFHLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUN0RixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsYUFBYSxFQUFFLENBQUMsVUFBa0I7UUFDbkUsSUFBSSxDQUFDO1lBQ0QsbUJBQW1CLENBQUMsZ0JBQWdCLEVBQUUsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzNELEVBQUUsQ0FBQyxDQUFDLCtCQUFjLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztnQkFDNUIsK0JBQWMsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsT0FBTyxHQUFHLHVCQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDM0UsQ0FBQztRQUNMLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyxpQ0FBaUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNyRCxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLFVBQVUsRUFBRSxDQUFDLEdBQVc7UUFDekQsSUFBSSxDQUFDO1lBQ0QsSUFBSSxTQUFTLEdBQWUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbEQsU0FBRyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3pFLEVBQUUsQ0FBQyxDQUFDLENBQUMsK0JBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdEMsK0JBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLCtCQUFjLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUN0RSxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osSUFBSSxTQUFTLEdBQUcsK0JBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNuRCxTQUFTLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztnQkFDdEIsU0FBUyxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7WUFDaEMsQ0FBQztZQUNELFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsU0FBUyxFQUFFLGlCQUFpQixFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDdkYsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLDJDQUEyQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQy9ELENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUNILEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsVUFBVSxFQUFFLENBQUMsR0FBVztRQUN6RCxJQUFJLENBQUM7WUFDRCxJQUFJLFNBQVMsR0FBUSxlQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLFNBQUcsQ0FBQyxHQUFHLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDeEUsSUFBSSxTQUFTLEdBQUcsK0JBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ25ELFNBQVMsQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDO1lBQ3ZCLFNBQVMsQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO1lBQzNCLEVBQUUsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxJQUFJLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQzFELG9CQUFvQixHQUFHLElBQUksQ0FBQztZQUNoQyxDQUFDO1lBQ0QsU0FBUyxDQUFDLGVBQWUsQ0FBQyxvQ0FBb0MsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQzlFLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQywyQ0FBMkMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUMvRCxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyx3QkFBUSxDQUFDLHNCQUFzQixFQUFFO1FBQ3BELE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO0lBQ2hDLENBQUMsQ0FBQyxDQUFDO0lBQ0gsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMscUJBQXFCLENBQUMsQ0FBQyxNQUFNO1FBQzNFLElBQUksQ0FBQztZQUNELFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDNUQsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLGlDQUFpQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3JELENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0osS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsd0JBQXdCLENBQUM7UUFDdkUsSUFBSSxDQUFDO1lBQ0QsU0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3JCLHFCQUFxQixFQUFFLENBQUM7WUFDeEIsb0JBQW9CLEVBQUUsQ0FBQztRQUMzQixDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsdUNBQXVDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDM0QsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFSixLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLFlBQVksRUFBRSxDQUFDLE1BQTBCO1FBQzFFLDhCQUE4QixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzNDLENBQUMsQ0FBQyxDQUFDO0lBRUgsb0JBQW9CO0lBQ3BCLEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsd0JBQXdCLEVBQUUsTUFBTTtRQUNqRSxJQUFJLENBQUM7WUFDRCxJQUFJLFVBQVUsR0FBbUMsTUFBTSxDQUFDO1lBQ3hELEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztnQkFDZCxTQUFHLENBQUMsS0FBSyxDQUFDLDZDQUE2QyxDQUFDLENBQUM7WUFDN0QsQ0FBQztZQUNELElBQUksVUFBVSxHQUFHLCtCQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsZUFBZSxDQUFDO1lBQy9FLFVBQVUsQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDMUMsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLDJEQUEyRCxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQy9FLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUNILEtBQUssQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLHdCQUFRLENBQUMsU0FBUyxFQUFFLENBQUMsU0FBb0I7UUFDNUQsSUFBSSxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsZUFBTSxDQUFDLGdCQUFnQixDQUFDLGtCQUFrQixDQUFDLENBQUMsT0FBTyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQy9ELElBQUksVUFBVSxHQUFHLCtCQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsZUFBZSxDQUFDO2dCQUNsRixJQUFJLEtBQUssR0FBRyxVQUFVLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUMxRCxFQUFFLENBQUMsQ0FBQyxlQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxVQUFVLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDbEUsYUFBYTtvQkFDYixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQzt3QkFDckIseUJBQXlCO3dCQUN6QixVQUFVLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUN2QyxDQUFDO29CQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNKLDZCQUE2Qjt3QkFDN0IsVUFBVSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQ3RDLENBQUM7Z0JBQ0wsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDSixlQUFlO29CQUNmLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxLQUFLLElBQUksVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7d0JBQzlDLFVBQVUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQ3BDLENBQUM7Z0JBQ0wsQ0FBQztZQUNMLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixTQUFHLENBQUMsR0FBRyxDQUFDLGtGQUFrRixFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDaEgsQ0FBQztRQUNMLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyw4QkFBOEIsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNsRCxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDSCxNQUFNLENBQUMsTUFBTSxDQUFDLDhCQUE4QixDQUFDLENBQUMsTUFBTTtRQUNoRCxJQUFJLENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFDOUIsU0FBRyxDQUFDLEtBQUssQ0FBQyx5REFBeUQsQ0FBQyxDQUFDO2dCQUNyRSxNQUFNLENBQUM7WUFDWCxDQUFDO1lBQ0QsSUFBSSxHQUFHLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3BELElBQUksS0FBSyxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQztZQUM5QyxJQUFJLFNBQVMsR0FBRywrQkFBYyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbkQsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztnQkFDWixTQUFTLENBQUMsZUFBZSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3hELENBQUM7UUFDTCxDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsK0NBQStDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDbkUsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0g7Ozs7Ozs7Ozs7O1NBV0s7SUFFTCxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLHNCQUFzQixFQUFFLEdBQUc7UUFDNUQsSUFBSSxDQUFDO1lBQ0QsU0FBRyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFTLEdBQUcsQ0FBQyxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdEYsdURBQXVEO1lBQ3ZELElBQUksU0FBUyxHQUFHLCtCQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBUyxHQUFHLENBQUMsQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBQ2pGLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyxtREFBbUQsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN2RSxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLGFBQWEsRUFBRTtRQUNoRCxvQkFBb0IsRUFBRSxDQUFDO0lBQzNCLENBQUMsQ0FBQyxDQUFDO0lBRUgsa0JBQWtCO0lBQ2xCLFFBQVE7SUFDUixLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsa0JBQWtCLEVBQUU7UUFDakYsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN4SCxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRUosa0JBQWtCO0lBQ2xCLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyw0QkFBNEIsRUFBRTtRQUMzRixnQkFBZ0IsRUFBRSxDQUFDO0lBQ3ZCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFSixlQUFlO0lBQ2YsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLHlCQUF5QixFQUFFO1FBQ3hGLElBQUksQ0FBQztZQUNELEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ2hCLFNBQUcsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsQ0FBQztZQUN6QyxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osS0FBSyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsd0JBQVEsQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxZQUFzQjtvQkFDckYsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUMxQixNQUFNLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZTs0QkFDMUQsRUFBRSxDQUFDLENBQUMsZUFBZSxJQUFJLGVBQWUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQ0FDaEQsWUFBWSxDQUFDLGVBQWUsQ0FBQyxDQUFDOzRCQUNsQyxDQUFDOzRCQUFDLElBQUksQ0FBQyxDQUFDO2dDQUNKLFNBQUcsQ0FBQyxHQUFHLENBQUMsbURBQW1ELENBQUMsQ0FBQzs0QkFFakUsQ0FBQzt3QkFDTCxDQUFDLENBQUMsQ0FBQztvQkFDUCxDQUFDO29CQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNKLFNBQUcsQ0FBQyxHQUFHLENBQUMsdURBQXVELEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQzt3QkFDakYsWUFBWSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNsQyxDQUFDO2dCQUNMLENBQUMsRUFBRSxDQUFDLE1BQU07b0JBQ04sU0FBRyxDQUFDLEtBQUssQ0FBQywrQ0FBK0MsR0FBRyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztnQkFDbkYsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDO1FBQ0wsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLDJCQUEyQixHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQy9DLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRUosaUJBQWlCO0lBQ2pCLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQywwQkFBMEIsRUFBRTtRQUN6RixJQUFJLENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxlQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxPQUFPLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDL0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7b0JBQ3hCLFNBQUcsQ0FBQyxHQUFHLENBQUMsa0NBQWtDLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDNUQsTUFBTSxDQUFDO2dCQUNYLENBQUM7Z0JBQ0QsSUFBSSxHQUFHLEdBQUcsb0JBQW9CLENBQUM7Z0JBQy9CLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0JBRTdDLElBQUksZUFBZSxHQUFHLGNBQWMsR0FBRyxRQUFRLEdBQUcsSUFBSSxDQUFBO2dCQUN0RCxFQUFFLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxlQUFlLENBQUMsQ0FBQztvQkFBQyxNQUFNLENBQUM7Z0JBRTdDLElBQUksU0FBUyxHQUFHLCtCQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztnQkFDOUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDcEMsU0FBRyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEdBQUcsc0JBQXNCLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDbEUsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztvQkFDN0UsTUFBTSxDQUFDO2dCQUNYLENBQUM7Z0JBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7b0JBQzFDLFNBQUcsQ0FBQyxJQUFJLENBQUMsZUFBZSxHQUFHLHFDQUFxQyxDQUFDLENBQUM7b0JBQ2xFLE1BQU0sQ0FBQztnQkFDWCxDQUFDO2dCQUVELEVBQUUsQ0FBQyxDQUFDLGVBQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLFVBQVUsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNsRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUNuRixTQUFHLENBQUMsSUFBSSxDQUFDLDZEQUE2RCxDQUFDLENBQUM7d0JBQ3hFLE1BQU0sQ0FBQztvQkFDWCxDQUFDO2dCQUNMLENBQUM7Z0JBRUQsSUFBSSxPQUFPLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQztnQkFDdkIsRUFBRSxDQUFDLENBQUMsK0JBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUN2QixPQUFPLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNuRCxDQUFDO2dCQUNELElBQUksWUFBWSxHQUFHO29CQUNmLElBQUksRUFBRSxhQUFhO29CQUNuQixJQUFJLEVBQUUsT0FBTztvQkFDYixPQUFPLEVBQUUsUUFBUTtvQkFDakIsT0FBTyxFQUFFLE9BQU87b0JBQ2hCLFlBQVksRUFBRSxDQUFDO29CQUNmLGVBQWUsRUFBRSxJQUFJO2lCQUN4QixDQUFBO2dCQUNELEVBQUUsQ0FBQyxDQUFDLCtCQUFjLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztvQkFDN0IsU0FBRyxDQUFDLElBQUksQ0FBQyxjQUFjLEdBQUcsUUFBUSxHQUFHLHNDQUFzQyxDQUFDLENBQUM7b0JBQzdFLE1BQU0sQ0FBQztnQkFDWCxDQUFDO2dCQUNELFVBQVUsQ0FBQztvQkFDUCxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxtQkFBbUIsRUFBRSxZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUM7d0JBQ25FLFNBQUcsQ0FBQyxHQUFHLENBQUMsb0NBQW9DLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQzt3QkFDN0QsK0JBQWMsQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO3dCQUNsQyxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO29CQUMzRCxDQUFDLEVBQUUsR0FBRzt3QkFDRixTQUFHLENBQUMsS0FBSyxDQUFDLDJCQUEyQixHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFDekQsQ0FBQyxDQUFDLENBQUM7Z0JBQ1AsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osU0FBRyxDQUFDLElBQUksQ0FBQyxnRUFBZ0UsQ0FBQyxDQUFBO1lBQzlFLENBQUM7UUFDTCxDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsZ0NBQWdDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDcEQsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFSixrQkFBa0I7SUFDbEIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLDRCQUE0QixFQUFFO1FBQzNGLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2YsYUFBYSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQy9CLFNBQUcsQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNyRCxXQUFXLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDbkIsYUFBYSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUM7WUFDL0IsYUFBYSxDQUFDLElBQUksR0FBRyxVQUFVLENBQUM7WUFDaEMsaUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDekIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLGdCQUFnQixFQUFFLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDOUYsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osU0FBRyxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQ3pDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRUosUUFBUTtJQUNSLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxrQkFBa0IsRUFBRTtRQUNqRixJQUFJLENBQUM7WUFDRCxTQUFTLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDOUIsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3hELENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRUosY0FBYztJQUNkLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyx1QkFBdUIsRUFBRTtRQUN0RixJQUFJLENBQUM7WUFDRCxTQUFHLENBQUMsR0FBRyxDQUFDLDJCQUEyQixHQUFHLFNBQUcsQ0FBQyxXQUFXLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN0RSxNQUFNLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLFNBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWTtnQkFDaEUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN4RSxDQUFDLENBQUMsQ0FBQTtRQUNOLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQywwQkFBMEIsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUM5QyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNSLENBQUM7QUFFRCxzQkFBc0IsV0FBbUI7SUFDckMsSUFBSSxDQUFDO1FBQ0QsYUFBYSxHQUFHLEtBQUssQ0FBQztRQUN0QixLQUFLLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsWUFBWSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ3RFLENBQUU7SUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQywwQkFBMEIsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUM5QyxDQUFDO0FBQ0wsQ0FBQztBQUVELHdDQUF3QyxNQUEwQjtJQUM5RCxJQUFJLENBQUM7UUFDRCxhQUFhLEdBQUcsSUFBSSxDQUFDO1FBQ3JCLFNBQUcsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEdBQUcsTUFBTSxDQUFDLElBQUksRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3hELG1CQUFtQixDQUFDLGFBQWEsRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDckQsOENBQThDO1FBQzlDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ25CLHNCQUFzQjtZQUN0QixlQUFlLEVBQUUsQ0FBQTtZQUNqQixFQUFFLENBQUMsQ0FBQyxvQkFBb0IsSUFBSSxlQUFNLENBQUMsZ0JBQWdCLENBQUMsYUFBYSxDQUFDLENBQUMsNEJBQTRCLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDdkcsU0FBRyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUMxRCxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLG9CQUFvQixFQUFFLGlCQUFpQixFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDbEcsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFFO0lBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsK0NBQStDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDbkUsQ0FBQztBQUNMLENBQUM7QUFFRDtJQUNJLEVBQUUsQ0FBQyxDQUFDLCtCQUFjLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztRQUM3QixTQUFHLENBQUMsR0FBRyxDQUFDLHdDQUF3QyxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDbEUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQzFELENBQUM7QUFDTCxDQUFDO0FBRUQ7SUFDSSxJQUFJLENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQywrQkFBYyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7WUFDN0IsU0FBRyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3pDLElBQUksVUFBVSxHQUFHLCtCQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLGVBQWUsQ0FBQztZQUNoRyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDdEMsQ0FBQztJQUNMLENBQUU7SUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyx5Q0FBeUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUM3RCxDQUFDO0FBQ0wsQ0FBQztBQUVELG9CQUFvQixRQUFRO0lBQ3hCLElBQUksQ0FBQztRQUNELEVBQUUsQ0FBQyxDQUFDLENBQUMsaUNBQWUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQzlCLGlDQUFlLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztZQUNsQyxJQUFJLFVBQVUsR0FBRywrQkFBYyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxlQUFlLENBQUM7WUFDaEcsVUFBVSxDQUFDLHVCQUF1QixDQUFDO2dCQUMvQixVQUFVLENBQUMsdUNBQXVDLENBQUM7b0JBQy9DLFVBQVUsQ0FBQyxlQUFlLEVBQUUsQ0FBQztvQkFDN0IsUUFBUSxFQUFFLENBQUM7Z0JBQ2YsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLFNBQUcsQ0FBQyxHQUFHLENBQUMsMkNBQTJDLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN6RSxDQUFDO0lBQ0wsQ0FBRTtJQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLHdCQUF3QixHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzVDLENBQUM7QUFDTCxDQUFDO0FBRUQsb0JBQW9CLFFBQVEsRUFBRSxVQUEyQjtJQUNyRCxJQUFJLENBQUM7UUFDRCxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLE1BQU0sQ0FBQyxFQUFFLEtBQUs7WUFDL0YsU0FBRyxDQUFDLEtBQUssQ0FBQyxtREFBbUQsQ0FBQyxDQUFDO1FBQ25FLENBQUMsQ0FBQyxDQUFDO1FBQ0gsK0JBQWMsQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1FBQ25DLFNBQUcsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3pFLGlDQUFlLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztRQUNuQyxVQUFVLENBQUMsdUJBQXVCLENBQUM7WUFDL0IsVUFBVSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzdCLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNuQixRQUFRLEVBQUUsQ0FBQztRQUNmLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBRTtJQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLHVCQUF1QixHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzNDLENBQUM7QUFDTCxDQUFDO0FBRUQsZ0JBQWdCLFNBQXlCLEVBQUUsaUJBQTBCO0lBQ2pFLGVBQWU7SUFDZixxQkFBcUIsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDbkMsT0FBTyxHQUFHLEVBQUUsQ0FBQztJQUNiLHNCQUFzQjtJQUN0QixJQUFJLGVBQWUsR0FBZSxTQUFTLENBQUMsZUFBZSxDQUFDLGFBQWEsRUFBRSxDQUFDO0lBQzVFLEVBQUUsQ0FBQyxDQUFDLGVBQWUsSUFBSSxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUMzQyxTQUFHLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxHQUFHLGFBQWEsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNuRyxVQUFVLEdBQUcsZUFBZSxDQUFDO0lBQ2pDLENBQUM7SUFFRCxhQUFhLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDL0IsZUFBZSxHQUFHLFdBQVcsQ0FBQztRQUMxQixJQUFJLFFBQVEsR0FBRyxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUE7UUFDeEMsRUFBRSxDQUFDLENBQUMsUUFBUSxJQUFJLFlBQVksQ0FBQyxDQUFDLENBQUM7WUFDM0IsU0FBRyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEdBQUcsUUFBUSxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDakQsaUJBQWlCLENBQUMsSUFBSSxHQUFHLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNuRCxhQUFhLENBQUMsSUFBSSxHQUFHLGFBQWEsR0FBRyxHQUFHLEdBQUcsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3hFLENBQUM7SUFDTCxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFFUixJQUFJLEdBQUcsR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ25DLEVBQUUsQ0FBQyxDQUFDLGVBQU0sQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDaEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNoQixTQUFHLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFDekMsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osSUFBSSxVQUFVLEdBQUcsK0JBQWMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLGVBQWUsQ0FBQztZQUNwRSxVQUFVLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDM0IsVUFBVSxDQUFDO2dCQUNQLHVCQUF1QjtnQkFDdkIsU0FBRyxDQUFDLFVBQVUsQ0FBQyxTQUFHLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO2dCQUV2QyxrQkFBa0I7Z0JBQ2xCLFNBQVMsQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO2dCQUMxQixTQUFTLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztnQkFDM0IsU0FBUyxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7Z0JBRTNCLElBQUksU0FBUyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDM0csSUFBSSxNQUFNLEdBQWlCLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLENBQUM7Z0JBQ3BHLEtBQUssQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDM0QsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ25CLENBQUM7SUFDTCxDQUFDO0FBQ0wsQ0FBQztBQUVELG1CQUFtQixhQUFxQixFQUFFLEtBQWEsRUFBRSxJQUFJLEdBQVksS0FBSztJQUMxRSxJQUFJLGVBQWUsR0FBRyxlQUFNLENBQUMsZ0JBQWdCLENBQUMsYUFBYSxDQUFDLENBQUMsWUFBWSxLQUFLLElBQUksQ0FBQztJQUNuRixPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxxQkFBcUIsQ0FBQyxDQUFDO0lBQ2pELElBQUksUUFBUSxHQUFHLFdBQVcsQ0FBQyxhQUFhLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDL0MsU0FBRyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEdBQUcsUUFBUSxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDakQsWUFBWSxHQUFHLFFBQVEsQ0FBQztJQUN4QixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDTCxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUM3QixJQUFJLENBQUMsQ0FBQztRQUNGLG1CQUFtQixDQUFDLGlCQUFpQixFQUFFLGVBQWUsQ0FBQyxRQUFRLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBQ2xHLG1CQUFtQixDQUFDLGFBQWEsRUFBRSxhQUFhLEdBQUcsR0FBRyxHQUFHLGNBQWMsQ0FBQyxRQUFRLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM5RixDQUFDO0FBQ0wsQ0FBQztBQUVELHFCQUFxQixRQUFnQjtJQUNqQyxJQUFJLENBQUM7UUFDRCxJQUFJLHNCQUFzQixHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3pELElBQUksZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLHFCQUFxQixDQUFDO1FBQzFELEVBQUUsQ0FBQyxDQUFDLFVBQVUsSUFBSSxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUNuQyxJQUFJLEdBQUcsR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDO1lBQzdCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQy9CLElBQUksaUJBQWlCLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hELElBQUksUUFBUSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNuQyxJQUFJLFNBQVMsR0FBRyxzQkFBc0IsQ0FBQztnQkFDdkMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsTUFBTSxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsc0JBQXNCLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQy9ILHdFQUF3RTtvQkFDeEUsaUJBQWlCLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDeEMsU0FBUyxHQUFHLGdCQUFnQixDQUFDO2dCQUNqQyxDQUFDO2dCQUNELElBQUksYUFBYSxHQUFHLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQTtnQkFDaEQsSUFBSSxjQUFjLEdBQUcsU0FBUyxHQUFHLGFBQWEsQ0FBQztnQkFDL0MsUUFBUSxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsZ0JBQWdCLEdBQUcsY0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdEUsQ0FBQztZQUNELDZEQUE2RDtZQUM3RCxFQUFFLENBQUMsQ0FBQyxRQUFRLEdBQUcsRUFBRSxDQUFDO2dCQUFDLFFBQVEsR0FBRyxFQUFFLENBQUM7UUFDckMsQ0FBQztRQUNELE1BQU0sQ0FBQyxRQUFRLENBQUM7SUFDcEIsQ0FBRTtJQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLDRCQUE0QixHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ2hELENBQUM7QUFDTCxDQUFDO0FBRUQseUJBQXlCLFFBQWdCO0lBQ3JDLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ2hDLElBQUksR0FBRyxHQUFHLEVBQUUsQ0FBQztJQUNiLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsUUFBUSxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ3JDLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDO0lBQ3BCLENBQUM7SUFDRCxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLFFBQVEsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUN0QyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztJQUNwQixDQUFDO0lBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQztBQUNmLENBQUM7QUFFRCx1QkFBdUIsSUFBWTtJQUMvQixNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxVQUFVLENBQUM7QUFDeEMsQ0FBQztBQUVELHdCQUF3QixRQUFnQjtJQUNwQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztRQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDM0IsTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDO0FBQ3JDLENBQUMifQ==