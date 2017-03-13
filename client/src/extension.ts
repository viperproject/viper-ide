'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import * as fs from 'fs';
import * as path from 'path';
import { Timer } from './Timer';
import * as vscode from 'vscode';
import { State } from './ExtensionState';
import { Common, Progress, HintMessage, Versions, VerifyParams, TimingInfo, SettingsCheckedParams, SettingsErrorType, BackendReadyParams, StepsAsDecorationOptionsResult, HeapGraph, VerificationState, Commands, StateChangeParams, LogLevel, Success } from './ViperProtocol';
import Uri from 'vscode-uri/lib/index';
import { Log } from './Log';
import { StateVisualizer, MyDecorationOptions } from './StateVisualizer';
import { Helper } from './Helper';
import { ViperFormatter } from './ViperFormatter';
import { ViperFileState } from './ViperFileState';
import { StatusBar, Color } from './StatusBar';

let autoSaver: Timer;
let state: State;

let verificationController: Timer;
let fileSystemWatcher: vscode.FileSystemWatcher;
let formatter: ViperFormatter;
let workList: Task[];

//let lastActiveTextEditor: vscode.Uri;

//for timing:
let verificationStartTime: number;
let timings: number[];
let oldTimings: TimingInfo;
let progressUpdater;
let lastProgress: number;
let progressLabel = "";

interface Task {
    type: TaskType;
    uri?: vscode.Uri;
    manuallyTriggered?: boolean;
    success?: Success;
}

enum TaskType {
    NoOp = 0,
    Save = 1, Verify = 2, Stop = 3, Clear = 4, UpdateViperTools = 5,
    Verifying = 20, Stopping = 30, UpdatingViperTools = 50,
    StoppingComplete = 300, VerificationComplete = 200, VerificationFailed = 201, ViperToolsUpdateComplete = 500
}

export function initializeUnitTest(resolve) {
    State.unitTest = resolve;
    //activate(context);
}

// function addTestDecoration() {

//     let options: vscode.DecorationOptions[] = []
//     options.push({
//         range: new vscode.Range(new vscode.Position(2, 1), new vscode.Position(2, 1)),
//         renderOptions: {
//             before: {
//                 contentText: "Decoration",
//                 color: "red"
//             }
//         }
//     });
//     let decoration = vscode.window.createTextEditorDecorationType(options);
//     vscode.window.activeTextEditor.setDecorations(decoration, options);
// }

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    Helper.loadViperFileExtensions();

    Log.log('The ViperIDE is starting up.', LogLevel.Info);

    let ownPackageJson = vscode.extensions.getExtension("rukaelin.viper").packageJSON;
    let defaultConfiguration = ownPackageJson.contributes.configuration.properties;

    lastVersionWithSettingsChange = {
        nailgunSettingsVersion: "0.5.418",
        backendSettingsVersion: "0.5.417",
        pathSettingsVersion: "0.2.15",
        userPreferencesVersion: "0.5.406",
        javaSettingsVersion: "0.2.15",
        advancedFeaturesVersion: "0.5.417",
        defaultSettings: defaultConfiguration
    }
    workList = [];
    Log.initialize();
    Log.log('Viper-Client is now active.', LogLevel.Info);
    state = State.createState();
    State.checkOperatingSystem();
    context.subscriptions.push(state);
    fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/{' + Helper.viperFileEndings.join(",") + "}");
    state.startLanguageServer(context, fileSystemWatcher, false); //break?
    registerHandlers();
    startAutoSaver();
    State.initializeStatusBar(context);
    registerFormatter();
    if (vscode.window.activeTextEditor) {
        let uri = vscode.window.activeTextEditor.document.uri;
        State.setLastActiveFile(uri, vscode.window.activeTextEditor);
    } else {
        Log.log("No active text editor found", LogLevel.Info);
    }
    startVerificationController();
    //addTestDecoration();
}

let verifyingAllFiles = false;
let allFilesToAutoVerify: Uri[];
let nextFileToAutoVerify: number;
let autoVerificationResults: string[];
let autoVerificationStartTime: number;

function verifyAllFilesInWorkspace() {
    autoVerificationStartTime = Date.now();
    verifyingAllFiles = true;
    autoVerificationResults = [];
    if (!State.isBackendReady) {
        Log.error("The backend must be running before verifying all files in the workspace")
        return;
    }
    let endings = "{" + Helper.viperFileEndings.join(",") + "}";
    vscode.workspace.findFiles('**/' + endings, '').then((uris: Uri[]) => {
        Log.log("Starting to verify " + uris.length + " viper files.", LogLevel.Info);
        allFilesToAutoVerify = uris;
        nextFileToAutoVerify = 0;
        autoVerifyFile();
    });
}

function printAllVerificationResults() {
    Log.log("Verified " + autoVerificationResults.length + " files in " + Helper.formatSeconds((Date.now() - autoVerificationStartTime) / 1000), LogLevel.Info);
    autoVerificationResults.forEach(res => {
        Log.log("Verification Result: " + res, LogLevel.Info);
    })
}

function autoVerifyFile(): Thenable<boolean> {
    return new Promise((resolve, reject) => {
        if (nextFileToAutoVerify < allFilesToAutoVerify.length && verifyingAllFiles) {
            let currFile = allFilesToAutoVerify[nextFileToAutoVerify];
            Log.log("AutoVerify " + path.basename(currFile.toString()), LogLevel.Info);
            nextFileToAutoVerify++;
            vscode.workspace.openTextDocument(currFile).then((document) => {
                vscode.window.showTextDocument(document).then(() => {
                    verify(State.getFileState(currFile), false);
                    resolve(true);
                })
            })
        } else {
            verifyingAllFiles = false;
            printAllVerificationResults();
            resolve(false);
        }
    });
}

let lastVersionWithSettingsChange: Versions;

function getRequiredVersion(): Versions {
    try {
        return lastVersionWithSettingsChange;
    } catch (e) {
        Log.error("Error checking settings version: " + e)
        return null;
    }
}

interface CheckResult {
    result: boolean,
    reason: string,
    error: string
}

function canStartDebugging(): CheckResult {
    try {
        let result = false;
        let reason: string;
        let fileState = State.getLastActiveFile();
        if (!Helper.areAdvancedFeaturesEnabled()) {
            reason = "Don't debug, You must first Enable the advanced features in the settings.";
        } else if (!fileState) {
            reason = "Don't debug, no viper file open.";
        } else {
            let uri = fileState.uri;
            let filename = path.basename(uri.toString());
            let dontDebugString = `Don't debug ${filename}, `;
            if (!State.isBackendReady) {
                reason = dontDebugString + "the backend is not ready";
            } else if (State.isVerifying) {
                reason = dontDebugString + "a verification is running", LogLevel.Debug;
            } else if (!fileState.verified) {
                reason = dontDebugString + "the file is not verified, the verificaion will be started.", LogLevel.Debug;
                workList.push({ type: TaskType.Verify, uri: uri, manuallyTriggered: false });
            } else if (!fileState.stateVisualizer.readyToDebug) {
                reason = dontDebugString + "the verification provided no states";
            } else if (Helper.getConfiguration("advancedFeatures").simpleMode === true && !fileState.stateVisualizer.decorationOptions.some(option => option.isErrorState)) {
                reason = `Don't debug ${filename}. In simple mode debugging can only be started when there is an error state.`;
            } else {
                result = true;
            }
        }
        return {
            result: result,
            reason: reason,
            error: null
        };
    } catch (e) {
        let error = "Error checking if Debugging can be started " + e;
        Log.error(error);
        return {
            result: false,
            reason: null,
            error: error
        };
    }
}

function canStartVerification(task: Task): CheckResult {
    try {
        let result = false;
        let reason: string;
        if (!task.uri) {
            reason = "Cannot Verify, unknown file uri";
        } else {
            let dontVerify = `Don't verify ${path.basename(task.uri.toString())}: `;
            if (!State.isBackendReady) {
                reason = "Backend is not ready, wait for backend to start.";
            } else {
                let fileState = State.getFileState(task.uri);
                if (!fileState) {
                    reason = "it's not a viper file";
                } else {
                    let activeFile = Helper.getActiveFileUri();
                    if (!task.manuallyTriggered && !autoVerify) {
                        reason = dontVerify + "autoVerify is disabled.";
                    }
                    else if (!fileState.open) {
                        reason = dontVerify + "file is closed";
                    } else if (fileState.verified && fileState.verifying && !fileState.changed) {
                        reason = dontVerify + `file has not changed, restarting the verification has no use`;
                    } else if (!task.manuallyTriggered && fileState.verified) {
                        reason = dontVerify + `not manuallyTriggered and file is verified`;
                    } else if (!activeFile) {
                        reason = dontVerify + `no file is active`;
                    } else if (activeFile.toString() !== task.uri.toString()) {
                        reason = dontVerify + `another file is active`;
                    } else {
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
    } catch (e) {
        let error = "Error checking if verification can be started " + e;
        Log.error(error);
        return {
            result: false,
            reason: null,
            error: error
        };
    }
}

let lastCanStartVerificationReason: string;
let lastCanStartVerificationUri: vscode.Uri;

let NoOp: TaskType = TaskType.NoOp;

function startVerificationController() {
    let verificationTimeout = 100;//ms
    verificationController = new Timer(() => {
        try {
            //only keep most recent verify request
            let verifyFound = false;
            let stopFound = false;
            let isStopManuallyTriggered = false;
            let clearFound = false;
            let verificationComplete = false;
            let stoppingComplete = false;
            let verificationFailed = false;
            let completedOrFailedFileUri: vscode.Uri;
            let uriOfFoundVerfy: vscode.Uri;
            let viperToolsUpdateFound = false;
            let viperToolsUpdateComplete = false;
            for (let i = workList.length - 1; i >= 0; i--) {
                if (clearFound && workList[i].type != TaskType.UpdatingViperTools) {
                    //clear the workList
                    workList[i].type = NoOp;
                }
                else if (workList[i].type == TaskType.Verify) {
                    if (verifyFound || stopFound || viperToolsUpdateFound) {
                        //remove all older verify tasks once newer verify, stop, or viperToolsUpdate found
                        workList[i].type = NoOp;
                    } else {
                        verifyFound = true;
                        uriOfFoundVerfy = workList[i].uri;
                    }
                    if ((verificationComplete || verificationFailed) && Helper.uriEquals(completedOrFailedFileUri, workList[i].uri)) {
                        //remove verification requests of just verified file
                        workList[i].type = NoOp;
                    }
                }
                else if (workList[i].type == TaskType.Stop) {
                    workList[i].type = NoOp;
                    stopFound = true;
                    isStopManuallyTriggered = isStopManuallyTriggered || workList[i].manuallyTriggered;
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
                else if (workList[i].type == TaskType.UpdateViperTools) {
                    viperToolsUpdateFound = true;
                }
                else if (workList[i].type == TaskType.ViperToolsUpdateComplete) {
                    workList[i].type = NoOp;
                    viperToolsUpdateComplete = true;
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

                let fileState = State.getFileState(task.uri); //might be null
                switch (task.type) {
                    case TaskType.Verify:
                        let canVerify = canStartVerification(task);
                        if (canVerify.result) {
                            verify(fileState, task.manuallyTriggered);
                            task.type = TaskType.Verifying;
                        } else if (canVerify.reason && (canVerify.reason != lastCanStartVerificationReason || (task.uri && !Helper.uriEquals(task.uri, lastCanStartVerificationUri)))) {
                            Log.log(canVerify.reason, LogLevel.Info);
                            lastCanStartVerificationReason = canVerify.reason;
                        }
                        lastCanStartVerificationUri = task.uri;
                        break;
                    case TaskType.Verifying:
                        //if another verification is requested, the current one must be stopped
                        if ((verifyFound && !Helper.uriEquals(uriOfFoundVerfy, task.uri)) || stopFound || viperToolsUpdateFound) {
                            task.type = TaskType.Stopping;
                            Log.log("Stop the running verification of " + path.basename(Common.uriToPath(task.uri.toString())), LogLevel.Debug);
                            doStopVerification(task.uri.toString(), isStopManuallyTriggered);
                        }
                        //block until verification is complete or failed
                        if (verificationComplete || verificationFailed) {
                            if (!Helper.uriEquals(completedOrFailedFileUri, task.uri)) {
                                Log.error("WARNING: the " + (verificationComplete ? "completed" : "failed") + " verification uri does not correspond to the uri of the started verification.");
                            }
                            task.type = NoOp;
                        }
                        break;
                    case TaskType.Stopping:
                        //block until verification is stoped;
                        if (stoppingComplete) {
                            task.type = NoOp;
                            //for unitTest
                            if (State.unitTest) {
                                State.unitTest({ event: 'VerificationStopped' });
                            }
                        }
                        break;
                    case TaskType.UpdateViperTools:
                        task.type = TaskType.UpdatingViperTools;
                        State.isBackendReady = false;
                        State.client.sendNotification(Commands.UpdateViperTools);
                        State.statusBarProgress.updateProgressBar(0);
                        break;
                    case TaskType.UpdatingViperTools:
                        //block until verification is stoped;
                        if (viperToolsUpdateComplete) {
                            task.type = NoOp;
                        }
                        break;
                    case TaskType.Save:
                        task.type = NoOp;
                        if (fileState) {
                            if (fileState.onlySpecialCharsChanged) {
                                fileState.onlySpecialCharsChanged = false;
                            } else {
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
                } else {
                    done = true;
                }
            }
        } catch (e) {
            Log.error("Error in verification controller (critical): " + e);
            workList.shift();
        }
    }, verificationTimeout);
    State.context.subscriptions.push(verificationController);

    //trigger verification texteditorChange
    State.context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        try {
            let editor = vscode.window.activeTextEditor;
            if (editor) {
                let uri = editor.document.uri;
                if (Helper.isViperSourceFile(uri)) {
                    let oldViperFile: ViperFileState = State.getLastActiveFile();
                    if (oldViperFile) {
                        //change in active viper file, remove special characters from the previous one
                        if (oldViperFile.uri.toString() !== uri.toString()) {
                            oldViperFile.decorationsShown = false;
                            if (State.isDebugging) {
                                oldViperFile.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
                                stopDebuggingOnServer();
                                stopDebuggingLocally();
                            }
                        }
                    }
                    let fileState = State.setLastActiveFile(uri, editor);
                    if (fileState) {
                        if (!fileState.verified) {
                            Log.log("The active text editor changed, consider reverification of " + fileState.name(), LogLevel.Debug);
                            workList.push({ type: TaskType.Verify, uri: uri, manuallyTriggered: false })
                        } else {
                            Log.log("Don't reverify, the file is already verified", LogLevel.Debug);
                        }
                        //Log.log("Active viper file changed to " + fileState.name(), LogLevel.Info);
                    }
                }
            }
        } catch (e) {
            Log.error("Error handling active text editor change: " + e);
        }
    }));
}

export function deactivate(): Promise<any> {
    return new Promise((resolve, reject) => {
        Log.log("deactivate", LogLevel.Info);
        state.dispose().then(() => {
            Log.log("state disposed", LogLevel.Debug);
            //TODO: make sure no doc contains special chars any more
            let oldFile = State.getLastActiveFile();
            if (oldFile) {
                Log.log("Removing special chars of last opened file.", LogLevel.Debug);
                oldFile.stateVisualizer.removeSpecialCharacters(() => {
                    Log.log("Close Log", LogLevel.Debug);
                    Log.dispose();
                    Log.log("Deactivated", LogLevel.Info)
                    resolve();
                });
            } else {
                Log.log("Close Log", LogLevel.Debug);
                Log.dispose();
                Log.log("Deactivated", LogLevel.Info)
                resolve();
            }
        }).catch(e => {
            Log.error("error disposing: " + e);
        });
    });
}

function registerFormatter() {
    formatter = new ViperFormatter();
}

let autoVerify: boolean = true;

function toggleAutoVerify() {
    autoVerify = !autoVerify;
    if (autoVerify) {
        State.statusBarItem.update("Auto Verify is " + (autoVerify ? "on" : "off"), Color.SUCCESS);
    }
}

function startAutoSaver() {
    let autoSaveTimeout = 1000;//ms
    autoSaver = new Timer(() => {
        //only save viper files
        if (vscode.window.activeTextEditor != null && vscode.window.activeTextEditor.document.languageId == 'viper') {
            if (Helper.getConfiguration('preferences').autoSave === true) {
                vscode.window.activeTextEditor.document.save();
            }
        }
    }, autoSaveTimeout);

    State.context.subscriptions.push(autoSaver);

    let onActiveTextEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(resetAutoSaver);
    let onTextEditorSelectionChange = vscode.window.onDidChangeTextEditorSelection(selectionChange => {
        if (Helper.isViperSourceFile(selectionChange.textEditor.document.uri)) {
            resetAutoSaver();
        }
    });
    State.context.subscriptions.push(onActiveTextEditorChangeDisposable);
    State.context.subscriptions.push(onTextEditorSelectionChange);
}

function resetAutoSaver() {
    autoSaver.reset();
}

let lastState: VerificationState = VerificationState.Stopped;

function handleStateChange(params: StateChangeParams) {
    try {
        lastState = params.newState;
        if (!params.progress)
            Log.log("The new state is: " + VerificationState[params.newState], LogLevel.Debug);
        let window = vscode.window;
        switch (params.newState) {
            case VerificationState.Starting:
                State.isBackendReady = false;
                State.statusBarItem.update('starting', Color.ACTIVE);
                break;
            case VerificationState.VerificationRunning:
                progressLabel = `verifying ${params.filename}:`;
                addTiming(params.progress, Color.ACTIVE);
                State.abortButton.show();
                break;
            case VerificationState.PostProcessing:
                progressLabel = `postprocessing ${params.filename}:`;
                addTiming(params.progress, Color.ACTIVE);
                break;
            case VerificationState.Stage:
                Log.log("Run " + params.stage + " for " + params.filename, LogLevel.Info);
                State.statusBarItem.update(`File ${params.filename}: Stage ${params.stage}`, Color.ACTIVE);
            case VerificationState.Ready:
                clearInterval(progressUpdater);
                State.statusBarProgress.hide();
                State.abortButton.hide();

                State.viperFiles.forEach(file => {
                    file.verifying = false;
                });
                State.isVerifying = false;

                if (!params.verificationCompleted) {
                    State.statusBarItem.update("ready", Color.READY);
                }
                else {
                    let uri = vscode.Uri.parse(params.uri);

                    //since at most one file can be verified at a time, set all to non-verified before potentially setting one to verified 
                    State.viperFiles.forEach(file => file.verified = false);

                    let verifiedFile = State.getFileState(params.uri);
                    verifiedFile.success = params.success;
                    if (params.success != Success.Aborted && params.success != Success.Error) {
                        verifiedFile.verified = true;
                    }

                    //complete the timing measurement
                    addTiming(100, Color.ACTIVE, true);
                    if (Helper.getConfiguration("preferences").showProgress === true) {
                        verifiedFile.stateVisualizer.addTimingInformationToFileState({ total: params.time, timings: timings });
                    }

                    let msg: string = "";
                    switch (params.success) {
                        case Success.Success:
                            msg = `Successfully verified ${params.filename} in ${Helper.formatSeconds(params.time)}`;
                            Log.log(msg, LogLevel.Default);
                            State.statusBarItem.update("$(check) " + msg, Color.SUCCESS);
                            if (params.manuallyTriggered) Log.hint(msg);
                            break;
                        case Success.ParsingFailed:
                            msg = `Parsing ${params.filename} failed after ${Helper.formatSeconds(params.time)}`;
                            Log.log(msg, LogLevel.Default);
                            State.statusBarItem.update("$(x) " + msg, Color.ERROR);
                            break;
                        case Success.TypecheckingFailed:
                            msg = `Type checking ${params.filename} failed after ${Helper.formatSeconds(params.time)} with ${params.nofErrors} error${params.nofErrors == 1 ? "s" : ""}`;
                            Log.log(msg, LogLevel.Default);
                            State.statusBarItem.update("$(x) " + msg, Color.ERROR);
                            break;
                        case Success.VerificationFailed:
                            msg = `Verifying ${params.filename} failed after ${Helper.formatSeconds(params.time)} with ${params.nofErrors} error${params.nofErrors == 1 ? "s" : ""}`;
                            Log.log(msg, LogLevel.Default);
                            State.statusBarItem.update("$(x) " + msg, Color.ERROR);
                            break;
                        case Success.Aborted:
                            State.statusBarItem.update("Verification aborted", Color.WARNING);
                            Log.log(`Verifying ${params.filename} was aborted`, LogLevel.Info);
                            break;
                        case Success.Error:
                            let moreInfo = " - see View->Output->Viper for more info"
                            State.statusBarItem.update(`$(x) Internal error` + moreInfo, Color.ERROR);
                            msg = `Verifying ${params.filename} failed due to an internal error`;
                            Log.error(`Internal Error: failed to verify ${params.filename}: Reason: ` + (params.error && params.error.length > 0 ? params.error : "Unknown Reason: Set loglevel to 5 and see the viper.log file for more details"));
                            Log.hint(msg + moreInfo);

                            //for unit test 
                            if (State.unitTest) {
                                State.unitTest({ event: 'InternalError' });
                            }
                            break;
                        case Success.Timeout:
                            State.statusBarItem.update("Verification timed out", Color.WARNING);
                            Log.log(`Verifying ${params.filename} timed out`, LogLevel.Info);
                            break;
                    }
                    if (State.unitTest) {
                        if (verificationCompleted(params.success)) {
                            State.unitTest({ event: "VerificationComplete", fileName: params.filename, backend: State.activeBackend });
                        }
                    }
                    workList.push({ type: TaskType.VerificationComplete, uri: uri, manuallyTriggered: false });
                }
                if (verifyingAllFiles) {
                    autoVerificationResults.push(`${Success[params.success]}: ${Uri.parse(params.uri).fsPath}`);
                    autoVerifyFile();
                }
                break;
            case VerificationState.Stopping:
                State.statusBarItem.update('preparing', Color.ACTIVE);
                break;
            case VerificationState.Stopped:
                clearInterval(progressUpdater);
                State.statusBarItem.update('stopped', Color.READY);
                break;
            default:
                break;
        }
    } catch (e) {
        Log.error("Error handling state change (critical): " + e);
    }
}

//for unittest
function verificationCompleted(success: Success) {
    return success === Success.Success
        || success === Success.ParsingFailed
        || success === Success.TypecheckingFailed
        || success === Success.VerificationFailed;
}

function handleSettingsCheckResult(params: SettingsCheckedParams) {
    if (params.errors && params.errors.length > 0) {
        let nofErrors = 0;
        let nofWarnings = 0;
        let message = "";
        params.errors.forEach(error => {
            switch (error.type) {
                case SettingsErrorType.Error:
                    nofErrors++;
                    Log.error("Settings Error: " + error.msg, LogLevel.Default);
                    break;
                case SettingsErrorType.Warning:
                    nofWarnings++;
                    Log.log("Settings Warning: " + error.msg, LogLevel.Info);
                    break;
            }
            message = error.msg;
        })

        let errorCounts = ((nofErrors > 0 ? ("" + nofErrors + " Error" + (nofErrors > 1 ? "s" : "")) : "") + (nofWarnings > 0 ? (" " + nofWarnings + " Warning" + (nofWarnings > 1 ? "s" : "")) : "")).trim();

        //update status bar
        Log.log(errorCounts + " in settings detected.", LogLevel.Default);
        let text = errorCounts + " in settings";
        if (nofErrors > 0) {
            State.statusBarItem.update(text, Color.ERROR);
            State.isBackendReady = false;
        } else if (nofWarnings > 0) {
            State.statusBarItem.update(text, Color.WARNING);
        }

        if (nofErrors + nofWarnings > 1)
            message = "see View->Output->Viper";

        Log.hint("Viper Settings: " + errorCounts + ": " + message, true, true);
    }
}

function registerHandlers() {
    State.client.onReady().then(ready => {

        State.client.onNotification(Commands.StateChange, (params: StateChangeParams) => handleStateChange(params));
        State.client.onNotification(Commands.SettingsChecked, (data: SettingsCheckedParams) => handleSettingsCheckResult(data));
        State.client.onNotification(Commands.Hint, (data: HintMessage) => {
            Log.hint(data.message, data.showSettingsButton, data.showViperToolsUpdateButton);
        });
        State.client.onNotification(Commands.Log, (msg: { data: string, logLevel: LogLevel }) => {
            Log.log((Log.logLevel >= LogLevel.Debug ? "S: " : "") + msg.data, msg.logLevel);
        });
        State.client.onNotification(Commands.Progress, (msg: { data: Progress, logLevel: LogLevel }) => {
            Log.progress(msg.data, msg.logLevel);
        });
        State.client.onNotification(Commands.ToLogFile, (msg: { data: string, logLevel: LogLevel }) => {
            Log.toLogFile((Log.logLevel >= LogLevel.Debug ? "S: " : "") + msg.data, msg.logLevel);
        });
        State.client.onNotification(Commands.Error, (msg: { data: string, logLevel: LogLevel }) => {
            Log.error((Log.logLevel >= LogLevel.Debug ? "S: " : "") + msg.data, msg.logLevel);
        });

        State.client.onNotification(Commands.BackendChange, (newBackend: string) => {
            try {
                State.activeBackend = newBackend;
                State.backendStatusBar.update(newBackend, Color.READY);
                State.reset();
                State.statusBarProgress.hide();
                State.abortButton.hide();
            } catch (e) {
                Log.error("Error handling backend change: " + e);
            }
        });
        State.client.onNotification(Commands.ViperUpdateComplete, (success) => {
            if (success) {
                Log.hint("The ViperTools update is complete.");
                State.statusBarItem.update("ViperTools update completed", Color.SUCCESS);
                if (State.unitTest) {
                    State.unitTest({ event: "ViperUpdateComplete" });
                }
            } else {
                Log.hint("The ViperTools update failed. Missing permission: change the ViperTools path in the Settings or manually install the ViperTools.");
                State.statusBarItem.update("ViperTools update failed", Color.ERROR);
                if (State.unitTest) {
                    State.unitTest({ event: "ViperUpdateFailed" });
                }
            }
            workList.push({ type: TaskType.ViperToolsUpdateComplete, uri: null, manuallyTriggered: false });
            State.statusBarProgress.hide();
        });
        State.client.onNotification(Commands.FileOpened, (uri: string) => {
            try {
                Log.log("File openend: " + path.basename(uri), LogLevel.Info);
                let uriObject: Uri = Uri.parse(uri);
                let fileState = State.getFileState(uri);
                if (fileState) {
                    fileState.open = true;
                    fileState.verifying = false;
                    workList.push({ type: TaskType.Verify, uri: uriObject, manuallyTriggered: false });
                }
            } catch (e) {
                Log.error("Error handling file opened notification: " + e);
            }
        });
        State.client.onNotification(Commands.FileClosed, (uri: string) => {
            try {
                let uriObject: Uri = Uri.parse(uri);
                Log.log("File closed: " + path.basename(uriObject.path), LogLevel.Info);
                let fileState = State.getFileState(uri);
                if (fileState) {
                    fileState.open = false;
                    fileState.verified = false;
                }
                fileState.stateVisualizer.removeSpecialCharsFromClosedDocument(() => { });
            } catch (e) {
                Log.error("Error handling file closed notification: " + e);
            }
        });
        State.client.onRequest(Commands.RequestRequiredVersion, () => {
            return getRequiredVersion();
        });
        State.client.onRequest(Commands.GetViperFileEndings, () => {
            Helper.loadViperFileExtensions();
            return Helper.viperFileEndings;
        });
        State.context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((params) => {
            try {
                workList.push({ type: TaskType.Save, uri: params.uri });
            } catch (e) {
                Log.error("Error handling saved document: " + e);
            }
        }));
        State.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
            try {
                Log.updateSettings();
                stopDebuggingOnServer();
                stopDebuggingLocally();
            } catch (e) {
                Log.error("Error handling configuration change: " + e);
            }
        }));

        State.client.onNotification(Commands.BackendReady, (params: BackendReadyParams) => {
            handleBackendReadyNotification(params);
        });

        //Heap visualization
        State.client.onNotification(Commands.StepsAsDecorationOptions, params => {
            try {
                let castParams = <StepsAsDecorationOptionsResult>params;
                if (!castParams) {
                    Log.error("Invalid Params for StepsAdDecorationOptions");
                }
                let visualizer = State.getVisualizer(castParams.uri);
                visualizer.storeNewStates(castParams);
            } catch (e) {
                Log.error("Error handling steps as decoration options notification: " + e);
            }
        });

        State.client.onRequest(Commands.HeapGraph, (heapGraph: HeapGraph) => {
            try {
                if (!heapGraph) return;
                if (Helper.areAdvancedFeaturesEnabled()) {
                    let visualizer = State.getVisualizer(heapGraph.fileUri);
                    let state = visualizer.decorationOptions[heapGraph.state];
                    if (Helper.getConfiguration("advancedFeatures").simpleMode === true) {
                        //Simple Mode
                        if (state.isErrorState) {
                            //replace the error state
                            visualizer.focusOnState(heapGraph);
                        } else {
                            //replace the execution state
                            visualizer.setState(heapGraph);
                        }
                    } else {
                        //Advanced Mode
                        if (heapGraph.state != visualizer.previousState) {
                            visualizer.pushState(heapGraph);
                        }
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
                let visualizer = State.getVisualizer(uri);
                if (visualizer) {
                    visualizer.showStateSelection(start);
                }
            } catch (e) {
                Log.error("Error handling text editor selection change: " + e);
            }
        });

        /*State.client.onRequest(Commands.StateSelected, change => {
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

        State.client.onNotification(Commands.VerificationNotStarted, uri => {
            try {
                Log.log("Verification not started for " + path.basename(<string>uri), LogLevel.Debug);
                //reset the verifying flag if it is not beeing verified
                State.viperFiles.forEach(file => {
                    file.verifying = false;
                });
                State.isVerifying = false;
                workList.push({ type: TaskType.VerificationFailed, uri: Uri.parse(<string>uri), manuallyTriggered: true });
            } catch (e) {
                Log.error("Error handling verification not started request: " + e);
            }
        });

        State.client.onNotification(Commands.StopDebugging, () => {
            stopDebuggingLocally();
        });

        //Command Handlers
        //verify
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.verify', () => {
            let fileUri = Helper.getActiveFileUri();
            if (!fileUri) {
                Log.log("Cannot verify, no document is open.", LogLevel.Info);
            } else if (!Helper.isViperSourceFile(fileUri)) {
                Log.log("Cannot verify the active file, its not a viper file.", LogLevel.Info);
            } else {
                workList.push({ type: TaskType.Verify, uri: fileUri, manuallyTriggered: true });
            }
        }));

        //verifyAllFilesInWorkspace
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.verifyAllFilesInWorkspace', () => {
            verifyAllFilesInWorkspace();
        }));

        //toggleAutoVerify
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.toggleAutoVerify', () => {
            toggleAutoVerify();
        }));

        //showAllStates
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.showAllStates', () => {
            if (State.isDebugging) {
                let viperFile = State.getLastActiveFile();
                if ((!Helper.getConfiguration("advancedFeatures").simpleMode === true) && viperFile) {
                    viperFile.stateVisualizer.showAllDecorations();
                }
            }
        }));

        //selectBackend
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.selectBackend', (selectBackend) => {
            try {
                if (!State.client) {
                    Log.hint("Extension not ready yet.");
                } else {
                    State.client.sendRequest(Commands.RequestBackendNames, null).then((backendNames: string[]) => {
                        if (backendNames.length > 1) {
                            if (!selectBackend || !backendNames.some(x => x == selectBackend)) {
                                vscode.window.showQuickPick(backendNames).then(selectedBackend => {
                                    if (selectedBackend && selectedBackend.length > 0) {
                                        startBackend(selectedBackend);
                                    } else {
                                        Log.log("No backend was selected, don't change the backend", LogLevel.Info);
                                    }
                                });
                            } else {
                                startBackend(selectBackend);
                            }
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

        //start Debugging
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.startDebugging', () => {
            startDebugging();
        }));

        //stopVerification
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.stopVerification', () => {
            workList.push({ type: TaskType.Stop, uri: null, manuallyTriggered: true });
        }));

        //format
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.format', () => {
            try {
                formatter.formatOpenDoc();
            } catch (e) {
                Log.error("Error handling formating request: " + e);
            }
        }));

        //open logFile
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.openLogFile', () => {
            openLogFile();
        }));

        //remove diagnostics of open file
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.removeDiagnostics', () => {
            removeDiagnostics();
        }));

        //automatic installation and updating of viper tools
        State.context.subscriptions.push(vscode.commands.registerCommand('viper.updateViperTools', () => {
            workList.push({ type: TaskType.UpdateViperTools, uri: null, manuallyTriggered: false });
        }));
    });
}

function openLogFile() {
    try {
        Log.log("Open logFile located at: " + Log.logFilePath, LogLevel.Info);
        vscode.workspace.openTextDocument(Log.logFilePath).then(textDocument => {
            if (!textDocument) {
                Log.hint("Cannot open the logFile, it is too large to be opened within VSCode.");
            } else {
                vscode.window.showTextDocument(textDocument, vscode.ViewColumn.Two).then(() => {
                    Log.log("Showing logfile succeeded", LogLevel.Debug);
                    if(State.unitTest){
                        State.unitTest({ event: 'LogFileOpened' });
                    }
                }, error => {
                    Log.error("vscode.window.showTextDocument call failed while opening the logfile: " + error);
                });
            }
        }, error => {
            Log.error("vscode.window.openTextDocument command failed while opening the logfile: " + error);
        });
    } catch (e) {
        Log.error("Error opening logFile: " + e);
    }
}

function startDebugging() {
    try {
        //check if all the requirements are met to start debugging
        let canDebug = canStartDebugging();
        if (canDebug.result) {
            let lastActiveFile = State.getLastActiveFile();
            if (!lastActiveFile) {
                Log.hint("Don't debug there is no file to debug.");
                return;
            }
            let uri = lastActiveFile.uri;
            let filename = path.basename(uri.toString());
            let openDoc = uri.path;
            if (State.isWin) {
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
            }
            if (State.isDebugging) {
                Log.hint("Don't debug " + filename + ", the file is already being debugged");
                return;
            }
            showStates(() => {
                vscode.commands.executeCommand('vscode.startDebug', launchConfig).then(() => {
                    Log.log('Debug session started successfully', LogLevel.Info);
                    State.isDebugging = true;
                    vscode.commands.executeCommand("workbench.view.debug");
                }, err => {
                    Log.error("Error starting debugger: " + err.message);
                });
            });
        } else if (canDebug.reason) {
            Log.hint(canDebug.reason);
        }
    } catch (e) {
        Log.error("Error starting debug session: " + e);
    }
}

function doStopVerification(uriToStop: string, manuallyTriggered: boolean) {
    if (verifyingAllFiles) {
        printAllVerificationResults();
        verifyingAllFiles = false;
    }
    if (State.client) {
        if (State.isVerifying) {
            clearInterval(progressUpdater);
            Log.log("Verification stop request", LogLevel.Debug);
            State.abortButton.hide();
            State.statusBarItem.update("aborting", Color.WARNING);
            State.statusBarProgress.hide();
            State.client.sendRequest(Commands.StopVerification, uriToStop).then((success) => {
                workList.push({ type: TaskType.StoppingComplete, uri: null, manuallyTriggered: false });
            });
        } else {
            let msg = "Cannot stop the verification, no verification is running.";
            if (manuallyTriggered) {
                Log.hint(msg);
            } else {
                Log.log(msg, LogLevel.Debug);
            }
            workList.push({ type: TaskType.StoppingComplete, uri: null, manuallyTriggered: false });
        }
    } else {
        let msg = "Cannot stop the verification, the extension not ready yet.";
        if (manuallyTriggered) {
            Log.hint(msg);
        } else {
            Log.log(msg, LogLevel.Debug);
        }
        workList.push({ type: TaskType.StoppingComplete, uri: null, manuallyTriggered: false });
    }
}

function startBackend(backendName: string) {
    try {
        State.isBackendReady = false;
        State.client.sendNotification(Commands.StartBackend, backendName);
    } catch (e) {
        Log.error("Error starting backend: " + e);
    }
}

function handleBackendReadyNotification(params: BackendReadyParams) {
    try {
        if (!State.isVerifying) {
            State.statusBarItem.update("ready", Color.READY);
        }
        if (params.restarted) {
            //no file is verifying
            State.resetViperFiles()
            workList.push({ type: TaskType.Clear, uri: Helper.getActiveFileUri(), manuallyTriggered: false });
            if (Helper.getConfiguration('preferences').autoVerifyAfterBackendChange === true) {
                Log.log("AutoVerify after backend change", LogLevel.Info);
                workList.push({ type: TaskType.Verify, uri: Helper.getActiveFileUri(), manuallyTriggered: false });
            }
            //for unit testing
            if (State.unitTest) {
                State.unitTest({ event: "BackendStarted", backend: params.name });
            }
        }

        Log.log("Backend ready: " + params.name, LogLevel.Info);
        State.isBackendReady = true;
    } catch (e) {
        Log.error("Error handling backend started notification: " + e);
    }
}

function stopDebuggingOnServer() {
    if (State.isDebugging) {
        Log.log("Tell language server to stop debugging", LogLevel.Debug);
        State.client.sendNotification(Commands.StopDebugging);
    }
}

function stopDebuggingLocally() {
    try {
        if (State.isDebugging) {
            Log.log("Stop Debugging", LogLevel.Info);
            let visualizer = State.getLastActiveFile().stateVisualizer;
            hideStates(() => { }, visualizer);
        }
    } catch (e) {
        Log.error("Error handling stop debugging request: " + e);
    }
}

function showStates(callback) {
    try {
        if (Helper.areAdvancedFeaturesEnabled()) {
            if (!StateVisualizer.showStates) {
                StateVisualizer.showStates = true;
                let visualizer = State.getLastActiveFile().stateVisualizer;
                visualizer.removeSpecialCharacters(() => {
                    visualizer.addCharacterToDecorationOptionLocations(() => {
                        visualizer.showDecorations();
                        callback();
                    });
                });
            } else {
                Log.log("don't show states, they are already shown", LogLevel.Debug);
            }
        }
    } catch (e) {
        Log.error("Error showing States: " + e);
    }
}

function hideStates(callback, visualizer: StateVisualizer) {
    try {
        if (Helper.areAdvancedFeaturesEnabled()) {
            let editor = visualizer.viperFile.editor;
            //vscode.window.showTextDocument(editor.document, editor.viewColumn).then(() => {  
            vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup').then(success => { }, error => {
                Log.error("Error changing the focus to the first editorGroup");
            });
            State.isDebugging = false;
            Log.log("Hide states for " + visualizer.viperFile.name(), LogLevel.Info);
            StateVisualizer.showStates = false;
            visualizer.removeSpecialCharacters(() => {
                visualizer.hideDecorations();
                visualizer.reset();
                callback();
            });
        } else {
            callback();
        }
        //});
    } catch (e) {
        Log.error("Error hiding States: " + e);
    }
}

function verify(fileState: ViperFileState, manuallyTriggered: boolean) {
    try {
        //reset timing;
        verificationStartTime = Date.now();
        timings = [];
        clearInterval(progressUpdater);
        lastProgress = 0;
        //load expected timing
        let expectedTimings: TimingInfo = fileState.stateVisualizer.getLastTiming();
        if (expectedTimings && expectedTimings.total) {
            Log.log("Verification is expected to take " + Helper.formatSeconds(expectedTimings.total), LogLevel.Info);
            oldTimings = expectedTimings;
        }

        let uri = fileState.uri.toString();
        if (Helper.isViperSourceFile(uri)) {
            if (!State.client) {
                Log.hint("Extension not ready yet.");
            } else {
                let visualizer = State.getVisualizer(uri);
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
                        let progress = getProgress(lastProgress)
                        if (progress != lastProgress) {
                            lastProgress = progress;
                            let totalProgress = verifyingAllFiles ? ` (${nextFileToAutoVerify + 1}/${allFilesToAutoVerify.length})` : "";
                            Log.log("Progress: " + progress + " (" + fileState.name() + ")", LogLevel.Debug);
                            State.statusBarProgress.updateProgressBar(progress);
                            State.statusBarItem.updateProgressLabel(progressLabel, progress, totalProgress);
                        }
                    }, 500);

                    Log.log("Request verification for " + path.basename(uri), LogLevel.Verbose);

                    let workspace = vscode.workspace.rootPath ? vscode.workspace.rootPath : path.dirname(fileState.uri.fsPath);
                    let params: VerifyParams = { uri: uri, manuallyTriggered: manuallyTriggered, workspace: workspace };
                    //request verification from Server
                    State.client.sendNotification(Commands.Verify, params);

                    State.isVerifying = true;
                }, visualizer);
            }
            //in case a debugging session is still running, stop it
            stopDebuggingOnServer();
            stopDebuggingLocally();
        }
    } catch (e) {
        if (!State.isVerifying) {
            //make sure the worklist is not blocked
            workList.push({ type: TaskType.VerificationFailed, uri: fileState.uri });
        }
        Log.error("Error requesting verification of " + fileState.name);
    }
}

function addTiming(paramProgress: number, color: string, hide: boolean = false) {
    let showProgressBar = Helper.getConfiguration('preferences').showProgress === true;
    timings.push(Date.now() - verificationStartTime);
    let progress = getProgress(paramProgress || 0);
    Log.log("Progress: " + progress, LogLevel.Debug);
    let totalProgress = verifyingAllFiles ? ` (${nextFileToAutoVerify + 1}/${allFilesToAutoVerify.length})` : "";
    lastProgress = progress;
    if (hide)
        State.statusBarProgress.hide();
    else {
        State.statusBarProgress.updateProgressBar(progress, null, showProgressBar);
        State.statusBarItem.updateProgressLabel(progressLabel, progress, totalProgress);
    }
}

function getProgress(progress: number): number {
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
                let leftToCompute = oldTotal - timeSpentLastTime
                let estimatedTotal = timeSpent + leftToCompute;
                progress = 100 * Math.min((timeAlreadySpent / estimatedTotal), 1);
            }
            //don't show 100%, because otherwise people think it is done.
            if (progress > 99) progress = 99;
        }
        return progress;
    } catch (e) {
        Log.error("Error computing progress: " + e);
    }
}



function removeDiagnostics() {
    if (vscode.window.activeTextEditor) {
        let file = vscode.window.activeTextEditor.document.uri.toString();
        State.client.sendRequest(Commands.RemoveDiagnostics, file).then(success => {
            if (success) {
                Log.log("Diagnostics successfully removed", LogLevel.Debug);
            } else {
                Log.log("Removing diagnostics failed", LogLevel.Debug);
            }
        })
    }
}