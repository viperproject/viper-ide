'use strict';

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

export interface Task {
    type: TaskType;
    uri?: vscode.Uri;
    backend?: string;
    manuallyTriggered?: boolean;
    success?: Success;
}

export enum TaskType {
    NoOp = 0, Clear = 1,
    Save = 2, Verify = 3, StopVerification = 4, UpdateViperTools = 5, StartBackend = 6, StopBackend = 7,
    Verifying = 30, StopVerifying = 40, UpdatingViperTools = 50, StartingBackend = 60, StoppingBackend = 70,
    VerificationComplete = 300, VerificationFailed = 301, VerificationStopped = 400, ViperToolsUpdateComplete = 500, BackendStarted = 600, BackendStopped = 700
}

export interface CheckResult {
    result: boolean,
    reason: string,
    error: string
}

let NoOp: TaskType = TaskType.NoOp;

export class VerificationController {

    private lastCanStartVerificationReason: string;
    private lastCanStartVerificationUri: vscode.Uri;

    private controller: Timer;
    private workList: Task[];

    //for timing:
    private verificationStartTime: number;
    private timings: number[];
    private oldTimings: TimingInfo;
    private progressUpdater;
    private lastProgress: number;
    private progressLabel = "";

    private lastState: VerificationState = VerificationState.Stopped;

    //for autoverify all viper files in workspace
    private verifyingAllFiles = false;
    private allFilesToAutoVerify: Uri[];
    private nextFileToAutoVerify: number;
    private autoVerificationResults: string[];
    private autoVerificationStartTime: number;

    public addToWorklist(task: Task) {
        this.workList.push(task);
    }

    private isActive(type: TaskType) {
        return type == TaskType.Verifying || type == TaskType.StopVerifying || type == TaskType.UpdatingViperTools || type == TaskType.StartingBackend || type == TaskType.StoppingBackend;
    }

    private isImportant(type: TaskType) {
        return type == TaskType.StopBackend || type == TaskType.StartBackend || type == TaskType.StopVerification;
    }

    constructor() {
        this.workList = [];
        let verificationTimeout = 100;//ms
        this.controller = new Timer(() => {
            try {
                //only keep most recent verify request
                let verifyFound = false;
                let stopFound = false;
                let isStopManuallyTriggered = false;
                let clear = false;
                let verificationComplete = false;
                let verificationStopped = false;
                let verificationFailed = false;
                let completedOrFailedFileUri: vscode.Uri;
                let uriOfFoundVerfy: vscode.Uri;
                let viperToolsUpdateFound = false;
                let viperToolsUpdateComplete = false;
                let backendStarted = false;
                let backendStopped = false;

                for (let i = this.workList.length - 1; i >= 0; i--) {
                    let cur: TaskType = this.workList[i].type;
                    if (clear && !this.isActive(cur) && !this.isImportant(cur)) {
                        //clear the this.workList
                        this.workList[i].type = NoOp;
                    }
                    switch (cur) {
                        case TaskType.UpdateViperTools:
                            clear = true;
                            //cancel multiple update requests
                            if (this.workList[0].type == TaskType.UpdatingViperTools) {
                                this.workList[i].type = NoOp;
                            }
                            viperToolsUpdateFound = true;
                            break;
                        case TaskType.Verify:
                            //remove all older verify tasks
                            if (verifyFound || stopFound) {
                                this.workList[i].type = NoOp;
                            } else {
                                verifyFound = true;
                                uriOfFoundVerfy = this.workList[i].uri;
                            }
                            if ((verificationComplete || verificationFailed) && Helper.uriEquals(completedOrFailedFileUri, this.workList[i].uri)) {
                                //remove verification requests of just verified file
                                this.workList[i].type = NoOp;
                            }
                            break;
                        case TaskType.StopVerification:
                            this.workList[i].type = NoOp;
                            stopFound = true;
                            isStopManuallyTriggered = isStopManuallyTriggered || this.workList[i].manuallyTriggered;
                            break;
                        case TaskType.Clear:
                            this.workList[i].type = NoOp;
                            clear = true;
                            break;
                        case TaskType.VerificationComplete:
                            this.workList[i].type = NoOp;
                            verificationComplete = true;
                            completedOrFailedFileUri = this.workList[i].uri;
                            break;
                        case TaskType.VerificationStopped:
                            this.workList[i].type = NoOp;
                            verificationStopped = true;
                            break;
                        case TaskType.VerificationFailed:
                            this.workList[i].type = NoOp;
                            verificationFailed = true;
                            completedOrFailedFileUri = this.workList[i].uri;
                            break;
                        case TaskType.ViperToolsUpdateComplete:
                            this.workList[i].type = NoOp;
                            viperToolsUpdateComplete = true;
                            break;
                        case TaskType.StartBackend:
                            clear = true;
                            break;
                        case TaskType.StopBackend:
                            clear = true;
                            stopFound = true;
                            isStopManuallyTriggered = isStopManuallyTriggered || this.workList[i].manuallyTriggered;
                            break;
                        case TaskType.BackendStarted:
                            this.workList[i].type = NoOp;
                            backendStarted = true;
                            State.isBackendReady = true;
                            break;
                        case TaskType.BackendStopped:
                            this.workList[i].type = NoOp;
                            backendStopped = true;
                            break;
                    }
                }

                //remove leading NoOps
                while (this.workList.length > 0 && this.workList[0].type == NoOp) {
                    this.workList.shift();
                }

                //Start processing the tasks
                let done = false;
                while (!done && this.workList.length > 0) {
                    let task = this.workList[0];

                    let fileState = State.getFileState(task.uri); //might be null
                    switch (task.type) {
                        case TaskType.Verify:
                            let canVerify = this.canStartVerification(task);
                            if (canVerify.result) {
                                task.type = TaskType.Verifying;
                                this.verify(fileState, task.manuallyTriggered);
                            } else if (canVerify.reason && (canVerify.reason != this.lastCanStartVerificationReason || (task.uri && !Helper.uriEquals(task.uri, this.lastCanStartVerificationUri)))) {
                                Log.log(canVerify.reason, LogLevel.Info);
                                this.lastCanStartVerificationReason = canVerify.reason;
                            }
                            this.lastCanStartVerificationUri = task.uri;
                            break;
                        case TaskType.Verifying:
                            //if another verification is requested, the current one must be stopped
                            if ((verifyFound && !Helper.uriEquals(uriOfFoundVerfy, task.uri)) || stopFound || viperToolsUpdateFound) {
                                task.type = TaskType.StopVerifying;
                                Log.log("Stop the running verification of " + path.basename(Common.uriToPath(task.uri.toString())), LogLevel.Debug);
                                this.stopVerification(task.uri.toString(), isStopManuallyTriggered);
                            }
                            //block until verification is complete or failed
                            if (verificationComplete || verificationFailed) {
                                if (!Helper.uriEquals(completedOrFailedFileUri, task.uri)) {
                                    Log.error("WARNING: the " + (verificationComplete ? "completed" : "failed") + " verification uri does not correspond to the uri of the started verification.");
                                }
                                task.type = NoOp;
                            }
                            break;
                        case TaskType.StopVerifying:
                            //block until verification is stoped;
                            if (verificationStopped) {
                                task.type = NoOp;
                                //for unitTest
                                if (State.unitTest) {
                                    State.unitTest({ event: 'VerificationStopped' });
                                }
                            }
                            break;
                        case TaskType.UpdateViperTools:
                            if (State.isBackendReady) {
                                this.workList.unshift({ type: TaskType.StopBackend, manuallyTriggered: task.manuallyTriggered })
                            } else {
                                task.type = TaskType.UpdatingViperTools;
                                State.client.sendNotification(Commands.UpdateViperTools);
                                State.statusBarProgress.updateProgressBar(0);
                            }
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
                                    this.stopDebuggingOnServer();
                                    this.stopDebuggingLocally();
                                    this.addToWorklist({ type: TaskType.Verify, uri: task.uri, manuallyTriggered: false });
                                }
                            }
                            break;
                        case TaskType.StartBackend:
                            if (State.isBackendReady) {
                                this.workList.unshift({ type: TaskType.StopBackend, manuallyTriggered: task.manuallyTriggered })
                            } else {
                                task.type = TaskType.StartingBackend;
                                State.client.sendNotification(Commands.StartBackend, task.backend);
                            }
                            break;
                        case TaskType.StartingBackend:
                            //block until backend change complete;
                            if (backendStarted) {
                                task.type = NoOp;
                                State.backendStatusBar.update(task.backend, Color.READY);
                                State.activeBackend = task.backend;
                            }
                            break;
                        case TaskType.StopBackend:
                            task.type = TaskType.StoppingBackend;
                            State.reset()
                            State.client.sendNotification(Commands.StopBackend);
                            break;
                        case TaskType.StoppingBackend:
                            //block until backend change complete;
                            if (backendStopped) {
                                task.type = NoOp;
                            }
                            break;
                        default:
                            //in case a completion event reaches the bottom of the this.workList, ignore it.
                            task.type = NoOp;
                    }

                    //in case the leading element is now a NoOp, remove it, otherwise block.
                    if (task.type == NoOp) {
                        this.workList.shift();
                    } else {
                        done = true;
                    }
                }
            } catch (e) {
                Log.error("Error in verification controller (critical): " + e);
                this.workList.shift();
            }
        }, verificationTimeout);
        State.context.subscriptions.push(this.controller);
    }

    private canStartVerification(task: Task): CheckResult {
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
                        if (!task.manuallyTriggered && !State.autoVerify) {
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

    private verify(fileState: ViperFileState, manuallyTriggered: boolean) {
        try {
            //reset timing;
            this.verificationStartTime = Date.now();
            this.timings = [];
            clearInterval(this.progressUpdater);
            this.lastProgress = 0;
            //load expected timing
            let expectedTimings: TimingInfo = fileState.stateVisualizer.getLastTiming();
            if (expectedTimings && expectedTimings.total) {
                Log.log("Verification is expected to take " + Helper.formatSeconds(expectedTimings.total), LogLevel.Info);
                this.oldTimings = expectedTimings;
            }

            let uri = fileState.uri.toString();
            if (Helper.isViperSourceFile(uri)) {
                if (!State.client) {
                    Log.hint("Extension not ready yet.");
                } else {
                    let visualizer = State.getVisualizer(uri);
                    visualizer.completeReset();
                    this.hideStates(() => {
                        //delete old SymbExLog:
                        //Log.deleteFile(Log.getSymbExLogPath());

                        //change fileState
                        fileState.changed = false;
                        fileState.verified = false;
                        fileState.verifying = true;

                        //start progress updater
                        clearInterval(this.progressUpdater);
                        this.progressUpdater = setInterval(() => {
                            let progress = this.getProgress(this.lastProgress)
                            if (progress != this.lastProgress) {
                                this.lastProgress = progress;
                                let totalProgress = this.getTotalProgress();
                                Log.log("Progress: " + progress + " (" + fileState.name() + ")", LogLevel.Debug);
                                State.statusBarProgress.updateProgressBar(progress);
                                State.statusBarItem.updateProgressLabel(this.progressLabel, progress, totalProgress);
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
                this.stopDebuggingOnServer();
                this.stopDebuggingLocally();
            }
        } catch (e) {
            if (!State.isVerifying) {
                //make sure the worklist is not blocked
                State.addToWorklist({ type: TaskType.VerificationFailed, uri: fileState.uri });
            }
            Log.error("Error requesting verification of " + fileState.name);
        }
    }

    private stopVerification(uriToStop: string, manuallyTriggered: boolean) {
        if (this.verifyingAllFiles) {
            this.printAllVerificationResults();
            this.verifyingAllFiles = false;
        }
        if (State.client) {
            if (State.isVerifying) {
                clearInterval(this.progressUpdater);
                Log.log("Verification stop request", LogLevel.Debug);
                State.abortButton.hide();
                State.statusBarItem.update("aborting", Color.WARNING);
                State.statusBarProgress.hide();
                State.client.sendRequest(Commands.StopVerification, uriToStop).then((success) => {
                    State.addToWorklist({ type: TaskType.VerificationStopped, uri: null, manuallyTriggered: false });
                });
            } else {
                let msg = "Cannot stop the verification, no verification is running.";
                if (manuallyTriggered) {
                    Log.hint(msg);
                } else {
                    Log.log(msg, LogLevel.Debug);
                }
                State.addToWorklist({ type: TaskType.VerificationStopped, uri: null, manuallyTriggered: false });
            }
        } else {
            let msg = "Cannot stop the verification, the extension not ready yet.";
            if (manuallyTriggered) {
                Log.hint(msg);
            } else {
                Log.log(msg, LogLevel.Debug);
            }
            State.addToWorklist({ type: TaskType.StopVerification, uri: null, manuallyTriggered: false });
        }
    }

    public stopDebuggingOnServer() {
        if (State.isDebugging) {
            Log.log("Tell language server to stop debugging", LogLevel.Debug);
            State.client.sendNotification(Commands.StopDebugging);
        }
    }

    public stopDebuggingLocally() {
        try {
            if (State.isDebugging) {
                Log.log("Stop Debugging", LogLevel.Info);
                let visualizer = State.getLastActiveFile().stateVisualizer;
                this.hideStates(() => { }, visualizer);
            }
        } catch (e) {
            Log.error("Error handling stop debugging request: " + e);
        }
    }

    private hideStates(callback, visualizer: StateVisualizer) {
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

    private getTotalProgress(): string {
        return this.verifyingAllFiles ? ` (${this.nextFileToAutoVerify + 1}/${this.allFilesToAutoVerify.length})` : "";
    }

    public addTiming(paramProgress: number, color: string, hide: boolean = false) {
        let showProgressBar = Helper.getConfiguration('preferences').showProgress === true;
        this.timings.push(Date.now() - this.verificationStartTime);
        let progress = this.getProgress(paramProgress || 0);
        Log.log("Progress: " + progress, LogLevel.Debug);
        this.lastProgress = progress;
        if (hide)
            State.statusBarProgress.hide();
        else {
            State.statusBarProgress.updateProgressBar(progress, null, showProgressBar);
            State.statusBarItem.updateProgressLabel(this.progressLabel, progress, this.getTotalProgress());
        }
    }

    private getProgress(progress: number): number {
        try {
            let timeSpentUntilLastStep = this.timings.length > 0 ? this.timings[this.timings.length - 1] : 0;
            let timeAlreadySpent = Date.now() - this.verificationStartTime;
            if (this.oldTimings && this.oldTimings.timings) {
                let old = this.oldTimings.timings;
                if (old.length >= this.timings.length) {
                    let timeSpentLastTime = this.timings.length > 0 ? old[this.timings.length - 1] : 0;
                    let oldTotal = old[old.length - 1];
                    let timeSpent = timeSpentUntilLastStep;
                    if (old.length > this.timings.length && (timeAlreadySpent - timeSpentUntilLastStep) > (old[this.timings.length] - old[this.timings.length - 1])) {
                        //if this time we should already have completed the step, factor that in
                        timeSpentLastTime = old[this.timings.length];
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
    public handleStateChange(params: StateChangeParams) {
        try {
            this.lastState = params.newState;
            if (!params.progress)
                Log.log("The new state is: " + VerificationState[params.newState], LogLevel.Debug);
            let window = vscode.window;
            switch (params.newState) {
                case VerificationState.Starting:
                    State.isBackendReady = false;
                    State.statusBarItem.update('starting', Color.ACTIVE);
                    break;
                case VerificationState.VerificationRunning:
                    this.progressLabel = `verifying ${params.filename}:`;
                    this.addTiming(params.progress, Color.ACTIVE);
                    State.abortButton.show();
                    break;
                case VerificationState.PostProcessing:
                    this.progressLabel = `postprocessing ${params.filename}:`;
                    this.addTiming(params.progress, Color.ACTIVE);
                    break;
                case VerificationState.Stage:
                    Log.log("Run " + params.stage + " for " + params.filename, LogLevel.Info);
                    State.statusBarItem.update(`File ${params.filename}: Stage ${params.stage}`, Color.ACTIVE);
                case VerificationState.Ready:
                    clearInterval(this.progressUpdater);
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
                        this.addTiming(100, Color.ACTIVE, true);
                        if (Helper.getConfiguration("preferences").showProgress === true) {
                            verifiedFile.stateVisualizer.addTimingInformationToFileState({ total: params.time, timings: this.timings });
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
                            if (this.verificationCompleted(params.success)) {
                                State.unitTest({ event: "VerificationComplete", fileName: params.filename, backend: State.activeBackend });
                            }
                        }
                        State.addToWorklist({ type: TaskType.VerificationComplete, uri: uri, manuallyTriggered: false });
                    }
                    if (this.verifyingAllFiles) {
                        this.autoVerificationResults.push(`${Success[params.success]}: ${Uri.parse(params.uri).fsPath}`);
                        this.autoVerifyFile();
                    }
                    break;
                case VerificationState.Stopping:
                    State.statusBarItem.update('preparing', Color.ACTIVE);
                    break;
                case VerificationState.Stopped:
                    clearInterval(this.progressUpdater);
                    State.statusBarItem.update('stopped', Color.READY);
                    State.addToWorklist({ type: TaskType.BackendStopped, manuallyTriggered: false });
                    break;
                default:
                    break;
            }
        } catch (e) {
            Log.error("Error handling state change (critical): " + e);
        }
    }

    //for unittest
    private verificationCompleted(success: Success) {
        return success === Success.Success
            || success === Success.ParsingFailed
            || success === Success.TypecheckingFailed
            || success === Success.VerificationFailed;
    }

    public verifyAllFilesInWorkspace() {
        this.autoVerificationStartTime = Date.now();
        this.verifyingAllFiles = true;
        this.autoVerificationResults = [];
        if (!State.isBackendReady) {
            Log.error("The backend must be running before verifying all files in the workspace")
            return;
        }
        let endings = "{" + Helper.viperFileEndings.join(",") + "}";
        vscode.workspace.findFiles('**/' + endings, '').then((uris: Uri[]) => {
            Log.log("Starting to verify " + uris.length + " viper files.", LogLevel.Info);
            this.allFilesToAutoVerify = uris;
            this.nextFileToAutoVerify = 0;
            this.autoVerifyFile();
        });
    }

    private printAllVerificationResults() {
        Log.log("Verified " + this.autoVerificationResults.length + " files in " + Helper.formatSeconds((Date.now() - this.autoVerificationStartTime) / 1000), LogLevel.Info);
        this.autoVerificationResults.forEach(res => {
            Log.log("Verification Result: " + res, LogLevel.Info);
        })
    }

    private autoVerifyFile(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (this.nextFileToAutoVerify < this.allFilesToAutoVerify.length && this.verifyingAllFiles) {
                let currFile = this.allFilesToAutoVerify[this.nextFileToAutoVerify];
                Log.log("AutoVerify " + path.basename(currFile.toString()), LogLevel.Info);
                this.nextFileToAutoVerify++;
                vscode.workspace.openTextDocument(currFile).then((document) => {
                    vscode.window.showTextDocument(document).then(() => {
                        //verify(State.getFileState(currFile), false);
                        State.addToWorklist({ type: TaskType.Verify, uri: currFile, manuallyTriggered: false });
                        resolve(true);
                    })
                })
            } else {
                this.verifyingAllFiles = false;
                this.printAllVerificationResults();
                resolve(false);
            }
        });
    }
}