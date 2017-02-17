'use strict';
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
//let lastActiveTextEditor: vscode.Uri;
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
let isUnitTest = false;
let unitTestResolve;
function initializeUnitTest(done) {
    isUnitTest = true;
    unitTestResolve = done;
    //activate(context);
}
exports.initializeUnitTest = initializeUnitTest;
function addTestDecoration() {
    let options = [];
    options.push({
        range: new vscode.Range(new vscode.Position(2, 1), new vscode.Position(2, 1)),
        renderOptions: {
            before: {
                contentText: "Decoration",
                color: "red"
            }
        }
    });
    let decoration = vscode.window.createTextEditorDecorationType(options);
    vscode.window.activeTextEditor.setDecorations(decoration, options);
}
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    Log_1.Log.log('The ViperIDE is starting up.', ViperProtocol_1.LogLevel.Info);
    lastVersionWithSettingsChange = {
        nailgunSettingsVersion: "0.5.402",
        backendSettingsVersion: "0.2.15",
        pathSettingsVersion: "0.2.15",
        userPreferencesVersion: "0.2.15",
        javaSettingsVersion: "0.2.15",
        advancedFeaturesVersion: "0.3.8"
    };
    workList = [];
    Log_1.Log.initialize();
    Log_1.Log.log('Viper-Client is now active.', ViperProtocol_1.LogLevel.Info);
    state = ExtensionState_1.State.createState();
    ExtensionState_1.State.checkOperatingSystem();
    context.subscriptions.push(state);
    fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/*{' + Helper_1.Helper.viperFileEndings.join(",") + "}");
    state.startLanguageServer(context, fileSystemWatcher, false); //break?
    registerHandlers();
    startAutoSaver();
    initializeStatusBar();
    registerFormatter();
    let uri = vscode.window.activeTextEditor.document.uri;
    ExtensionState_1.State.setLastActiveFile(uri, vscode.window.activeTextEditor);
    startVerificationController();
    //addTestDecoration();
}
exports.activate = activate;
let verifyingAllFiles = false;
let allFilesToAutoVerify;
let nextFileToAutoVerify;
let autoVerificationResults;
let autoVerificationStartTime;
function verifyAllFilesInWorkspace() {
    autoVerificationStartTime = Date.now();
    verifyingAllFiles = true;
    autoVerificationResults = [];
    if (!ExtensionState_1.State.isBackendReady) {
        Log_1.Log.error("The backend must be running before verifying all files in the workspace");
        return;
    }
    let endings = "{" + Helper_1.Helper.viperFileEndings.join(",") + "}";
    vscode.workspace.findFiles('**/*' + endings, '').then((uris) => {
        Log_1.Log.log("Starting to verify " + uris.length + " viper files.", ViperProtocol_1.LogLevel.Info);
        allFilesToAutoVerify = uris;
        nextFileToAutoVerify = 0;
        autoVerifyFile();
    });
}
function printAllVerificationResults() {
    Log_1.Log.log("Verified " + autoVerificationResults.length + " files in " + formatSeconds((Date.now() - autoVerificationStartTime) / 1000), ViperProtocol_1.LogLevel.Info);
    autoVerificationResults.forEach(res => {
        Log_1.Log.log("Verification Result: " + res, ViperProtocol_1.LogLevel.Info);
    });
}
function autoVerifyFile() {
    return new Promise((resolve, reject) => {
        if (nextFileToAutoVerify < allFilesToAutoVerify.length && verifyingAllFiles) {
            let currFile = allFilesToAutoVerify[nextFileToAutoVerify];
            Log_1.Log.log("AutoVerify " + path.basename(currFile.toString()));
            nextFileToAutoVerify++;
            vscode.workspace.openTextDocument(currFile).then((document) => {
                vscode.window.showTextDocument(document).then(() => {
                    verify(ExtensionState_1.State.getFileState(currFile), false);
                    resolve(true);
                });
            });
        }
        else {
            verifyingAllFiles = false;
            printAllVerificationResults();
            resolve(false);
        }
    });
}
let lastVersionWithSettingsChange;
function getRequiredVersion() {
    try {
        return lastVersionWithSettingsChange;
    }
    catch (e) {
        Log_1.Log.error("Error checking settings version: " + e);
        return null;
    }
}
function canStartDebugging() {
    try {
        let result = false;
        let reason;
        if (Helper_1.Helper.getConfiguration("advancedFeatures").enabled !== true) {
            reason = "Don't debug, You must first Enable the advanced features in the settings.";
        }
        else if (!ExtensionState_1.State.getLastActiveFile()) {
            reason = "Don't debug, no viper file open.";
        }
        else {
            let fileState = ExtensionState_1.State.getLastActiveFile();
            let uri = fileState.uri;
            let filename = path.basename(uri.toString());
            let dontDebugString = `Don't debug ${filename}, `;
            if (!ExtensionState_1.State.isBackendReady) {
                reason = dontDebugString + "the backend is not ready";
            }
            else if (ExtensionState_1.State.isVerifying) {
                reason = dontDebugString + "a verification is running", ViperProtocol_1.LogLevel.Debug;
            }
            else if (!fileState.verified) {
                reason = dontDebugString + "the file is not verified, the verificaion will be started.", ViperProtocol_1.LogLevel.Debug;
                workList.push({ type: TaskType.Verify, uri: uri, manuallyTriggered: false });
            }
            else if (!fileState.stateVisualizer.readyToDebug) {
                reason = dontDebugString + "the verification provided no states";
            }
            else if (Helper_1.Helper.getConfiguration("advancedFeatures").simpleMode === true && !fileState.stateVisualizer.decorationOptions.some(option => option.isErrorState)) {
                reason = `Don't debug ${filename}. In simple mode debugging can only be started when there is an error state.`;
            }
            else {
                result = true;
            }
        }
        return {
            result: result,
            reason: reason,
            error: null
        };
    }
    catch (e) {
        let error = "Error checking if Debugging can be started " + e;
        Log_1.Log.error(error);
        return {
            result: false,
            reason: null,
            error: error
        };
    }
}
function canStartVerification(task) {
    try {
        let result = false;
        let reason;
        let dontVerify = `Don't verify ${path.basename(task.uri.toString())}: `;
        if (!ExtensionState_1.State.isBackendReady) {
            reason = "Backend is not ready, wait for backend to start.";
        }
        else {
            let activeFile;
            let fileState = ExtensionState_1.State.getFileState(task.uri);
            if (vscode.window.activeTextEditor) {
                activeFile = vscode.window.activeTextEditor.document.uri.toString();
            }
            if (!task.manuallyTriggered && !autoVerify) {
                reason = dontVerify + "autoVerify is disabled.";
            }
            else if (!fileState.open) {
                reason = dontVerify + "file is closed";
            }
            else if (fileState.verifying && !fileState.changed) {
                reason = dontVerify + `file has not changed, restarting the verification has no use`;
            }
            else if (!task.manuallyTriggered && fileState.verified) {
                reason = dontVerify + `not manuallyTriggered and file is verified`;
            }
            else if (!activeFile) {
                reason = dontVerify + `no file is active`;
            }
            else if (activeFile !== task.uri.toString()) {
                reason = dontVerify + `another file is active`;
            }
            else {
                result = true;
            }
        }
        return {
            result: result,
            reason: reason,
            error: null
        };
    }
    catch (e) {
        let error = "Error checking if Verification can be started " + e;
        Log_1.Log.error(error);
        return {
            result: false,
            reason: null,
            error: error
        };
    }
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
                if (!Helper_1.Helper.isViperSourceFile(task.uri)) {
                    task.type = TaskType.NoOp;
                    Log_1.Log.log("Warning: Only handle viper files, not file: " + path.basename(task.uri.toString()), ViperProtocol_1.LogLevel.Info);
                    continue;
                }
                let fileState = ExtensionState_1.State.getFileState(task.uri);
                if (!fileState) {
                    Log_1.Log.error("The file is unknown to the verification controller: " + path.basename(task.uri.toString()), ViperProtocol_1.LogLevel.Debug);
                    continue;
                }
                switch (task.type) {
                    case TaskType.Verify:
                        let canVerify = canStartVerification(task);
                        if (canVerify.result) {
                            verify(fileState, task.manuallyTriggered);
                        }
                        else if (canVerify.reason) {
                            Log_1.Log.log(canVerify.reason, ViperProtocol_1.LogLevel.Info);
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
                    let oldViperFile = ExtensionState_1.State.getLastActiveFile();
                    if (oldViperFile) {
                        //change in avtive viper file, remove special characters from the previous one
                        if (oldViperFile.uri.toString() !== uri.toString()) {
                            oldViperFile.decorationsShown = false;
                            oldViperFile.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
                            stopDebuggingOnServer();
                            stopDebuggingLocally();
                        }
                    }
                    let fileState = ExtensionState_1.State.setLastActiveFile(uri, editor);
                    if (fileState) {
                        if (!fileState.verified) {
                            Log_1.Log.log("reverify because the active text editor changed", ViperProtocol_1.LogLevel.Debug);
                            workList.push({ type: TaskType.Verify, uri: uri, manuallyTriggered: false });
                        }
                        else {
                            Log_1.Log.log("don't reverify, the file is already verified", ViperProtocol_1.LogLevel.Debug);
                        }
                        Log_1.Log.log("Active viper file changed to " + path.basename(uri.toString()), ViperProtocol_1.LogLevel.Info);
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
    return new Promise((resolve, reject) => {
        Log_1.Log.log("deactivate");
        state.dispose().then(() => {
            Log_1.Log.log("state disposed");
            //TODO: make sure no doc contains special chars any more
            if (ExtensionState_1.State.getLastActiveFile()) {
                Log_1.Log.log("Removing special chars of last opened file.");
                ExtensionState_1.State.getLastActiveFile().stateVisualizer.removeSpecialCharacters(() => {
                    Log_1.Log.log("Close Log");
                    Log_1.Log.dispose();
                    Log_1.Log.log("Deactivated");
                    resolve();
                });
            }
            else {
                Log_1.Log.log("Close Log");
                Log_1.Log.dispose();
                Log_1.Log.log("Deactivated");
                resolve();
            }
        }).catch(e => {
            Log_1.Log.error("error disposing: " + e);
        });
    });
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
    let onTextEditorSelectionChange = vscode.window.onDidChangeTextEditorSelection(selectionChange => {
        if (Helper_1.Helper.isViperSourceFile(selectionChange.textEditor.document.uri)) {
            resetAutoSaver();
        }
    });
    state.context.subscriptions.push(onActiveTextEditorChangeDisposable);
    state.context.subscriptions.push(onTextEditorSelectionChange);
}
function resetAutoSaver() {
    autoSaver.reset();
}
let lastState = ViperProtocol_1.VerificationState.Stopped;
function handleStateChange(params) {
    try {
        lastState = params.newState;
        if (!params.progress)
            Log_1.Log.log("The new state is: " + ViperProtocol_1.VerificationState[params.newState], ViperProtocol_1.LogLevel.Debug);
        let window = vscode.window;
        switch (params.newState) {
            case ViperProtocol_1.VerificationState.Starting:
                ExtensionState_1.State.isBackendReady = false;
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
                clearInterval(progressUpdater);
                statusBarProgress.hide();
                abortButton.hide();
                ExtensionState_1.State.viperFiles.forEach(file => {
                    file.verifying = false;
                });
                ExtensionState_1.State.isVerifying = false;
                if (!params.verificationCompleted) {
                    updateStatusBarItem(statusBarItem, "ready", 'white');
                }
                else {
                    let uri = vscode.Uri.parse(params.uri);
                    //since at most one file can be verified at a time, set all to non-verified before potentially setting one to verified 
                    ExtensionState_1.State.viperFiles.forEach(file => file.verified = false);
                    let verifiedFile = ExtensionState_1.State.getFileState(params.uri);
                    verifiedFile.success = params.success;
                    if (params.success != ViperProtocol_1.Success.Aborted && params.success != ViperProtocol_1.Success.Error) {
                        verifiedFile.verified = true;
                    }
                    //complete the timing measurement
                    addTiming(100, 'white', true);
                    if (Helper_1.Helper.getConfiguration("preferences").showProgress === true) {
                        verifiedFile.stateVisualizer.addTimingInformationToFileState({ total: params.time, timings: timings });
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
                            // this was only used for generating the svg of the SymbexLogger's execution tree
                            // as this file is unused we can safely remove its creation
                            /*let symbexDotFile = Log.getSymbExDotPath();
                            let symbexSvgFile = Log.getSymbExSvgPath();
                            if (Helper.getConfiguration("advancedFeatures").enabled === true && fs.existsSync(symbexDotFile)) {
                                verifiedFile.stateVisualizer.generateSvg(null, symbexDotFile, symbexSvgFile, () => { });
                            }*/
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
                        case ViperProtocol_1.Success.Timeout:
                            updateStatusBarItem(statusBarItem, "Verification timed out", 'orange');
                            Log_1.Log.log(`Verifying ${params.filename} timed out`, ViperProtocol_1.LogLevel.Info);
                            break;
                    }
                    if (isUnitTest && unitTestResolve) {
                        if (verificationCompleted(params.success)) {
                            unitTestResolve("VerificationCompleted");
                        }
                    }
                }
                if (verifyingAllFiles) {
                    autoVerificationResults.push(`${ViperProtocol_1.Success[params.success]}: ${index_1.default.parse(params.uri).fsPath}`);
                    autoVerifyFile();
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
function verificationCompleted(success) {
    return success == ViperProtocol_1.Success.Success
        || success == ViperProtocol_1.Success.ParsingFailed
        || success == ViperProtocol_1.Success.TypecheckingFailed
        || success == ViperProtocol_1.Success.VerificationFailed;
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
            ExtensionState_1.State.isBackendReady = false;
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
            ExtensionState_1.State.reset();
        }
        catch (e) {
            Log_1.Log.error("Error handling backend change: " + e);
        }
    });
    state.client.onNotification(ViperProtocol_1.Commands.FileOpened, (uri) => {
        try {
            Log_1.Log.log("File openend: " + path.basename(uri), ViperProtocol_1.LogLevel.Info);
            let uriObject = index_1.default.parse(uri);
            let fileState = ExtensionState_1.State.getFileState(uri);
            if (fileState) {
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
            let fileState = ExtensionState_1.State.getFileState(uri);
            if (fileState) {
                fileState.open = false;
                fileState.verified = false;
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
            let visualizer = ExtensionState_1.State.getVisualizer(castParams.uri);
            visualizer.storeNewStates(castParams);
        }
        catch (e) {
            Log_1.Log.error("Error handling steps as decoration options notification: " + e);
        }
    });
    state.client.onRequest(ViperProtocol_1.Commands.HeapGraph, (heapGraph) => {
        try {
            if (!heapGraph)
                return;
            if (Helper_1.Helper.getConfiguration("advancedFeatures").enabled === true) {
                let visualizer = ExtensionState_1.State.getVisualizer(heapGraph.fileUri);
                let state = visualizer.decorationOptions[heapGraph.state];
                if (Helper_1.Helper.getConfiguration("advancedFeatures").simpleMode === true) {
                    //Simple Mode
                    if (state.isErrorState) {
                        //replace the error state
                        visualizer.focusOnState(heapGraph);
                    }
                    else {
                        //replace the execution state
                        visualizer.setState(heapGraph);
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
            let visualizer = ExtensionState_1.State.getVisualizer(uri);
            if (visualizer) {
                visualizer.showStateSelection(start);
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
            let visualizer = State.viperFiles.get(castChange.uri).stateVisualizer;
            visualizer.showStateSelection({ line: castChange.line, character: castChange.character });
        } catch (e) {
            Log.error("Error handling state selected request: " + e);
        }
    });*/
    state.client.onNotification(ViperProtocol_1.Commands.VerificationNotStarted, uri => {
        try {
            Log_1.Log.log("Verification not started for " + path.basename(uri), ViperProtocol_1.LogLevel.Debug);
            //reset the verifying flag if it is not beeing verified
            ExtensionState_1.State.viperFiles.forEach(file => {
                file.verifying = false;
            });
            ExtensionState_1.State.isVerifying = false;
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
        if (!vscode.window.activeTextEditor) {
            Log_1.Log.log("Cannot verify, no document is open.");
        }
        else {
            workList.push({ type: TaskType.Verify, uri: vscode.window.activeTextEditor.document.uri, manuallyTriggered: true });
        }
    }));
    //verifyAllFilesInWorkspace
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.verifyAllFilesInWorkspace', () => {
        verifyAllFilesInWorkspace();
    }));
    //toggleAutoVerify
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.toggleAutoVerify', () => {
        toggleAutoVerify();
    }));
    //showAllStates
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.showAllStates', () => {
        if (ExtensionState_1.State.isDebugging) {
            let viperFile = ExtensionState_1.State.getLastActiveFile();
            if ((!Helper_1.Helper.getConfiguration("advancedFeatures").simpleMode === true) && viperFile) {
                viperFile.stateVisualizer.showAllDecorations();
            }
        }
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
            //check if all the requirements are met to start debugging
            let canDebug = canStartDebugging();
            if (canDebug.result) {
                let uri = ExtensionState_1.State.getLastActiveFile().uri;
                let filename = path.basename(uri.toString());
                let openDoc = uri.path;
                if (ExtensionState_1.State.isWin) {
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
                };
                if (ExtensionState_1.State.isDebugging) {
                    Log_1.Log.hint("Don't debug " + filename + ", the file is already being debugged");
                    return;
                }
                showStates(() => {
                    vscode.commands.executeCommand('vscode.startDebug', launchConfig).then(() => {
                        Log_1.Log.log('Debug session started successfully', ViperProtocol_1.LogLevel.Info);
                        ExtensionState_1.State.isDebugging = true;
                        vscode.commands.executeCommand("workbench.view.debug");
                    }, err => {
                        Log_1.Log.error("Error starting debugger: " + err.message);
                    });
                });
            }
            else if (canDebug.reason) {
                Log_1.Log.hint(canDebug.reason);
            }
        }
        catch (e) {
            Log_1.Log.error("Error starting debug session: " + e);
        }
    }));
    //stopVerification
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.stopVerification', () => {
        if (verifyingAllFiles) {
            printAllVerificationResults();
            verifyingAllFiles = false;
        }
        if (state.client) {
            if (ExtensionState_1.State.isVerifying) {
                clearInterval(progressUpdater);
                Log_1.Log.log("Verification stop request", ViperProtocol_1.LogLevel.Debug);
                abortButton.hide();
                statusBarItem.color = 'orange';
                statusBarItem.text = "aborting";
                statusBarProgress.hide();
                state.client.sendNotification(ViperProtocol_1.Commands.StopVerification, ExtensionState_1.State.getLastActiveFile().uri.toString());
            }
            else {
                Log_1.Log.hint("Cannot stop the verification, no verification is running.");
            }
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
                if (!textDocument) {
                    Log_1.Log.hint("Cannot open the logFile, it is too large to be opened within VSCode.");
                }
                else {
                    vscode.window.showTextDocument(textDocument, vscode.ViewColumn.Two).then(() => {
                        Log_1.Log.log("Showing logfile succeeded", ViperProtocol_1.LogLevel.Debug);
                    }, error => {
                        Log_1.Log.error("vscode.window.showTextDocument call failed while opening the logfile: " + error);
                    });
                }
            }, error => {
                Log_1.Log.error("vscode.window.openTextDocument call failed while opening the logfile: " + error);
            });
        }
        catch (e) {
            Log_1.Log.error("Error opening logFile: " + e);
        }
    }));
    //remove diagnostics of open file
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.removeDiagnostics', () => {
        removeDiagnostics();
    }));
}
function startBackend(backendName) {
    try {
        ExtensionState_1.State.isBackendReady = false;
        state.client.sendNotification(ViperProtocol_1.Commands.StartBackend, backendName);
    }
    catch (e) {
        Log_1.Log.error("Error starting backend: " + e);
    }
}
function handleBackendReadyNotification(params) {
    try {
        ExtensionState_1.State.isBackendReady = true;
        Log_1.Log.log("Backend ready: " + params.name, ViperProtocol_1.LogLevel.Info);
        updateStatusBarItem(statusBarItem, "ready", 'white');
        //automatically trigger the first verification
        if (params.restarted) {
            //no file is verifying
            ExtensionState_1.State.resetViperFiles();
            if (ExtensionState_1.State.getLastActiveFile() && Helper_1.Helper.getConfiguration('preferences').autoVerifyAfterBackendChange === true) {
                Log_1.Log.log("autoVerify after backend change", ViperProtocol_1.LogLevel.Info);
                workList.push({ type: TaskType.Verify, uri: ExtensionState_1.State.getLastActiveFile().uri, manuallyTriggered: false });
            }
        }
        if (isUnitTest && unitTestResolve) {
            unitTestResolve("BackendReady");
        }
    }
    catch (e) {
        Log_1.Log.error("Error handling backend started notification: " + e);
    }
}
function stopDebuggingOnServer() {
    if (ExtensionState_1.State.isDebugging) {
        Log_1.Log.log("Tell language server to stop debugging", ViperProtocol_1.LogLevel.Debug);
        state.client.sendNotification(ViperProtocol_1.Commands.StopDebugging);
    }
}
function stopDebuggingLocally() {
    try {
        if (ExtensionState_1.State.isDebugging) {
            Log_1.Log.log("Stop Debugging", ViperProtocol_1.LogLevel.Info);
            let visualizer = ExtensionState_1.State.getLastActiveFile().stateVisualizer;
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
            let visualizer = ExtensionState_1.State.getLastActiveFile().stateVisualizer;
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
        let editor = visualizer.viperFile.editor;
        //vscode.window.showTextDocument(editor.document, editor.viewColumn).then(() => {  
        vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup').then(success => { }, error => {
            Log_1.Log.error("Error changing the focus to the first editorGroup");
        });
        ExtensionState_1.State.isDebugging = false;
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
    clearInterval(progressUpdater);
    lastProgress = 0;
    //load expected timing
    let expectedTimings = fileState.stateVisualizer.getLastTiming();
    if (expectedTimings && expectedTimings.total) {
        Log_1.Log.log("Verification is expected to take " + formatSeconds(expectedTimings.total), ViperProtocol_1.LogLevel.Info);
        oldTimings = expectedTimings;
    }
    let uri = fileState.uri.toString();
    if (Helper_1.Helper.isViperSourceFile(uri)) {
        if (!state.client) {
            Log_1.Log.hint("Extension not ready yet.");
        }
        else {
            let visualizer = ExtensionState_1.State.getVisualizer(uri);
            visualizer.completeReset();
            hideStates(() => {
                //delete old SymbExLog:
                //Log.deleteFile(Log.getSymbExLogPath());
                //change fileState
                fileState.changed = false;
                fileState.verified = false;
                fileState.verifying = true;
                ExtensionState_1.State.isVerifying = true;
                //start progress updater
                clearInterval(progressUpdater);
                progressUpdater = setInterval(() => {
                    let progress = getProgress(lastProgress);
                    if (progress != lastProgress) {
                        lastProgress = progress;
                        let totalProgress = verifyingAllFiles ? ` (${nextFileToAutoVerify + 1}/${allFilesToAutoVerify.length})` : "";
                        Log_1.Log.log("Progress: " + progress, ViperProtocol_1.LogLevel.Debug);
                        statusBarProgress.text = progressBarText(progress);
                        statusBarItem.text = progressLabel + " " + formatProgress(progress) + totalProgress;
                    }
                }, 500);
                Log_1.Log.log("Request verification for " + path.basename(uri), ViperProtocol_1.LogLevel.Verbose);
                let workspace = vscode.workspace.rootPath ? vscode.workspace.rootPath : path.dirname(fileState.uri.fsPath);
                let params = { uri: uri, manuallyTriggered: manuallyTriggered, workspace: workspace };
                state.client.sendNotification(ViperProtocol_1.Commands.Verify, params);
            }, visualizer);
        }
        //in case a debugging session is still running, stop it
        stopDebuggingOnServer();
        stopDebuggingLocally();
    }
}
function addTiming(paramProgress, color, hide = false) {
    let showProgressBar = Helper_1.Helper.getConfiguration('preferences').showProgress === true;
    timings.push(Date.now() - verificationStartTime);
    let progress = getProgress(paramProgress || 0);
    Log_1.Log.log("Progress: " + progress, ViperProtocol_1.LogLevel.Debug);
    let totalProgress = verifyingAllFiles ? ` (${nextFileToAutoVerify + 1}/${allFilesToAutoVerify.length})` : "";
    lastProgress = progress;
    if (hide)
        statusBarProgress.hide();
    else {
        updateStatusBarItem(statusBarProgress, progressBarText(progress), 'white', null, showProgressBar);
        updateStatusBarItem(statusBarItem, progressLabel + " " + formatProgress(progress) + totalProgress, color);
    }
}
function getProgress(progress) {
    try {
        let timeSpentUntilLastStep = timings.length > 0 ? timings[timings.length - 1] : 0;
        let timeAlreadySpent = Date.now() - verificationStartTime;
        if (oldTimings && oldTimings.timings) {
            let old = oldTimings.timings;
            if (old.length >= timings.length) {
                let timeSpentLastTime = timings.length > 0 ? old[timings.length - 1] : 0;
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
function removeDiagnostics() {
    if (vscode.window.activeTextEditor) {
        let file = vscode.window.activeTextEditor.document.uri.toString();
        state.client.sendRequest(ViperProtocol_1.Commands.RemoveDiagnostics, file).then(success => {
            if (success) {
                Log_1.Log.log("Diagnostics successfully removed");
            }
            else {
                Log_1.Log.log("Removing diagnostics failed");
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2V4dGVuc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFLYixNQUFZLElBQUksV0FBTSxNQUFNLENBQUMsQ0FBQTtBQUM3Qix3QkFBc0IsU0FBUyxDQUFDLENBQUE7QUFDaEMsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsaUNBQXNCLGtCQUFrQixDQUFDLENBQUE7QUFDekMsZ0NBQStOLGlCQUFpQixDQUFDLENBQUE7QUFDalAsd0JBQWdCLHNCQUFzQixDQUFDLENBQUE7QUFDdkMsc0JBQW9CLE9BQU8sQ0FBQyxDQUFBO0FBQzVCLGtDQUFxRCxtQkFBbUIsQ0FBQyxDQUFBO0FBQ3pFLHlCQUF1QixVQUFVLENBQUMsQ0FBQTtBQUNsQyxpQ0FBK0Isa0JBQWtCLENBQUMsQ0FBQTtBQUdsRCxJQUFJLGFBQWEsQ0FBQztBQUNsQixJQUFJLGlCQUFpQixDQUFDO0FBQ3RCLElBQUksZ0JBQWdCLENBQUM7QUFDckIsSUFBSSxXQUFXLENBQUM7QUFDaEIsSUFBSSxTQUFnQixDQUFDO0FBQ3JCLElBQUksS0FBWSxDQUFDO0FBRWpCLElBQUksc0JBQTZCLENBQUM7QUFDbEMsSUFBSSxpQkFBMkMsQ0FBQztBQUNoRCxJQUFJLFNBQXlCLENBQUM7QUFDOUIsSUFBSSxRQUFnQixDQUFDO0FBRXJCLHVDQUF1QztBQUV2QyxhQUFhO0FBQ2IsSUFBSSxxQkFBNkIsQ0FBQztBQUNsQyxJQUFJLE9BQWlCLENBQUM7QUFDdEIsSUFBSSxVQUFzQixDQUFDO0FBQzNCLElBQUksZUFBZSxDQUFDO0FBQ3BCLElBQUksWUFBb0IsQ0FBQztBQUN6QixJQUFJLGFBQWEsR0FBRyxFQUFFLENBQUM7QUFTdkIsSUFBSyxRQUVKO0FBRkQsV0FBSyxRQUFRO0lBQ1QsdUNBQUksQ0FBQTtJQUFFLDJDQUFNLENBQUE7SUFBRSx1Q0FBSSxDQUFBO0FBQ3RCLENB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