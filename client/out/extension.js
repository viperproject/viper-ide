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
        nailgunSettingsVersion: "0.2.15",
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
        console.log("deactivate");
        state.dispose().then(() => {
            console.log("state disposed");
            //TODO: make sure no doc contains special chars any more
            if (ExtensionState_1.State.getLastActiveFile()) {
                console.log("Removing special chars of last opened file.");
                ExtensionState_1.State.getLastActiveFile().stateVisualizer.removeSpecialCharacters(() => {
                    console.log("Close Log");
                    Log_1.Log.dispose();
                    console.log("Deactivated");
                    resolve();
                });
            }
            else {
                console.log("Close Log");
                Log_1.Log.dispose();
                console.log("Deactivated");
                resolve();
            }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2V4dGVuc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFLYixNQUFZLElBQUksV0FBTSxNQUFNLENBQUMsQ0FBQTtBQUM3Qix3QkFBc0IsU0FBUyxDQUFDLENBQUE7QUFDaEMsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsaUNBQXNCLGtCQUFrQixDQUFDLENBQUE7QUFDekMsZ0NBQStOLGlCQUFpQixDQUFDLENBQUE7QUFDalAsd0JBQWdCLHNCQUFzQixDQUFDLENBQUE7QUFDdkMsc0JBQW9CLE9BQU8sQ0FBQyxDQUFBO0FBQzVCLGtDQUFxRCxtQkFBbUIsQ0FBQyxDQUFBO0FBQ3pFLHlCQUF1QixVQUFVLENBQUMsQ0FBQTtBQUNsQyxpQ0FBK0Isa0JBQWtCLENBQUMsQ0FBQTtBQUdsRCxJQUFJLGFBQWEsQ0FBQztBQUNsQixJQUFJLGlCQUFpQixDQUFDO0FBQ3RCLElBQUksZ0JBQWdCLENBQUM7QUFDckIsSUFBSSxXQUFXLENBQUM7QUFDaEIsSUFBSSxTQUFnQixDQUFDO0FBQ3JCLElBQUksS0FBWSxDQUFDO0FBRWpCLElBQUksc0JBQTZCLENBQUM7QUFDbEMsSUFBSSxpQkFBMkMsQ0FBQztBQUNoRCxJQUFJLFNBQXlCLENBQUM7QUFDOUIsSUFBSSxRQUFnQixDQUFDO0FBRXJCLHVDQUF1QztBQUV2QyxhQUFhO0FBQ2IsSUFBSSxxQkFBNkIsQ0FBQztBQUNsQyxJQUFJLE9BQWlCLENBQUM7QUFDdEIsSUFBSSxVQUFzQixDQUFDO0FBQzNCLElBQUksZUFBZSxDQUFDO0FBQ3BCLElBQUksWUFBb0IsQ0FBQztBQUN6QixJQUFJLGFBQWEsR0FBRyxFQUFFLENBQUM7QUFTdkIsSUFBSyxRQUVKO0FBRkQsV0FBSyxRQUFRO0lBQ1QsdUNBQUksQ0FBQTtJQUFFLDJDQUFNLENBQUE7SUFBRSx1Q0FBSSxDQUFBO0FBQ3RCLENBQUMsRUFGSSxRQUFRLEtBQVIsUUFBUSxRQUVaO0FBRUQsSUFBSSxVQUFVLEdBQUcsS0FBSyxDQUFDO0FBQ3ZCLElBQUksZUFBZSxDQUFDO0FBRXBCLDRCQUFtQyxJQUFJO0lBQ25DLFVBQVUsR0FBRyxJQUFJLENBQUM7SUFDbEIsZUFBZSxHQUFHLElBQUksQ0FBQztJQUN2QixvQkFBb0I7QUFDeEIsQ0FBQztBQUplLDBCQUFrQixxQkFJakMsQ0FBQTtBQUVEO0lBRUksSUFBSSxPQUFPLEdBQStCLEVBQUUsQ0FBQTtJQUM1QyxPQUFPLENBQUMsSUFBSSxDQUFDO1FBQ1QsS0FBSyxFQUFFLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDN0UsYUFBYSxFQUFFO1lBQ1gsTUFBTSxFQUFFO2dCQUNKLFdBQVcsRUFBRSxZQUFZO2dCQUN6QixLQUFLLEVBQUUsS0FBSzthQUNmO1NBQ0o7S0FDSixDQUFDLENBQUM7SUFDSCxJQUFJLFVBQVUsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLDhCQUE4QixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3ZFLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztBQUN2RSxDQUFDO0FBRUQseURBQXlEO0FBQ3pELDBFQUEwRTtBQUMxRSxrQkFBeUIsT0FBZ0M7SUFDckQsU0FBRyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3ZELDZCQUE2QixHQUFHO1FBQzVCLHNCQUFzQixFQUFFLFFBQVE7UUFDaEMsc0JBQXNCLEVBQUUsUUFBUTtRQUNoQyxtQkFBbUIsRUFBRSxRQUFRO1FBQzdCLHNCQUFzQixFQUFFLFFBQVE7UUFDaEMsbUJBQW1CLEVBQUUsUUFBUTtRQUM3Qix1QkFBdUIsRUFBRSxPQUFPO0tBQ25DLENBQUE7SUFDRCxRQUFRLEdBQUcsRUFBRSxDQUFDO0lBQ2QsU0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQ2pCLFNBQUcsQ0FBQyxHQUFHLENBQUMsNkJBQTZCLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN0RCxLQUFLLEdBQUcsc0JBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUM1QixzQkFBSyxDQUFDLG9CQUFvQixFQUFFLENBQUM7SUFDN0IsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbEMsaUJBQWlCLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyxPQUFPLEdBQUcsZUFBTSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztJQUNoSCxLQUFLLENBQUMsbUJBQW1CLENBQUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsUUFBUTtJQUN0RSxnQkFBZ0IsRUFBRSxDQUFDO0lBQ25CLGNBQWMsRUFBRSxDQUFDO0lBQ2pCLG1CQUFtQixFQUFFLENBQUM7SUFDdEIsaUJBQWlCLEVBQUUsQ0FBQztJQUNwQixJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUM7SUFDdEQsc0JBQUssQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQzdELDJCQUEyQixFQUFFLENBQUM7SUFDOUIsc0JBQXNCO0FBQzFCLENBQUM7QUExQmUsZ0JBQVEsV0EwQnZCLENBQUE7QUFFRCxJQUFJLGlCQUFpQixHQUFHLEtBQUssQ0FBQztBQUM5QixJQUFJLG9CQUEyQixDQUFDO0FBQ2hDLElBQUksb0JBQTRCLENBQUM7QUFDakMsSUFBSSx1QkFBaUMsQ0FBQztBQUN0QyxJQUFJLHlCQUFpQyxDQUFDO0FBRXRDO0lBQ0kseUJBQXlCLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ3ZDLGlCQUFpQixHQUFHLElBQUksQ0FBQztJQUN6Qix1QkFBdUIsR0FBRyxFQUFFLENBQUM7SUFDN0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxzQkFBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7UUFDeEIsU0FBRyxDQUFDLEtBQUssQ0FBQyx5RUFBeUUsQ0FBQyxDQUFBO1FBQ3BGLE1BQU0sQ0FBQztJQUNYLENBQUM7SUFDRCxJQUFJLE9BQU8sR0FBRyxHQUFHLEdBQUcsZUFBTSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUM7SUFDNUQsTUFBTSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFXO1FBQzlELFNBQUcsQ0FBQyxHQUFHLENBQUMscUJBQXFCLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxlQUFlLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM5RSxvQkFBb0IsR0FBRyxJQUFJLENBQUM7UUFDNUIsb0JBQW9CLEdBQUcsQ0FBQyxDQUFDO1FBQ3pCLGNBQWMsRUFBRSxDQUFDO0lBQ3JCLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQztBQUVEO0lBQ0ksU0FBRyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEdBQUcsdUJBQXVCLENBQUMsTUFBTSxHQUFHLFlBQVksR0FBRyxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcseUJBQXlCLENBQUMsR0FBRyxJQUFJLENBQUMsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3JKLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxHQUFHO1FBQy9CLFNBQUcsQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEdBQUcsR0FBRyxFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDMUQsQ0FBQyxDQUFDLENBQUE7QUFDTixDQUFDO0FBRUQ7SUFDSSxNQUFNLENBQUMsSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTTtRQUMvQixFQUFFLENBQUMsQ0FBQyxvQkFBb0IsR0FBRyxvQkFBb0IsQ0FBQyxNQUFNLElBQUksaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1lBQzFFLElBQUksUUFBUSxHQUFHLG9CQUFvQixDQUFDLG9CQUFvQixDQUFDLENBQUM7WUFDMUQsU0FBRyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzVELG9CQUFvQixFQUFFLENBQUM7WUFDdkIsTUFBTSxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRO2dCQUN0RCxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQztvQkFDMUMsTUFBTSxDQUFDLHNCQUFLLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUM1QyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ2xCLENBQUMsQ0FBQyxDQUFBO1lBQ04sQ0FBQyxDQUFDLENBQUE7UUFDTixDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixpQkFBaUIsR0FBRyxLQUFLLENBQUM7WUFDMUIsMkJBQTJCLEVBQUUsQ0FBQztZQUM5QixPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDbkIsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQztBQUVELElBQUksNkJBQXVDLENBQUM7QUFFNUM7SUFDSSxJQUFJLENBQUM7UUFDRCxNQUFNLENBQUMsNkJBQTZCLENBQUM7SUFDekMsQ0FBRTtJQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLG1DQUFtQyxHQUFHLENBQUMsQ0FBQyxDQUFBO1FBQ2xELE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDaEIsQ0FBQztBQUNMLENBQUM7QUFRRDtJQUNJLElBQUksQ0FBQztRQUNELElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLE1BQWMsQ0FBQztRQUNuQixFQUFFLENBQUMsQ0FBQyxlQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxPQUFPLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztZQUMvRCxNQUFNLEdBQUcsMkVBQTJFLENBQUM7UUFDekYsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLHNCQUFLLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDcEMsTUFBTSxHQUFHLGtDQUFrQyxDQUFDO1FBQ2hELENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLElBQUksU0FBUyxHQUFHLHNCQUFLLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUMxQyxJQUFJLEdBQUcsR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDO1lBQ3hCLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDN0MsSUFBSSxlQUFlLEdBQUcsZUFBZSxRQUFRLElBQUksQ0FBQztZQUNsRCxFQUFFLENBQUMsQ0FBQyxDQUFDLHNCQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztnQkFDeEIsTUFBTSxHQUFHLGVBQWUsR0FBRywwQkFBMEIsQ0FBQztZQUMxRCxDQUFDO1lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLHNCQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztnQkFDM0IsTUFBTSxHQUFHLGVBQWUsR0FBRywyQkFBMkIsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQztZQUMzRSxDQUFDO1lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQzdCLE1BQU0sR0FBRyxlQUFlLEdBQUcsNERBQTRELEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUM7Z0JBQ3hHLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLGlCQUFpQixFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDakYsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztnQkFDakQsTUFBTSxHQUFHLGVBQWUsR0FBRyxxQ0FBcUMsQ0FBQztZQUNyRSxDQUFDO1lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLGVBQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLFVBQVUsS0FBSyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDN0osTUFBTSxHQUFHLGVBQWUsUUFBUSw4RUFBOEUsQ0FBQztZQUNuSCxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osTUFBTSxHQUFHLElBQUksQ0FBQztZQUNsQixDQUFDO1FBQ0wsQ0FBQztRQUNELE1BQU0sQ0FBQztZQUNILE1BQU0sRUFBRSxNQUFNO1lBQ2QsTUFBTSxFQUFFLE1BQU07WUFDZCxLQUFLLEVBQUUsSUFBSTtTQUNkLENBQUM7SUFDTixDQUFFO0lBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNULElBQUksS0FBSyxHQUFHLDZDQUE2QyxHQUFHLENBQUMsQ0FBQztRQUM5RCxTQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2pCLE1BQU0sQ0FBQztZQUNILE1BQU0sRUFBRSxLQUFLO1lBQ2IsTUFBTSxFQUFFLElBQUk7WUFDWixLQUFLLEVBQUUsS0FBSztTQUNmLENBQUM7SUFDTixDQUFDO0FBQ0wsQ0FBQztBQUVELDhCQUE4QixJQUFVO0lBQ3BDLElBQUksQ0FBQztRQUNELElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLE1BQWMsQ0FBQztRQUNuQixJQUFJLFVBQVUsR0FBRyxnQkFBZ0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLElBQUksQ0FBQztRQUN4RSxFQUFFLENBQUMsQ0FBQyxDQUFDLHNCQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztZQUN4QixNQUFNLEdBQUcsa0RBQWtELENBQUM7UUFDaEUsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osSUFBSSxVQUFVLENBQUM7WUFDZixJQUFJLFNBQVMsR0FBRyxzQkFBSyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDN0MsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pDLFVBQVUsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDeEUsQ0FBQztZQUNELEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQixJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztnQkFDekMsTUFBTSxHQUFHLFVBQVUsR0FBRyx5QkFBeUIsQ0FBQztZQUNwRCxDQUFDO1lBQ0QsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZCLE1BQU0sR0FBRyxVQUFVLEdBQUcsZ0JBQWdCLENBQUM7WUFDM0MsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsU0FBUyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7Z0JBQ25ELE1BQU0sR0FBRyxVQUFVLEdBQUcsOERBQThELENBQUM7WUFDekYsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsSUFBSSxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFDdkQsTUFBTSxHQUFHLFVBQVUsR0FBRyw0Q0FBNEMsQ0FBQztZQUN2RSxDQUFDO1lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztnQkFDckIsTUFBTSxHQUFHLFVBQVUsR0FBRyxtQkFBbUIsQ0FBQztZQUM5QyxDQUFDO1lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFVBQVUsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxHQUFHLFVBQVUsR0FBRyx3QkFBd0IsQ0FBQztZQUNuRCxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osTUFBTSxHQUFHLElBQUksQ0FBQztZQUNsQixDQUFDO1FBQ0wsQ0FBQztRQUNELE1BQU0sQ0FBQztZQUNILE1BQU0sRUFBRSxNQUFNO1lBQ2QsTUFBTSxFQUFFLE1BQU07WUFDZCxLQUFLLEVBQUUsSUFBSTtTQUNkLENBQUM7SUFDTixDQUFFO0lBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNULElBQUksS0FBSyxHQUFHLGdEQUFnRCxHQUFHLENBQUMsQ0FBQztRQUNqRSxTQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2pCLE1BQU0sQ0FBQztZQUNILE1BQU0sRUFBRSxLQUFLO1lBQ2IsTUFBTSxFQUFFLElBQUk7WUFDWixLQUFLLEVBQUUsS0FBSztTQUNmLENBQUM7SUFDTixDQUFDO0FBQ0wsQ0FBQztBQUVEO0lBQ0ksSUFBSSxtQkFBbUIsR0FBRyxHQUFHLENBQUMsQ0FBQSxJQUFJO0lBQ2xDLHNCQUFzQixHQUFHLElBQUksYUFBSyxDQUFDO1FBQy9CLElBQUksQ0FBQztZQUNELElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQztZQUNqQixJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFVixzQkFBc0I7WUFDdEIsT0FBTyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDOUQsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3JCLENBQUM7WUFFRCxPQUFPLENBQUMsSUFBSSxJQUFJLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ2xDLElBQUksSUFBSSxHQUFHLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN6QixFQUFFLENBQUMsQ0FBQyxDQUFDLGVBQU0sQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN0QyxJQUFJLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUM7b0JBQzFCLFNBQUcsQ0FBQyxHQUFHLENBQUMsOENBQThDLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDNUcsUUFBUSxDQUFDO2dCQUNiLENBQUM7Z0JBQ0QsSUFBSSxTQUFTLEdBQUcsc0JBQUssQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUM3QyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7b0JBQ2IsU0FBRyxDQUFDLEtBQUssQ0FBQyxzREFBc0QsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUN2SCxRQUFRLENBQUM7Z0JBQ2IsQ0FBQztnQkFDRCxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDaEIsS0FBSyxRQUFRLENBQUMsTUFBTTt3QkFDaEIsSUFBSSxTQUFTLEdBQUcsb0JBQW9CLENBQUMsSUFBSSxDQUFDLENBQUM7d0JBQzNDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDOzRCQUNuQixNQUFNLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO3dCQUM5QyxDQUFDO3dCQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQzs0QkFDMUIsU0FBRyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7d0JBQzdDLENBQUM7d0JBQ0QsSUFBSSxDQUFDLElBQUksR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDO3dCQUMxQixLQUFLLENBQUM7b0JBQ1YsS0FBSyxRQUFRLENBQUMsSUFBSTt3QkFDZCxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDOzRCQUNwQyxTQUFTLENBQUMsdUJBQXVCLEdBQUcsS0FBSyxDQUFDO3dCQUM5QyxDQUFDO3dCQUFDLElBQUksQ0FBQyxDQUFDOzRCQUNKLHVGQUF1Rjs0QkFDdkYsU0FBUyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7NEJBQ3pCLFNBQVMsQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDOzRCQUMzQixxQkFBcUIsRUFBRSxDQUFDOzRCQUN4QixvQkFBb0IsRUFBRSxDQUFDOzRCQUN2QixRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQzt3QkFDdEYsQ0FBQzt3QkFDRCxJQUFJLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUM7d0JBQzFCLEtBQUssQ0FBQztnQkFDZCxDQUFDO1lBQ0wsQ0FBQztRQUNMLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNwRCxRQUFRLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDckIsQ0FBQztJQUNMLENBQUMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO0lBQ3hCLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO0lBRXpELHVDQUF1QztJQUN2QyxLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQywyQkFBMkIsQ0FBQztRQUN2RSxJQUFJLENBQUM7WUFDRCxJQUFJLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDO1lBQzVDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ1QsSUFBSSxHQUFHLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUM7Z0JBQzlCLEVBQUUsQ0FBQyxDQUFDLGVBQU0sQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzNDLElBQUksWUFBWSxHQUFtQixzQkFBSyxDQUFDLGlCQUFpQixFQUFFLENBQUM7b0JBQzdELEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7d0JBQ2YsOEVBQThFO3dCQUM5RSxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxLQUFLLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7NEJBQ2pELFlBQVksQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7NEJBQ3RDLFlBQVksQ0FBQyxlQUFlLENBQUMsb0NBQW9DLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQzs0QkFDN0UscUJBQXFCLEVBQUUsQ0FBQzs0QkFDeEIsb0JBQW9CLEVBQUUsQ0FBQzt3QkFDM0IsQ0FBQztvQkFDTCxDQUFDO29CQUNELElBQUksU0FBUyxHQUFHLHNCQUFLLENBQUMsaUJBQWlCLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO29CQUNyRCxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO3dCQUNaLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7NEJBQ3RCLFNBQUcsQ0FBQyxHQUFHLENBQUMsaURBQWlELEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQzs0QkFDM0UsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQTt3QkFDaEYsQ0FBQzt3QkFBQyxJQUFJLENBQUMsQ0FBQzs0QkFDSixTQUFHLENBQUMsR0FBRyxDQUFDLDhDQUE4QyxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7d0JBQzVFLENBQUM7d0JBQ0QsU0FBRyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQzVGLENBQUM7Z0JBQ0wsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsNENBQTRDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDaEUsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDUixDQUFDO0FBRUQ7SUFDSSxNQUFNLENBQUMsSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTTtRQUMvQixPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQzFCLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxJQUFJLENBQUM7WUFDakIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1lBQzlCLHdEQUF3RDtZQUN4RCxFQUFFLENBQUMsQ0FBQyxzQkFBSyxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM1QixPQUFPLENBQUMsR0FBRyxDQUFDLDZDQUE2QyxDQUFDLENBQUM7Z0JBQzNELHNCQUFLLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxlQUFlLENBQUMsdUJBQXVCLENBQUM7b0JBQzlELE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7b0JBQ3pCLFNBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDZCxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFBO29CQUMxQixPQUFPLEVBQUUsQ0FBQztnQkFDZCxDQUFDLENBQUMsQ0FBQztZQUNQLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO2dCQUN6QixTQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQTtnQkFDMUIsT0FBTyxFQUFFLENBQUM7WUFDZCxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDLENBQUMsQ0FBQztBQUNQLENBQUM7QUF0QmUsa0JBQVUsYUFzQnpCLENBQUE7QUFFRDtJQUNJLFNBQVMsR0FBRyxJQUFJLCtCQUFjLEVBQUUsQ0FBQztBQUNyQyxDQUFDO0FBRUQ7SUFDSSxpQkFBaUIsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDMUYsYUFBYSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN0RixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsa0JBQWtCLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFFaEUsV0FBVyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNuRixXQUFXLENBQUMsT0FBTyxHQUFHLDRCQUE0QixDQUFDO0lBQ25ELG1CQUFtQixDQUFDLFdBQVcsRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQTtJQUVwRSxLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUNwRCxLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDaEQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBRTlDLGdCQUFnQixHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztBQUM3RixDQUFDO0FBRUQsNkJBQTZCLElBQUksRUFBRSxJQUFZLEVBQUUsS0FBYSxFQUFFLE9BQU8sR0FBVyxJQUFJLEVBQUUsSUFBSSxHQUFZLElBQUk7SUFDeEcsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7SUFDakIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7SUFDbkIsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7SUFDdkIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNQLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNoQixDQUFDO0lBQUMsSUFBSSxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDaEIsQ0FBQztBQUNMLENBQUM7QUFFRCxJQUFJLFVBQVUsR0FBWSxJQUFJLENBQUM7QUFFL0I7SUFDSSxVQUFVLEdBQUcsQ0FBQyxVQUFVLENBQUM7SUFDekIsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUNiLGFBQWEsQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDO1FBQzlCLGFBQWEsQ0FBQyxJQUFJLEdBQUcsaUJBQWlCLEdBQUcsQ0FBQyxVQUFVLEdBQUcsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDO0lBQ3pFLENBQUM7QUFDTCxDQUFDO0FBRUQ7SUFDSSxJQUFJLGVBQWUsR0FBRyxJQUFJLENBQUMsQ0FBQSxJQUFJO0lBQy9CLFNBQVMsR0FBRyxJQUFJLGFBQUssQ0FBQztRQUNsQix1QkFBdUI7UUFDdkIsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsSUFBSSxJQUFJLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsVUFBVSxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDMUcsRUFBRSxDQUFDLENBQUMsZUFBTSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxDQUFDLFFBQVEsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUMzRCxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNuRCxDQUFDO1FBQ0wsQ0FBQztJQUNMLENBQUMsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUVwQixLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFFNUMsSUFBSSxrQ0FBa0MsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLDJCQUEyQixDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ25HLElBQUksMkJBQTJCLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyw4QkFBOEIsQ0FBQyxlQUFlO1FBQzFGLEVBQUUsQ0FBQyxDQUFDLGVBQU0sQ0FBQyxpQkFBaUIsQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEUsY0FBYyxFQUFFLENBQUM7UUFDckIsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0gsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLGtDQUFrQyxDQUFDLENBQUM7SUFDckUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLENBQUM7QUFDbEUsQ0FBQztBQUVEO0lBQ0ksU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO0FBQ3RCLENBQUM7QUFFRCxJQUFJLFNBQVMsR0FBc0IsaUNBQWlCLENBQUMsT0FBTyxDQUFDO0FBRTdELDJCQUEyQixNQUF5QjtJQUNoRCxJQUFJLENBQUM7UUFDRCxTQUFTLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQztRQUM1QixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7WUFDakIsU0FBRyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsR0FBRyxpQ0FBaUIsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN2RixJQUFJLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO1FBQzNCLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQ3RCLEtBQUssaUNBQWlCLENBQUMsUUFBUTtnQkFDM0Isc0JBQUssQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDO2dCQUM3QixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUN6RCxLQUFLLENBQUM7WUFDVixLQUFLLGlDQUFpQixDQUFDLG1CQUFtQjtnQkFDdEMsYUFBYSxHQUFHLGFBQWEsTUFBTSxDQUFDLFFBQVEsR0FBRyxDQUFDO2dCQUNoRCxTQUFTLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFDckMsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNuQixLQUFLLENBQUM7WUFDVixLQUFLLGlDQUFpQixDQUFDLGNBQWM7Z0JBQ2pDLGFBQWEsR0FBRyxrQkFBa0IsTUFBTSxDQUFDLFFBQVEsR0FBRyxDQUFDO2dCQUNyRCxTQUFTLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDcEMsS0FBSyxDQUFDO1lBQ1YsS0FBSyxpQ0FBaUIsQ0FBQyxLQUFLO2dCQUN4QixTQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUMsS0FBSyxHQUFHLE9BQU8sR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzNELG1CQUFtQixDQUFDLGFBQWEsRUFBRSxRQUFRLE1BQU0sQ0FBQyxRQUFRLFdBQVcsTUFBTSxDQUFDLEtBQUssRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ2xHLEtBQUssaUNBQWlCLENBQUMsS0FBSztnQkFDeEIsYUFBYSxDQUFDLGVBQWUsQ0FBQyxDQUFDO2dCQUMvQixpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDekIsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUVuQixzQkFBSyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSTtvQkFDekIsSUFBSSxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7Z0JBQzNCLENBQUMsQ0FBQyxDQUFDO2dCQUNILHNCQUFLLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztnQkFFMUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDO29CQUNoQyxtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUN6RCxDQUFDO2dCQUNELElBQUksQ0FBQyxDQUFDO29CQUNGLElBQUksR0FBRyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFFdkMsdUhBQXVIO29CQUN2SCxzQkFBSyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDLENBQUM7b0JBRXhELElBQUksWUFBWSxHQUFHLHNCQUFLLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDbEQsWUFBWSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDO29CQUN0QyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxJQUFJLHVCQUFPLENBQUMsT0FBTyxJQUFJLE1BQU0sQ0FBQyxPQUFPLElBQUksdUJBQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO3dCQUN2RSxZQUFZLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztvQkFDakMsQ0FBQztvQkFFRCxpQ0FBaUM7b0JBQ2pDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUM5QixFQUFFLENBQUMsQ0FBQyxlQUFNLENBQUMsZ0JBQWdCLENBQUMsYUFBYSxDQUFDLENBQUMsWUFBWSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7d0JBQy9ELFlBQVksQ0FBQyxlQUFlLENBQUMsK0JBQStCLENBQUMsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztvQkFDM0csQ0FBQztvQkFDRCw2RkFBNkY7b0JBQzdGLElBQUksR0FBRyxHQUFXLEVBQUUsQ0FBQztvQkFDckIsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7d0JBQ3JCLEtBQUssdUJBQU8sQ0FBQyxPQUFPOzRCQUNoQixHQUFHLEdBQUcseUJBQXlCLE1BQU0sQ0FBQyxRQUFRLE9BQU8sYUFBYSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDOzRCQUNsRixTQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSx3QkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDOzRCQUMvQixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsV0FBVyxHQUFHLEdBQUcsRUFBRSxZQUFZLENBQUMsQ0FBQzs0QkFDcEUsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDO2dDQUFDLFNBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7NEJBQzVDLGlGQUFpRjs0QkFDakYsMkRBQTJEOzRCQUMzRDs7OzsrQkFJRzs0QkFDSCxLQUFLLENBQUM7d0JBQ1YsS0FBSyx1QkFBTyxDQUFDLGFBQWE7NEJBQ3RCLEdBQUcsR0FBRyxXQUFXLE1BQU0sQ0FBQyxRQUFRLGlCQUFpQixhQUFhLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7NEJBQzlFLFNBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLHdCQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7NEJBQy9CLG1CQUFtQixDQUFDLGFBQWEsRUFBRSxPQUFPLEdBQUcsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDOzRCQUN6RCxLQUFLLENBQUM7d0JBQ1YsS0FBSyx1QkFBTyxDQUFDLGtCQUFrQjs0QkFDM0IsR0FBRyxHQUFHLGlCQUFpQixNQUFNLENBQUMsUUFBUSxpQkFBaUIsYUFBYSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxNQUFNLENBQUMsU0FBUyxTQUFTLE1BQU0sQ0FBQyxTQUFTLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxFQUFFLEVBQUUsQ0FBQzs0QkFDdEosU0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsd0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQzs0QkFDL0IsbUJBQW1CLENBQUMsYUFBYSxFQUFFLE9BQU8sR0FBRyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7NEJBQ3pELEtBQUssQ0FBQzt3QkFDVixLQUFLLHVCQUFPLENBQUMsa0JBQWtCOzRCQUMzQixHQUFHLEdBQUcsYUFBYSxNQUFNLENBQUMsUUFBUSxpQkFBaUIsYUFBYSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxNQUFNLENBQUMsU0FBUyxTQUFTLE1BQU0sQ0FBQyxTQUFTLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxFQUFFLEVBQUUsQ0FBQzs0QkFDbEosU0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsd0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQzs0QkFDL0IsbUJBQW1CLENBQUMsYUFBYSxFQUFFLE9BQU8sR0FBRyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7NEJBQ3pELEtBQUssQ0FBQzt3QkFDVixLQUFLLHVCQUFPLENBQUMsT0FBTzs0QkFDaEIsbUJBQW1CLENBQUMsYUFBYSxFQUFFLHNCQUFzQixFQUFFLFFBQVEsQ0FBQyxDQUFDOzRCQUNyRSxTQUFHLENBQUMsR0FBRyxDQUFDLGFBQWEsTUFBTSxDQUFDLFFBQVEsY0FBYyxFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7NEJBQ25FLEtBQUssQ0FBQzt3QkFDVixLQUFLLHVCQUFPLENBQUMsS0FBSzs0QkFDZCxJQUFJLFFBQVEsR0FBRywwQ0FBMEMsQ0FBQTs0QkFDekQsbUJBQW1CLENBQUMsYUFBYSxFQUFFLHFCQUFxQixHQUFHLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQzs0QkFDNUUsR0FBRyxHQUFHLGFBQWEsTUFBTSxDQUFDLFFBQVEsa0NBQWtDLENBQUM7NEJBQ3JFLFNBQUcsQ0FBQyxHQUFHLENBQUMsb0NBQW9DLE1BQU0sQ0FBQyxRQUFRLFlBQVksR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxLQUFLLEdBQUcsK0VBQStFLENBQUMsQ0FBQyxDQUFDOzRCQUN0TixTQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxRQUFRLENBQUMsQ0FBQzs0QkFDekIsS0FBSyxDQUFDO3dCQUNWLEtBQUssdUJBQU8sQ0FBQyxPQUFPOzRCQUNoQixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsd0JBQXdCLEVBQUUsUUFBUSxDQUFDLENBQUM7NEJBQ3ZFLFNBQUcsQ0FBQyxHQUFHLENBQUMsYUFBYSxNQUFNLENBQUMsUUFBUSxZQUFZLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQzs0QkFDakUsS0FBSyxDQUFDO29CQUNkLENBQUM7b0JBQ0QsRUFBRSxDQUFDLENBQUMsVUFBVSxJQUFJLGVBQWUsQ0FBQyxDQUFDLENBQUM7d0JBQ2hDLEVBQUUsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7NEJBQ3hDLGVBQWUsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO3dCQUM3QyxDQUFDO29CQUNMLENBQUM7Z0JBQ0wsQ0FBQztnQkFDRCxFQUFFLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7b0JBQ3BCLHVCQUF1QixDQUFDLElBQUksQ0FBQyxHQUFHLHVCQUFPLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLGVBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7b0JBQzVGLGNBQWMsRUFBRSxDQUFDO2dCQUNyQixDQUFDO2dCQUNELEtBQUssQ0FBQztZQUNWLEtBQUssaUNBQWlCLENBQUMsUUFBUTtnQkFDM0IsbUJBQW1CLENBQUMsYUFBYSxFQUFFLFdBQVcsRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFDMUQsS0FBSyxDQUFDO1lBQ1YsS0FBSyxpQ0FBaUIsQ0FBQyxPQUFPO2dCQUMxQixhQUFhLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQy9CLG1CQUFtQixDQUFDLGFBQWEsRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQ3ZELEtBQUssQ0FBQztZQUNWO2dCQUNJLEtBQUssQ0FBQztRQUNkLENBQUM7SUFDTCxDQUFFO0lBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsK0JBQStCLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDbkQsQ0FBQztBQUNMLENBQUM7QUFFRCwrQkFBK0IsT0FBZ0I7SUFDM0MsTUFBTSxDQUFDLE9BQU8sSUFBSSx1QkFBTyxDQUFDLE9BQU87V0FDMUIsT0FBTyxJQUFJLHVCQUFPLENBQUMsYUFBYTtXQUNoQyxPQUFPLElBQUksdUJBQU8sQ0FBQyxrQkFBa0I7V0FDckMsT0FBTyxJQUFJLHVCQUFPLENBQUMsa0JBQWtCLENBQUM7QUFDakQsQ0FBQztBQUVELG1DQUFtQyxNQUE2QjtJQUM1RCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO1FBQ2xCLElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztRQUNwQixJQUFJLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDakIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSztZQUN2QixNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDakIsS0FBSyxpQ0FBaUIsQ0FBQyxLQUFLO29CQUN4QixTQUFTLEVBQUUsQ0FBQztvQkFDWixTQUFHLENBQUMsS0FBSyxDQUFDLGtCQUFrQixHQUFHLEtBQUssQ0FBQyxHQUFHLEVBQUUsd0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFDNUQsS0FBSyxDQUFDO2dCQUNWLEtBQUssaUNBQWlCLENBQUMsT0FBTztvQkFDMUIsV0FBVyxFQUFFLENBQUM7b0JBQ2QsU0FBRyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQzFDLEtBQUssQ0FBQztZQUNkLENBQUM7WUFDRCxPQUFPLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQztRQUN4QixDQUFDLENBQUMsQ0FBQTtRQUVGLElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLFNBQVMsR0FBRyxRQUFRLEdBQUcsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsV0FBVyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxXQUFXLEdBQUcsVUFBVSxHQUFHLENBQUMsV0FBVyxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBRXRNLG1CQUFtQjtRQUNuQixTQUFHLENBQUMsR0FBRyxDQUFDLFdBQVcsR0FBRyx3QkFBd0IsRUFBRSx3QkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2xFLGFBQWEsQ0FBQyxJQUFJLEdBQUcsV0FBVyxHQUFHLGNBQWMsQ0FBQztRQUNsRCxFQUFFLENBQUMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoQixhQUFhLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztZQUM1QixzQkFBSyxDQUFDLGNBQWMsR0FBRyxLQUFLLENBQUM7UUFDakMsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6QixhQUFhLENBQUMsS0FBSyxHQUFHLFFBQVEsQ0FBQztRQUNuQyxDQUFDO1FBRUQsRUFBRSxDQUFDLENBQUMsU0FBUyxHQUFHLFdBQVcsR0FBRyxDQUFDLENBQUM7WUFBQyxPQUFPLEdBQUcseUJBQXlCLENBQUM7UUFFckUsSUFBSSxrQkFBa0IsR0FBdUIsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQztRQUM3RSxJQUFJLHVCQUF1QixHQUF1QixFQUFFLEtBQUssRUFBRSx5QkFBeUIsRUFBRSxDQUFDO1FBQ3ZGLE1BQU0sQ0FBQyxNQUFNLENBQUMsc0JBQXNCLENBQUMsa0JBQWtCLEdBQUcsV0FBVyxHQUFHLElBQUksR0FBRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNO1lBQzdJLElBQUksQ0FBQztnQkFDRCxFQUFFLENBQUMsQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLEtBQUssS0FBSyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUMzRCxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFBO2dCQUM1RSxDQUFDO2dCQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLEtBQUssS0FBSyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUM3RCxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFBO2dCQUN6RSxDQUFDO1lBQ0wsQ0FBRTtZQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsR0FBRyxNQUFNLENBQUMsS0FBSyxHQUFHLGFBQWEsR0FBRyxDQUFDLENBQUMsQ0FBQTtZQUNwRSxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0FBQ0wsQ0FBQztBQUVEO0lBRUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxNQUF5QixLQUFLLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFDNUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxJQUEyQixLQUFLLHlCQUF5QixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDeEgsS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFZO1FBQ3BELFNBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbkIsQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQXlDO1FBQ2hGLFNBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxTQUFHLENBQUMsUUFBUSxJQUFJLHdCQUFRLENBQUMsS0FBSyxHQUFHLEtBQUssR0FBRyxFQUFFLENBQUMsR0FBRyxHQUFHLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNwRixDQUFDLENBQUMsQ0FBQztJQUNILEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsU0FBUyxFQUFFLENBQUMsR0FBeUM7UUFDdEYsU0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFNBQUcsQ0FBQyxRQUFRLElBQUksd0JBQVEsQ0FBQyxLQUFLLEdBQUcsS0FBSyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzFGLENBQUMsQ0FBQyxDQUFDO0lBQ0gsS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxHQUF5QztRQUNsRixTQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsU0FBRyxDQUFDLFFBQVEsSUFBSSx3QkFBUSxDQUFDLEtBQUssR0FBRyxLQUFLLEdBQUcsRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDdEYsQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLGFBQWEsRUFBRSxDQUFDLFVBQWtCO1FBQ25FLElBQUksQ0FBQztZQUNELG1CQUFtQixDQUFDLGdCQUFnQixFQUFFLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUMzRCxzQkFBSyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2xCLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyxpQ0FBaUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNyRCxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLFVBQVUsRUFBRSxDQUFDLEdBQVc7UUFDekQsSUFBSSxDQUFDO1lBQ0QsU0FBRyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDOUQsSUFBSSxTQUFTLEdBQVEsZUFBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQyxJQUFJLFNBQVMsR0FBRyxzQkFBSyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN4QyxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUNaLFNBQVMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO2dCQUN0QixTQUFTLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztZQUNoQyxDQUFDO1lBQ0QsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxTQUFTLEVBQUUsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUN2RixDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsMkNBQTJDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDL0QsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0gsS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxHQUFXO1FBQ3pELElBQUksQ0FBQztZQUNELElBQUksU0FBUyxHQUFRLGVBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsU0FBRyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN4RSxJQUFJLFNBQVMsR0FBRyxzQkFBSyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN4QyxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUNaLFNBQVMsQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDO2dCQUN2QixTQUFTLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztZQUMvQixDQUFDO1lBQ0QsU0FBUyxDQUFDLGVBQWUsQ0FBQyxvQ0FBb0MsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQzlFLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQywyQ0FBMkMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUMvRCxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyx3QkFBUSxDQUFDLHNCQUFzQixFQUFFO1FBQ3BELE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO0lBQ2hDLENBQUMsQ0FBQyxDQUFDO0lBQ0gsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMscUJBQXFCLENBQUMsQ0FBQyxNQUFNO1FBQzNFLElBQUksQ0FBQztZQUNELFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDNUQsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLGlDQUFpQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3JELENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0osS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsd0JBQXdCLENBQUM7UUFDdkUsSUFBSSxDQUFDO1lBQ0QsU0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3JCLHFCQUFxQixFQUFFLENBQUM7WUFDeEIsb0JBQW9CLEVBQUUsQ0FBQztRQUMzQixDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsdUNBQXVDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDM0QsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFSixLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLFlBQVksRUFBRSxDQUFDLE1BQTBCO1FBQzFFLDhCQUE4QixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzNDLENBQUMsQ0FBQyxDQUFDO0lBRUgsb0JBQW9CO0lBQ3BCLEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsd0JBQXdCLEVBQUUsTUFBTTtRQUNqRSxJQUFJLENBQUM7WUFDRCxJQUFJLFVBQVUsR0FBbUMsTUFBTSxDQUFDO1lBQ3hELEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztnQkFDZCxTQUFHLENBQUMsS0FBSyxDQUFDLDZDQUE2QyxDQUFDLENBQUM7WUFDN0QsQ0FBQztZQUNELElBQUksVUFBVSxHQUFHLHNCQUFLLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNyRCxVQUFVLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzFDLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQywyREFBMkQsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUMvRSxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyx3QkFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDLFNBQW9CO1FBQzVELElBQUksQ0FBQztZQUNELEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO2dCQUFDLE1BQU0sQ0FBQztZQUN2QixFQUFFLENBQUMsQ0FBQyxlQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxPQUFPLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDL0QsSUFBSSxVQUFVLEdBQUcsc0JBQUssQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUN4RCxJQUFJLEtBQUssR0FBRyxVQUFVLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUMxRCxFQUFFLENBQUMsQ0FBQyxlQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxVQUFVLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDbEUsYUFBYTtvQkFDYixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQzt3QkFDckIseUJBQXlCO3dCQUN6QixVQUFVLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUN2QyxDQUFDO29CQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNKLDZCQUE2Qjt3QkFDN0IsVUFBVSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFDbkMsQ0FBQztnQkFDTCxDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNKLGVBQWU7b0JBQ2YsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLEtBQUssSUFBSSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQzt3QkFDOUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFDcEMsQ0FBQztnQkFDTCxDQUFDO1lBQ0wsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLFNBQUcsQ0FBQyxHQUFHLENBQUMsa0ZBQWtGLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNoSCxDQUFDO1FBQ0wsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLDhCQUE4QixHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2xELENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUNILE1BQU0sQ0FBQyxNQUFNLENBQUMsOEJBQThCLENBQUMsQ0FBQyxNQUFNO1FBQ2hELElBQUksQ0FBQztZQUNELEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO2dCQUM5QixTQUFHLENBQUMsS0FBSyxDQUFDLHlEQUF5RCxDQUFDLENBQUM7Z0JBQ3JFLE1BQU0sQ0FBQztZQUNYLENBQUM7WUFDRCxJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDcEQsSUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDO1lBQzlDLElBQUksVUFBVSxHQUFHLHNCQUFLLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzFDLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7Z0JBQ2IsVUFBVSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3pDLENBQUM7UUFDTCxDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsK0NBQStDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDbkUsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0g7Ozs7Ozs7Ozs7O1NBV0s7SUFFTCxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLHNCQUFzQixFQUFFLEdBQUc7UUFDNUQsSUFBSSxDQUFDO1lBQ0QsU0FBRyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFTLEdBQUcsQ0FBQyxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdEYsdURBQXVEO1lBQ3ZELHNCQUFLLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJO2dCQUN6QixJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztZQUMzQixDQUFDLENBQUMsQ0FBQztZQUNILHNCQUFLLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztRQUM5QixDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsbURBQW1ELEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDdkUsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxhQUFhLEVBQUU7UUFDaEQsb0JBQW9CLEVBQUUsQ0FBQztJQUMzQixDQUFDLENBQUMsQ0FBQztJQUVILGtCQUFrQjtJQUNsQixRQUFRO0lBQ1IsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLGtCQUFrQixFQUFFO1FBQ2pGLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7WUFDbEMsU0FBRyxDQUFDLEdBQUcsQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDO1FBQ25ELENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDeEgsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFSiwyQkFBMkI7SUFDM0IsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLHFDQUFxQyxFQUFFO1FBQ3BHLHlCQUF5QixFQUFFLENBQUM7SUFDaEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVKLGtCQUFrQjtJQUNsQixLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsNEJBQTRCLEVBQUU7UUFDM0YsZ0JBQWdCLEVBQUUsQ0FBQztJQUN2QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRUosZUFBZTtJQUNmLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyx5QkFBeUIsRUFBRTtRQUN4RixFQUFFLENBQUMsQ0FBQyxzQkFBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7WUFDcEIsSUFBSSxTQUFTLEdBQUcsc0JBQUssQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQzFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxlQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxVQUFVLEtBQUssSUFBSSxDQUFDLElBQUksU0FBUyxDQUFDLENBQUMsQ0FBQztnQkFDbEYsU0FBUyxDQUFDLGVBQWUsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQ25ELENBQUM7UUFDTCxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVKLGVBQWU7SUFDZixLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMseUJBQXlCLEVBQUU7UUFDeEYsSUFBSSxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDaEIsU0FBRyxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1lBQ3pDLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixLQUFLLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyx3QkFBUSxDQUFDLG1CQUFtQixFQUFFLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFlBQXNCO29CQUNyRixFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQzFCLE1BQU0sQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxlQUFlOzRCQUMxRCxFQUFFLENBQUMsQ0FBQyxlQUFlLElBQUksZUFBZSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dDQUNoRCxZQUFZLENBQUMsZUFBZSxDQUFDLENBQUM7NEJBQ2xDLENBQUM7NEJBQUMsSUFBSSxDQUFDLENBQUM7Z0NBQ0osU0FBRyxDQUFDLEdBQUcsQ0FBQyxtREFBbUQsQ0FBQyxDQUFDOzRCQUNqRSxDQUFDO3dCQUNMLENBQUMsQ0FBQyxDQUFDO29CQUNQLENBQUM7b0JBQUMsSUFBSSxDQUFDLENBQUM7d0JBQ0osU0FBRyxDQUFDLEdBQUcsQ0FBQyx1REFBdUQsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO3dCQUNqRixZQUFZLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2xDLENBQUM7Z0JBQ0wsQ0FBQyxFQUFFLENBQUMsTUFBTTtvQkFDTixTQUFHLENBQUMsS0FBSyxDQUFDLCtDQUErQyxHQUFHLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUNuRixDQUFDLENBQUMsQ0FBQztZQUNQLENBQUM7UUFDTCxDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsMkJBQTJCLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDL0MsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFSixpQkFBaUI7SUFDakIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLDBCQUEwQixFQUFFO1FBQ3pGLElBQUksQ0FBQztZQUNELDBEQUEwRDtZQUMxRCxJQUFJLFFBQVEsR0FBRyxpQkFBaUIsRUFBRSxDQUFDO1lBQ25DLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNsQixJQUFJLEdBQUcsR0FBRyxzQkFBSyxDQUFDLGlCQUFpQixFQUFFLENBQUMsR0FBRyxDQUFDO2dCQUN4QyxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUM3QyxJQUFJLE9BQU8sR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDO2dCQUN2QixFQUFFLENBQUMsQ0FBQyxzQkFBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ2QsT0FBTyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDbkQsQ0FBQztnQkFDRCxJQUFJLFlBQVksR0FBRztvQkFDZixJQUFJLEVBQUUsYUFBYTtvQkFDbkIsSUFBSSxFQUFFLE9BQU87b0JBQ2IsT0FBTyxFQUFFLFFBQVE7b0JBQ2pCLE9BQU8sRUFBRSxPQUFPO29CQUNoQixZQUFZLEVBQUUsQ0FBQztvQkFDZiwyQkFBMkI7b0JBQzNCLHNCQUFzQixFQUFFLFdBQVc7aUJBQ3RDLENBQUE7Z0JBQ0QsRUFBRSxDQUFDLENBQUMsc0JBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO29CQUNwQixTQUFHLENBQUMsSUFBSSxDQUFDLGNBQWMsR0FBRyxRQUFRLEdBQUcsc0NBQXNDLENBQUMsQ0FBQztvQkFDN0UsTUFBTSxDQUFDO2dCQUNYLENBQUM7Z0JBQ0QsVUFBVSxDQUFDO29CQUNQLE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLG1CQUFtQixFQUFFLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQzt3QkFDbkUsU0FBRyxDQUFDLEdBQUcsQ0FBQyxvQ0FBb0MsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO3dCQUM3RCxzQkFBSyxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7d0JBQ3pCLE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLHNCQUFzQixDQUFDLENBQUM7b0JBQzNELENBQUMsRUFBRSxHQUFHO3dCQUNGLFNBQUcsQ0FBQyxLQUFLLENBQUMsMkJBQTJCLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUN6RCxDQUFDLENBQUMsQ0FBQztnQkFDUCxDQUFDLENBQUMsQ0FBQztZQUNQLENBQUM7WUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ3pCLFNBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzlCLENBQUM7UUFDTCxDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsZ0NBQWdDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDcEQsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFSixrQkFBa0I7SUFDbEIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLDRCQUE0QixFQUFFO1FBQzNGLEVBQUUsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztZQUNwQiwyQkFBMkIsRUFBRSxDQUFDO1lBQzlCLGlCQUFpQixHQUFHLEtBQUssQ0FBQztRQUM5QixDQUFDO1FBQ0QsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDZixFQUFFLENBQUMsQ0FBQyxzQkFBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BCLGFBQWEsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDL0IsU0FBRyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNyRCxXQUFXLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ25CLGFBQWEsQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDO2dCQUMvQixhQUFhLENBQUMsSUFBSSxHQUFHLFVBQVUsQ0FBQztnQkFDaEMsaUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3pCLEtBQUssQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxzQkFBSyxDQUFDLGlCQUFpQixFQUFFLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDdkcsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLFNBQUcsQ0FBQyxJQUFJLENBQUMsMkRBQTJELENBQUMsQ0FBQztZQUMxRSxDQUFDO1FBQ0wsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osU0FBRyxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQ3pDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRUosUUFBUTtJQUNSLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxrQkFBa0IsRUFBRTtRQUNqRixJQUFJLENBQUM7WUFDRCxTQUFTLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDOUIsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3hELENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRUosY0FBYztJQUNkLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyx1QkFBdUIsRUFBRTtRQUN0RixJQUFJLENBQUM7WUFDRCxTQUFHLENBQUMsR0FBRyxDQUFDLDJCQUEyQixHQUFHLFNBQUcsQ0FBQyxXQUFXLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN0RSxNQUFNLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLFNBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWTtnQkFDaEUsRUFBRSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO29CQUNoQixTQUFHLENBQUMsSUFBSSxDQUFDLHNFQUFzRSxDQUFDLENBQUM7Z0JBQ3JGLENBQUM7Z0JBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ0osTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7d0JBQ3JFLFNBQUcsQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDekQsQ0FBQyxFQUFFLEtBQUs7d0JBQ0osU0FBRyxDQUFDLEtBQUssQ0FBQyx3RUFBd0UsR0FBRyxLQUFLLENBQUMsQ0FBQztvQkFDaEcsQ0FBQyxDQUFDLENBQUM7Z0JBQ1AsQ0FBQztZQUNMLENBQUMsRUFBRSxLQUFLO2dCQUNKLFNBQUcsQ0FBQyxLQUFLLENBQUMsd0VBQXdFLEdBQUcsS0FBSyxDQUFDLENBQUM7WUFDaEcsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMseUJBQXlCLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDN0MsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFSixpQ0FBaUM7SUFDakMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLDZCQUE2QixFQUFFO1FBQzVGLGlCQUFpQixFQUFFLENBQUM7SUFDeEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNSLENBQUM7QUFFRCxzQkFBc0IsV0FBbUI7SUFDckMsSUFBSSxDQUFDO1FBQ0Qsc0JBQUssQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDO1FBQzdCLEtBQUssQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxZQUFZLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDdEUsQ0FBRTtJQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLDBCQUEwQixHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzlDLENBQUM7QUFDTCxDQUFDO0FBRUQsd0NBQXdDLE1BQTBCO0lBQzlELElBQUksQ0FBQztRQUNELHNCQUFLLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQztRQUM1QixTQUFHLENBQUMsR0FBRyxDQUFDLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN4RCxtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3JELDhDQUE4QztRQUM5QyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNuQixzQkFBc0I7WUFDdEIsc0JBQUssQ0FBQyxlQUFlLEVBQUUsQ0FBQTtZQUN2QixFQUFFLENBQUMsQ0FBQyxzQkFBSyxDQUFDLGlCQUFpQixFQUFFLElBQUksZUFBTSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxDQUFDLDRCQUE0QixLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQzVHLFNBQUcsQ0FBQyxHQUFHLENBQUMsaUNBQWlDLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDMUQsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxzQkFBSyxDQUFDLGlCQUFpQixFQUFFLENBQUMsR0FBRyxFQUFFLGlCQUFpQixFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDM0csQ0FBQztRQUNMLENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQyxVQUFVLElBQUksZUFBZSxDQUFDLENBQUMsQ0FBQztZQUNoQyxlQUFlLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDcEMsQ0FBQztJQUNMLENBQUU7SUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQywrQ0FBK0MsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUNuRSxDQUFDO0FBQ0wsQ0FBQztBQUVEO0lBQ0ksRUFBRSxDQUFDLENBQUMsc0JBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1FBQ3BCLFNBQUcsQ0FBQyxHQUFHLENBQUMsd0NBQXdDLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNsRSxLQUFLLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDMUQsQ0FBQztBQUNMLENBQUM7QUFFRDtJQUNJLElBQUksQ0FBQztRQUNELEVBQUUsQ0FBQyxDQUFDLHNCQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztZQUNwQixTQUFHLENBQUMsR0FBRyxDQUFDLGdCQUFnQixFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDekMsSUFBSSxVQUFVLEdBQUcsc0JBQUssQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLGVBQWUsQ0FBQztZQUMzRCxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDdEMsQ0FBQztJQUNMLENBQUU7SUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyx5Q0FBeUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUM3RCxDQUFDO0FBQ0wsQ0FBQztBQUVELG9CQUFvQixRQUFRO0lBQ3hCLElBQUksQ0FBQztRQUNELEVBQUUsQ0FBQyxDQUFDLENBQUMsaUNBQWUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQzlCLGlDQUFlLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztZQUNsQyxJQUFJLFVBQVUsR0FBRyxzQkFBSyxDQUFDLGlCQUFpQixFQUFFLENBQUMsZUFBZSxDQUFDO1lBQzNELFVBQVUsQ0FBQyx1QkFBdUIsQ0FBQztnQkFDL0IsVUFBVSxDQUFDLHVDQUF1QyxDQUFDO29CQUMvQyxVQUFVLENBQUMsZUFBZSxFQUFFLENBQUM7b0JBQzdCLFFBQVEsRUFBRSxDQUFDO2dCQUNmLENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixTQUFHLENBQUMsR0FBRyxDQUFDLDJDQUEyQyxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDekUsQ0FBQztJQUNMLENBQUU7SUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUM1QyxDQUFDO0FBQ0wsQ0FBQztBQUVELG9CQUFvQixRQUFRLEVBQUUsVUFBMkI7SUFDckQsSUFBSSxDQUFDO1FBQ0QsSUFBSSxNQUFNLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUM7UUFDekMsbUZBQW1GO1FBQ25GLE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLHdDQUF3QyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sTUFBTSxDQUFDLEVBQUUsS0FBSztZQUMvRixTQUFHLENBQUMsS0FBSyxDQUFDLG1EQUFtRCxDQUFDLENBQUM7UUFDbkUsQ0FBQyxDQUFDLENBQUM7UUFDSCxzQkFBSyxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7UUFDMUIsU0FBRyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDekUsaUNBQWUsQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDO1FBQ25DLFVBQVUsQ0FBQyx1QkFBdUIsQ0FBQztZQUMvQixVQUFVLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDN0IsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ25CLFFBQVEsRUFBRSxDQUFDO1FBQ2YsQ0FBQyxDQUFDLENBQUM7SUFFUCxDQUFFO0lBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsdUJBQXVCLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDM0MsQ0FBQztBQUNMLENBQUM7QUFFRCxnQkFBZ0IsU0FBeUIsRUFBRSxpQkFBMEI7SUFDakUsZUFBZTtJQUNmLHFCQUFxQixHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNuQyxPQUFPLEdBQUcsRUFBRSxDQUFDO0lBQ2IsYUFBYSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQy9CLFlBQVksR0FBRyxDQUFDLENBQUM7SUFDakIsc0JBQXNCO0lBQ3RCLElBQUksZUFBZSxHQUFlLFNBQVMsQ0FBQyxlQUFlLENBQUMsYUFBYSxFQUFFLENBQUM7SUFDNUUsRUFBRSxDQUFDLENBQUMsZUFBZSxJQUFJLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQzNDLFNBQUcsQ0FBQyxHQUFHLENBQUMsbUNBQW1DLEdBQUcsYUFBYSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ25HLFVBQVUsR0FBRyxlQUFlLENBQUM7SUFDakMsQ0FBQztJQUVELElBQUksR0FBRyxHQUFHLFNBQVMsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDbkMsRUFBRSxDQUFDLENBQUMsZUFBTSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2hCLFNBQUcsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsQ0FBQztRQUN6QyxDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixJQUFJLFVBQVUsR0FBRyxzQkFBSyxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMxQyxVQUFVLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDM0IsVUFBVSxDQUFDO2dCQUNQLHVCQUF1QjtnQkFDdkIseUNBQXlDO2dCQUV6QyxrQkFBa0I7Z0JBQ2xCLFNBQVMsQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO2dCQUMxQixTQUFTLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztnQkFDM0IsU0FBUyxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7Z0JBQzNCLHNCQUFLLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztnQkFFekIsd0JBQXdCO2dCQUN4QixhQUFhLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQy9CLGVBQWUsR0FBRyxXQUFXLENBQUM7b0JBQzFCLElBQUksUUFBUSxHQUFHLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQTtvQkFDeEMsRUFBRSxDQUFDLENBQUMsUUFBUSxJQUFJLFlBQVksQ0FBQyxDQUFDLENBQUM7d0JBQzNCLFlBQVksR0FBRyxRQUFRLENBQUM7d0JBQ3hCLElBQUksYUFBYSxHQUFHLGlCQUFpQixHQUFHLEtBQUssb0JBQW9CLEdBQUcsQ0FBQyxJQUFJLG9CQUFvQixDQUFDLE1BQU0sR0FBRyxHQUFHLEVBQUUsQ0FBQzt3QkFDN0csU0FBRyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEdBQUcsUUFBUSxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7d0JBQ2pELGlCQUFpQixDQUFDLElBQUksR0FBRyxlQUFlLENBQUMsUUFBUSxDQUFDLENBQUM7d0JBQ25ELGFBQWEsQ0FBQyxJQUFJLEdBQUcsYUFBYSxHQUFHLEdBQUcsR0FBRyxjQUFjLENBQUMsUUFBUSxDQUFDLEdBQUcsYUFBYSxDQUFDO29CQUN4RixDQUFDO2dCQUNMLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztnQkFFUixTQUFHLENBQUMsR0FBRyxDQUFDLDJCQUEyQixHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsd0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFFNUUsSUFBSSxTQUFTLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMzRyxJQUFJLE1BQU0sR0FBaUIsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsQ0FBQztnQkFDcEcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBUSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUMzRCxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDbkIsQ0FBQztRQUNELHVEQUF1RDtRQUN2RCxxQkFBcUIsRUFBRSxDQUFDO1FBQ3hCLG9CQUFvQixFQUFFLENBQUM7SUFDM0IsQ0FBQztBQUNMLENBQUM7QUFFRCxtQkFBbUIsYUFBcUIsRUFBRSxLQUFhLEVBQUUsSUFBSSxHQUFZLEtBQUs7SUFDMUUsSUFBSSxlQUFlLEdBQUcsZUFBTSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxDQUFDLFlBQVksS0FBSyxJQUFJLENBQUM7SUFDbkYsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcscUJBQXFCLENBQUMsQ0FBQztJQUNqRCxJQUFJLFFBQVEsR0FBRyxXQUFXLENBQUMsYUFBYSxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQy9DLFNBQUcsQ0FBQyxHQUFHLENBQUMsWUFBWSxHQUFHLFFBQVEsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2pELElBQUksYUFBYSxHQUFHLGlCQUFpQixHQUFHLEtBQUssb0JBQW9CLEdBQUcsQ0FBQyxJQUFJLG9CQUFvQixDQUFDLE1BQU0sR0FBRyxHQUFHLEVBQUUsQ0FBQztJQUM3RyxZQUFZLEdBQUcsUUFBUSxDQUFDO0lBQ3hCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQztRQUNMLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDO0lBQzdCLElBQUksQ0FBQyxDQUFDO1FBQ0YsbUJBQW1CLENBQUMsaUJBQWlCLEVBQUUsZUFBZSxDQUFDLFFBQVEsQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDbEcsbUJBQW1CLENBQUMsYUFBYSxFQUFFLGFBQWEsR0FBRyxHQUFHLEdBQUcsY0FBYyxDQUFDLFFBQVEsQ0FBQyxHQUFHLGFBQWEsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM5RyxDQUFDO0FBQ0wsQ0FBQztBQUVELHFCQUFxQixRQUFnQjtJQUNqQyxJQUFJLENBQUM7UUFDRCxJQUFJLHNCQUFzQixHQUFHLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsRixJQUFJLGdCQUFnQixHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxxQkFBcUIsQ0FBQztRQUMxRCxFQUFFLENBQUMsQ0FBQyxVQUFVLElBQUksVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDbkMsSUFBSSxHQUFHLEdBQUcsVUFBVSxDQUFDLE9BQU8sQ0FBQztZQUM3QixFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxJQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUMvQixJQUFJLGlCQUFpQixHQUFHLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDekUsSUFBSSxRQUFRLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ25DLElBQUksU0FBUyxHQUFHLHNCQUFzQixDQUFDO2dCQUN2QyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDL0gsd0VBQXdFO29CQUN4RSxpQkFBaUIsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUN4QyxTQUFTLEdBQUcsZ0JBQWdCLENBQUM7Z0JBQ2pDLENBQUM7Z0JBQ0QsSUFBSSxhQUFhLEdBQUcsUUFBUSxHQUFHLGlCQUFpQixDQUFBO2dCQUNoRCxJQUFJLGNBQWMsR0FBRyxTQUFTLEdBQUcsYUFBYSxDQUFDO2dCQUMvQyxRQUFRLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxnQkFBZ0IsR0FBRyxjQUFjLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN0RSxDQUFDO1lBQ0QsNkRBQTZEO1lBQzdELEVBQUUsQ0FBQyxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUM7Z0JBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQztRQUNyQyxDQUFDO1FBQ0QsTUFBTSxDQUFDLFFBQVEsQ0FBQztJQUNwQixDQUFFO0lBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsNEJBQTRCLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDaEQsQ0FBQztBQUNMLENBQUM7QUFFRCx5QkFBeUIsUUFBZ0I7SUFDckMsUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDaEMsSUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDO0lBQ2IsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxRQUFRLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDckMsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUM7SUFDcEIsQ0FBQztJQUNELEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsUUFBUSxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ3RDLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDO0lBQ3BCLENBQUM7SUFDRCxNQUFNLENBQUMsR0FBRyxDQUFDO0FBQ2YsQ0FBQztBQUVELHVCQUF1QixJQUFZO0lBQy9CLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLFVBQVUsQ0FBQztBQUN4QyxDQUFDO0FBRUQsd0JBQXdCLFFBQWdCO0lBQ3BDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO1FBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztJQUMzQixNQUFNLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUM7QUFDckMsQ0FBQztBQUVEO0lBQ0ksRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7UUFDakMsSUFBSSxJQUFJLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2xFLEtBQUssQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUFRLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU87WUFDbkUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDVixTQUFHLENBQUMsR0FBRyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7WUFDaEQsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLFNBQUcsQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQztZQUMzQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUE7SUFDTixDQUFDO0FBQ0wsQ0FBQyJ9