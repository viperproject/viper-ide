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
    TaskType[TaskType["NoOp"] = 0] = "NoOp";
    TaskType[TaskType["Save"] = 1] = "Save";
    TaskType[TaskType["Verify"] = 2] = "Verify";
    TaskType[TaskType["Stop"] = 3] = "Stop";
    TaskType[TaskType["Clear"] = 4] = "Clear";
    TaskType[TaskType["Verifying"] = 20] = "Verifying";
    TaskType[TaskType["Stopping"] = 30] = "Stopping";
    TaskType[TaskType["StoppingComplete"] = 300] = "StoppingComplete";
    TaskType[TaskType["VerificationComplete"] = 200] = "VerificationComplete";
    TaskType[TaskType["VerificationFailed"] = 201] = "VerificationFailed";
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
    let ownPackageJson = vscode.extensions.getExtension("rukaelin.viper-advanced").packageJSON;
    let defaultConfiguration = ownPackageJson.contributes.configuration.properties;
    lastVersionWithSettingsChange = {
        nailgunSettingsVersion: "0.5.402",
        backendSettingsVersion: "0.2.15",
        pathSettingsVersion: "0.2.15",
        userPreferencesVersion: "0.5.406",
        javaSettingsVersion: "0.2.15",
        advancedFeaturesVersion: "0.3.8",
        defaultSettings: defaultConfiguration
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
        if (!task.uri) {
            reason = "Cannot Verify, unknown file uri";
        }
        else {
            let dontVerify = `Don't verify ${path.basename(task.uri.toString())}: `;
            if (!ExtensionState_1.State.isBackendReady) {
                reason = "Backend is not ready, wait for backend to start.";
            }
            else {
                let fileState = ExtensionState_1.State.getFileState(task.uri);
                if (!fileState) {
                    reason = "it's not a viper file";
                }
                else {
                    let activeFile = activeFileUri();
                    if (!task.manuallyTriggered && !autoVerify) {
                        reason = dontVerify + "autoVerify is disabled.";
                    }
                    else if (!fileState.open) {
                        reason = dontVerify + "file is closed";
                    }
                    else if (fileState.verified && fileState.verifying && !fileState.changed) {
                        reason = dontVerify + `file has not changed, restarting the verification has no use`;
                    }
                    else if (!task.manuallyTriggered && fileState.verified) {
                        reason = dontVerify + `not manuallyTriggered and file is verified`;
                    }
                    else if (!activeFile) {
                        reason = dontVerify + `no file is active`;
                    }
                    else if (activeFile.toString() !== task.uri.toString()) {
                        reason = dontVerify + `another file is active`;
                    }
                    else {
                        result = true;
                    }
                }
            }
        }
        return {
            result: result,
            reason: reason,
            error: null
        };
    }
    catch (e) {
        let error = "Error checking if verification can be started " + e;
        Log_1.Log.error(error);
        return {
            result: false,
            reason: null,
            error: error
        };
    }
}
let lastCanStartVerificationReason;
let lastCanStartVerificationUri;
let NoOp = TaskType.NoOp;
function startVerificationController() {
    let verificationTimeout = 100; //ms
    verificationController = new Timer_1.Timer(() => {
        try {
            //only keep most recent verify request
            let verifyFound = false;
            let stopFound = false;
            let clearFound = false;
            let verificationComplete = false;
            let stoppingComplete = false;
            let verificationFailed = false;
            let completedOrFailedFileUri;
            let uriOfFoundVerfy;
            for (let i = workList.length - 1; i >= 0; i--) {
                if (clearFound) {
                    //clear the workList
                    workList[i].type = NoOp;
                }
                if (workList[i].type == TaskType.Verify) {
                    if (verifyFound) {
                        //remove all older verify
                        workList[i].type = NoOp;
                    }
                    else {
                        verifyFound = true;
                        uriOfFoundVerfy = workList[i].uri;
                    }
                    if (verificationComplete || verificationFailed && Helper_1.Helper.uriEquals(completedOrFailedFileUri, workList[i].uri)) {
                        //remove verification requests that make no sense
                        workList[i].type = NoOp;
                    }
                }
                else if (workList[i].type == TaskType.Stop) {
                    workList[i].type = NoOp;
                    stopFound = true;
                }
                else if (workList[i].type == TaskType.Clear) {
                    workList[i].type = NoOp;
                    clearFound = true;
                }
                else if (workList[i].type == TaskType.VerificationComplete) {
                    workList[i].type = NoOp;
                    verificationComplete = true;
                    completedOrFailedFileUri = workList[i].uri;
                }
                else if (workList[i].type == TaskType.StoppingComplete) {
                    workList[i].type = NoOp;
                    stoppingComplete = true;
                }
                else if (workList[i].type == TaskType.VerificationFailed) {
                    workList[i].type = NoOp;
                    verificationFailed = true;
                    completedOrFailedFileUri = workList[i].uri;
                }
                if (stopFound && workList[i].type != TaskType.Verifying && workList[i].type != TaskType.Stopping) {
                    //remove all older non-bocking actions
                    workList[i].type = NoOp;
                }
            }
            //remove leading NoOps
            while (workList.length > 0 && workList[0].type == NoOp) {
                workList.shift();
            }
            let done = false;
            while (!done && workList.length > 0) {
                let task = workList[0];
                let fileState = ExtensionState_1.State.getFileState(task.uri); //might be null
                switch (task.type) {
                    case TaskType.Verify:
                        let canVerify = canStartVerification(task);
                        if (canVerify.result) {
                            verify(fileState, task.manuallyTriggered);
                            task.type = TaskType.Verifying;
                        }
                        else if (canVerify.reason && (canVerify.reason != lastCanStartVerificationReason || (task.uri && !Helper_1.Helper.uriEquals(task.uri, lastCanStartVerificationUri)))) {
                            Log_1.Log.log(canVerify.reason, ViperProtocol_1.LogLevel.Info);
                            lastCanStartVerificationReason = canVerify.reason;
                        }
                        lastCanStartVerificationUri = task.uri;
                        break;
                    case TaskType.Verifying:
                        //if another verification is requested, the current one must be stopped
                        if ((verifyFound && !Helper_1.Helper.uriEquals(uriOfFoundVerfy, task.uri)) || stopFound) {
                            task.type = TaskType.Stopping;
                            doStopVerification(task.uri.toString());
                        }
                        //block until verification is complete or failed
                        if (verificationComplete || verificationFailed) {
                            if (!Helper_1.Helper.uriEquals(completedOrFailedFileUri, task.uri)) {
                                Log_1.Log.error("WARNING: the " + (verificationComplete ? "completed" : "failed") + " verification uri does not correspond to the uri of the started verification.");
                            }
                            task.type = NoOp;
                        }
                        break;
                    case TaskType.Stopping:
                        //block until verification is stoped;
                        if (stoppingComplete) {
                            task.type = NoOp;
                        }
                        break;
                    case TaskType.Save:
                        task.type = NoOp;
                        if (fileState) {
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
                        }
                        break;
                    default:
                        //in case a completion event reaches the bottom of the worklist, ignore it.
                        task.type = NoOp;
                }
                //in case the leading element is now a NoOp, remove it, otherwise block.
                if (task.type == NoOp) {
                    workList.shift();
                }
                else {
                    done = true;
                }
            }
        }
        catch (e) {
            Log_1.Log.error("Error in verification controller (critical): " + e);
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
                if (Helper_1.Helper.isViperSourceFile(uri)) {
                    let oldViperFile = ExtensionState_1.State.getLastActiveFile();
                    if (oldViperFile) {
                        //change in active viper file, remove special characters from the previous one
                        if (oldViperFile.uri.toString() !== uri.toString()) {
                            oldViperFile.decorationsShown = false;
                            if (ExtensionState_1.State.isDebugging) {
                                oldViperFile.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
                                stopDebuggingOnServer();
                                stopDebuggingLocally();
                            }
                        }
                    }
                    let fileState = ExtensionState_1.State.setLastActiveFile(uri, editor);
                    if (fileState) {
                        if (!fileState.verified) {
                            Log_1.Log.log("The active text editor changed, consider reverification of " + fileState.name(), ViperProtocol_1.LogLevel.Debug);
                            workList.push({ type: TaskType.Verify, uri: uri, manuallyTriggered: false });
                        }
                        else {
                            Log_1.Log.log("Don't reverify, the file is already verified", ViperProtocol_1.LogLevel.Debug);
                        }
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
                    workList.push({ type: TaskType.VerificationComplete, uri: uri, manuallyTriggered: false });
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
        Log_1.Log.error("Error handling state change (critical): " + e);
    }
}
//for unittest
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
        let settingsButton = { title: "Open Settings" };
        let updateButton = { title: "Update ViperTools" };
        vscode.window.showInformationMessage("Viper Settings: " + errorCounts + ": " + message, settingsButton, updateButton).then((choice) => {
            try {
                if (choice && choice.title === settingsButton.title) {
                    vscode.commands.executeCommand("workbench.action.openWorkspaceSettings");
                }
                else if (choice && choice.title === updateButton.title) {
                    vscode.commands.executeCommand("extension.updateViperTools");
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
            statusBarProgress.hide();
            abortButton.hide();
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
                workList.push({ type: TaskType.Verify, uri: uriObject, manuallyTriggered: false });
            }
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
            workList.push({ type: TaskType.VerificationFailed, uri: index_1.default.parse(uri), manuallyTriggered: true });
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
        let fileUri = activeFileUri();
        if (!fileUri) {
            Log_1.Log.log("Cannot verify, no document is open.");
        }
        else if (!Helper_1.Helper.isViperSourceFile(fileUri)) {
            Log_1.Log.log("Cannot verify the active file, its not a viper file.");
        }
        else {
            workList.push({ type: TaskType.Verify, uri: fileUri, manuallyTriggered: true });
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
        workList.push({ type: TaskType.Stop, uri: null, manuallyTriggered: true });
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
    //automatic installation and updating of viper tools
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.updateViperTools', () => {
        state.client.sendNotification(ViperProtocol_1.Commands.UpdateViperTools);
    }));
}
//TODO: used to be called when the stop verification command was handled
function doStopVerification(uriToStop) {
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
            state.client.sendRequest(ViperProtocol_1.Commands.StopVerification, uriToStop).then((success) => {
                workList.push({ type: TaskType.StoppingComplete, uri: null, manuallyTriggered: false });
            });
        }
        else {
            Log_1.Log.hint("Cannot stop the verification, no verification is running.");
            workList.push({ type: TaskType.StoppingComplete, uri: null, manuallyTriggered: false });
        }
    }
    else {
        Log_1.Log.hint("Extension not ready yet.");
        workList.push({ type: TaskType.StoppingComplete, uri: null, manuallyTriggered: false });
    }
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
        updateStatusBarItem(statusBarItem, "ready", 'white');
        if (params.restarted) {
            //no file is verifying
            ExtensionState_1.State.resetViperFiles();
            if (Helper_1.Helper.getConfiguration('preferences').autoVerifyAfterBackendChange === true) {
                Log_1.Log.log("autoVerify after backend change", ViperProtocol_1.LogLevel.Info);
                workList.push({ type: TaskType.Verify, uri: activeFileUri(), manuallyTriggered: false });
            }
            else {
                //is the automatic verification is not wanted, prevent it
                workList.push({ type: TaskType.Clear, uri: activeFileUri(), manuallyTriggered: false });
            }
        }
        //for unit testing
        if (isUnitTest && unitTestResolve) {
            unitTestResolve("BackendReady");
        }
        Log_1.Log.log("Backend ready: " + params.name, ViperProtocol_1.LogLevel.Info);
        ExtensionState_1.State.isBackendReady = true;
    }
    catch (e) {
        Log_1.Log.error("Error handling backend started notification: " + e);
    }
}
///might be null
function activeFileUri() {
    if (vscode.window.activeTextEditor) {
        return vscode.window.activeTextEditor.document.uri;
    }
    else {
        return null;
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
    try {
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
                    //start progress updater
                    clearInterval(progressUpdater);
                    progressUpdater = setInterval(() => {
                        let progress = getProgress(lastProgress);
                        if (progress != lastProgress) {
                            lastProgress = progress;
                            let totalProgress = verifyingAllFiles ? ` (${nextFileToAutoVerify + 1}/${allFilesToAutoVerify.length})` : "";
                            Log_1.Log.log("Progress: " + progress + " (" + fileState.name() + ")", ViperProtocol_1.LogLevel.Debug);
                            statusBarProgress.text = progressBarText(progress);
                            statusBarItem.text = progressLabel + " " + formatProgress(progress) + totalProgress;
                        }
                    }, 500);
                    Log_1.Log.log("Request verification for " + path.basename(uri), ViperProtocol_1.LogLevel.Verbose);
                    let workspace = vscode.workspace.rootPath ? vscode.workspace.rootPath : path.dirname(fileState.uri.fsPath);
                    let params = { uri: uri, manuallyTriggered: manuallyTriggered, workspace: workspace };
                    //request verification from Server
                    state.client.sendNotification(ViperProtocol_1.Commands.Verify, params);
                    ExtensionState_1.State.isVerifying = true;
                }, visualizer);
            }
            //in case a debugging session is still running, stop it
            stopDebuggingOnServer();
            stopDebuggingLocally();
        }
    }
    catch (e) {
        if (!ExtensionState_1.State.isVerifying) {
            //make sure the worklist is not blocked
            workList.push({ type: TaskType.VerificationFailed, uri: fileState.uri });
        }
        Log_1.Log.error("Error requesting verification of " + fileState.name);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2V4dGVuc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFLYixNQUFZLElBQUksV0FBTSxNQUFNLENBQUMsQ0FBQTtBQUM3Qix3QkFBc0IsU0FBUyxDQUFDLENBQUE7QUFDaEMsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsaUNBQXNCLGtCQUFrQixDQUFDLENBQUE7QUFDekMsZ0NBQStOLGlCQUFpQixDQUFDLENBQUE7QUFDalAsd0JBQWdCLHNCQUFzQixDQUFDLENBQUE7QUFDdkMsc0JBQW9CLE9BQU8sQ0FBQyxDQUFBO0FBQzVCLGtDQUFxRCxtQkFBbUIsQ0FBQyxDQUFBO0FBQ3pFLHlCQUF1QixVQUFVLENBQUMsQ0FBQTtBQUNsQyxpQ0FBK0Isa0JBQWtCLENBQUMsQ0FBQTtBQUlsRCxJQUFJLGFBQWEsQ0FBQztBQUNsQixJQUFJLGlCQUFpQixDQUFDO0FBQ3RCLElBQUksZ0JBQWdCLENBQUM7QUFDckIsSUFBSSxXQUFXLENBQUM7QUFDaEIsSUFBSSxTQUFnQixDQUFDO0FBQ3JCLElBQUksS0FBWSxDQUFDO0FBRWpCLElBQUksc0JBQTZCLENBQUM7QUFDbEMsSUFBSSxpQkFBMkMsQ0FBQztBQUNoRCxJQUFJLFNBQXlCLENBQUM7QUFDOUIsSUFBSSxRQUFnQixDQUFDO0FBRXJCLHVDQUF1QztBQUV2QyxhQUFhO0FBQ2IsSUFBSSxxQkFBNkIsQ0FBQztBQUNsQyxJQUFJLE9BQWlCLENBQUM7QUFDdEIsSUFBSSxVQUFzQixDQUFDO0FBQzNCLElBQUksZUFBZSxDQUFDO0FBQ3BCLElBQUksWUFBb0IsQ0FBQztBQUN6QixJQUFJLGFBQWEsR0FBRyxFQUFFLENBQUM7QUFTdkIsSUFBSyxRQUtKO0FBTEQsV0FBSyxRQUFRO0lBQ1QsdUNBQVEsQ0FBQTtJQUNSLHVDQUFRLENBQUE7SUFBRSwyQ0FBVSxDQUFBO0lBQUUsdUNB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