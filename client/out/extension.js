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
                        }
                        else {
                            let oldFileState = ExtensionState_1.ExtensionState.viperFiles.get(lastActiveTextEditor.toString());
                            if (oldFileState) {
                                oldFileState.decorationsShown = false;
                                oldFileState.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
                                if (ExtensionState_1.ExtensionState.isDebugging) {
                                    stopDebugging();
                                }
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
                    verifiedFile.stateVisualizer.addTimingInformationToFile({ total: params.time, timings: timings });
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
    state.client.onRequest(ViperProtocol_1.Commands.RequestRequiredVersion, () => {
        return getRequiredVersion();
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
    //startDebugging
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.startDebugging', () => {
        try {
            if (Helper_1.Helper.getConfiguration("advancedFeatures").enabled === true) {
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
    //stopVerification
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
    //reset timing;
    verificationStartTime = Date.now();
    timings = [];
    //load expected timing
    let expectedTimings = fileState.stateVisualizer.getLastTiming();
    if (expectedTimings && expectedTimings.total) {
        Log_1.Log.log("Verification is expected to take " + formatSeconds(expectedTimings.total), ViperProtocol_1.LogLevel.Info);
        oldTimings = expectedTimings;
    }
    progressUpdater = setInterval(() => {
        let progress = getProgress(lastProgress);
        statusBarProgress.text = progressBarText(progress);
        statusBarItem.text = progressLabel + " " + formatProgress(progress);
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
                state.client.sendNotification(ViperProtocol_1.Commands.Verify, { uri: uri, manuallyTriggered: manuallyTriggered, workspace: workspace });
            }, visualizer);
        }
    }
}
function addTiming(paramProgress, color, hide = false) {
    let showProgressBar = Helper_1.Helper.getConfiguration('preferences').showProgress === true;
    timings.push(Date.now() - verificationStartTime);
    let progress = getProgress(paramProgress || 0);
    lastProgress = lastProgress;
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
                if (old.length > timings.length && timeSpent > old[timings.length]) {
                    //if this time we should already have completed the step, factor that in
                    timeSpentLastTime = old[timings.length];
                    timeSpent = timeAlreadySpent;
                }
                let leftToCompute = oldTotal - timeSpentLastTime;
                let estimatedTotal = timeSpent + leftToCompute;
                progress = 100 * Math.min((timeAlreadySpent / estimatedTotal), 1);
            }
        }
        Log_1.Log.log("Progress: " + progress, ViperProtocol_1.LogLevel.Debug);
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
    return progress.toFixed(0) + "%";
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2V4dGVuc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFLYixNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUN6QixJQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDNUIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFFN0Isd0JBQW9CLFNBQVMsQ0FBQyxDQUFBO0FBQzlCLE1BQVksTUFBTSxXQUFNLFFBQVEsQ0FBQyxDQUFBO0FBQ2pDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELGdDQUFpTyxpQkFBaUIsQ0FBQyxDQUFBO0FBQ25QLHdCQUFnQixzQ0FBc0MsQ0FBQyxDQUFBO0FBQ3ZELHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUMxQixrQ0FBOEIsbUJBQW1CLENBQUMsQ0FBQTtBQUNsRCx5QkFBcUIsVUFBVSxDQUFDLENBQUE7QUFFaEMsaUNBQTZCLGtCQUFrQixDQUFDLENBQUE7QUFDaEQsaUNBQTZCLGtCQUFrQixDQUFDLENBQUE7QUFFaEQsSUFBSSxhQUFhLENBQUM7QUFDbEIsSUFBSSxpQkFBaUIsQ0FBQztBQUN0QixJQUFJLGdCQUFnQixDQUFDO0FBQ3JCLElBQUksV0FBVyxDQUFDO0FBQ2hCLElBQUksU0FBZ0IsQ0FBQztBQUNyQixJQUFJLEtBQXFCLENBQUM7QUFFMUIsSUFBSSxzQkFBNkIsQ0FBQztBQUVsQyxJQUFJLGlCQUEyQyxDQUFDO0FBRWhELElBQUksU0FBeUIsQ0FBQztBQUU5QixJQUFJLFFBQWdCLENBQUM7QUFFckIsSUFBSSxZQUFvQixDQUFDO0FBQ3pCLElBQUksYUFBYSxHQUFZLEtBQUssQ0FBQztBQUVuQyxJQUFJLG9CQUFnQyxDQUFDO0FBRXJDLGFBQWE7QUFDYixJQUFJLHFCQUE2QixDQUFDO0FBQ2xDLElBQUksT0FBaUIsQ0FBQztBQUN0QixJ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