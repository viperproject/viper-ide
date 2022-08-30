/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2020 ETH Zurich.
  */
 
'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { URI } from 'vscode-uri';
import { State } from './ExtensionState';
import { Common, VerifyParams, TimingInfo, BackendReadyParams, VerificationState, Commands, StateChangeParams, LogLevel, Success } from './ViperProtocol';
import { Log } from './Log';
import { StateVisualizer } from './StateVisualizer';
import { Helper } from './Helper';
import { ViperFileState } from './ViperFileState';
import { Color } from './StatusBar';
import { Settings } from './Settings';
import { Timer } from './Timer';
import { Location } from 'vs-verification-toolbox';
import { updateViperTools } from './ViperTools';
import { restart } from './extension';

export interface ITask {
    type: TaskType;
    uri?: vscode.Uri;
    backend?: string;
    manuallyTriggered?: boolean;
    success?: Success;
    isViperServerEngine?: boolean;
    timeout?: number;
    forceRestart?: boolean;
}

export class Task implements ITask {
    type: TaskType;
    uri?: vscode.Uri;
    backend?: string;
    manuallyTriggered?: boolean;
    success?: Success;
    isViperServerEngine?: boolean;
    timeout?: number;
    private startTime?: number = 0;
    forceRestart?: boolean;

    constructor(task: ITask) {
        this.type = task.type;
        this.uri = task.uri;
        this.backend = task.backend;
        this.manuallyTriggered = task.manuallyTriggered;
        this.success = task.success;
        // TODO Conceptually this parameter is no longer required, as the
        // extension should only work with ViperServer as engine.
        this.isViperServerEngine = true
        this.timeout = task.timeout;
        this.forceRestart = task.forceRestart;
    }

    markStarted(type: TaskType, timeout?: number) {
        this.type = type;
        this.startTime = Date.now();
        if (timeout) {
            this.timeout = timeout;
        }
    }

    hasTimedOut(): boolean {
        return this.startTime > 0 && this.timeout > 0 && (Date.now() - this.startTime) > this.timeout;
    }
}

export enum TaskType {
    NoOp = 0, Clear = 1,
    Save = 2, Verify = 3, StopVerification = 4, UpdateViperTools = 5, StartBackend = 6, StopBackend = 7, FileClosed = 8,
    Verifying = 30, StopVerifying = 40, StartingBackend = 50, StoppingBackend = 60,
    VerificationComplete = 300, VerificationFailed = 301, VerificationStopped = 400, BackendStarted = 600, BackendStopped = 700,
    RestartExtension = 800,
}

export interface CheckResult {
    result: boolean,
    reason: string,
    removeRequest: boolean,
    error: string
}

let NoOp: TaskType = TaskType.NoOp;

let STOPPING_TIMEOUT = 5000;

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
    private progressLabel = "";
    private lastProgress: number;
    private lastState: VerificationState = VerificationState.Stopped;

    //for autoverify all viper files in workspace
    private verifyingAllFiles = false;
    private allFilesToAutoVerify: URI[];
    private nextFileToAutoVerify: number;
    private autoVerificationResults: string[];
    private autoVerificationStartTime: number;

    public addToWorklist(task: Task) {
        this.workList.push(task);
    }

    private isActive(type: TaskType) {
        return type == TaskType.Verifying || type == TaskType.StopVerifying || type == TaskType.StartingBackend || type == TaskType.StoppingBackend;
    }

    private isImportant(type: TaskType) {
        return type == TaskType.StopBackend || type == TaskType.StartBackend || type == TaskType.StopVerification;
    }

    constructor(location: Location) {
        this.workList = [];
        let verificationTimeout = 100;//ms
        this.controller = new Timer(async () => {
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
                let backendStarted = false;
                let backendStopped = false;
                let stopBackendFound = false;
                let startBackendFound = false;

                for (let i = this.workList.length - 1; i >= 0; i--) {
                    let cur: TaskType = this.workList[i].type;
                    if (clear && !this.isActive(cur) && !this.isImportant(cur)) {
                        //clear the this.workList
                        this.workList[i].type = NoOp;
                    }
                    switch (cur) {
                        case TaskType.UpdateViperTools:
                            clear = true;
                            break;
                        case TaskType.RestartExtension:
                            clear = true;
                            break;
                        case TaskType.Verify:
                            if (!this.workList[i].manuallyTriggered && !State.autoVerify) {
                                this.workList[i].type = NoOp;
                            } else {
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
                            }
                            break;
                        case TaskType.StopVerification:
                            this.workList[i].type = NoOp;
                            stopFound = true;
                            isStopManuallyTriggered = isStopManuallyTriggered || this.workList[i].manuallyTriggered;
                            break;
                        case TaskType.FileClosed:
                            if (this.workList[0].type == TaskType.Verifying && this.workList[0].uri.toString() == this.workList[i].uri.toString()) {
                                stopFound = true;
                            }
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
                        case TaskType.StartBackend:
                            //remove duplicated start backend commands
                            if (startBackendFound) {
                                this.workList[i].type = NoOp;
                            }
                            startBackendFound = true;
                            clear = true;
                            break;
                        case TaskType.StopBackend:
                            //remove duplicated stop backend commands
                            if (stopBackendFound) {
                                this.workList[i].type = NoOp;
                            }
                            stopBackendFound = true;
                            clear = true;
                            break;
                        case TaskType.BackendStarted:
                            this.workList[i].type = NoOp;
                            backendStarted = true;
                            break;
                        case TaskType.BackendStopped:
                            this.workList[i].type = NoOp;
                            backendStopped = true;
                            break;
                        case TaskType.Save:
                            if (this.workList[0].type == TaskType.Verifying) {
                                stopFound = true;
                            }
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
                            if (!State.autoVerify && !task.manuallyTriggered) {
                                task.type = TaskType.NoOp;
                            } else {
                                let canVerify = this.canStartVerification(task);
                                if (canVerify.result) {
                                    Log.logWithOrigin("workList", "Verifying", LogLevel.LowLevelDebug);
                                    if (State.unitTest) State.unitTest.verificationStarted(State.activeBackend, path.basename(task.uri.toString()));
                                    task.markStarted(TaskType.Verifying);
                                    task.timeout = await Settings.getTimeoutOfActiveBackend(location, State.activeBackend);
                                    this.verify(fileState, task.manuallyTriggered);
                                } else if (canVerify.reason && (canVerify.reason != this.lastCanStartVerificationReason || (task.uri && !Helper.uriEquals(task.uri, this.lastCanStartVerificationUri)))) {
                                    Log.log(canVerify.reason, LogLevel.Info);
                                    this.lastCanStartVerificationReason = canVerify.reason;
                                    if (canVerify.removeRequest) {
                                        task.type = NoOp;
                                    }
                                }
                                this.lastCanStartVerificationUri = task.uri;
                            }
                            break;
                        case TaskType.Verifying:
                            if (!State.isVerifying) {
                                //verification done
                                task.type = NoOp;
                                State.hideProgress();
                            } else {
                                let timedOut = task.hasTimedOut();
                                //should the verification be aborted?
                                if ((verifyFound && !Helper.uriEquals(uriOfFoundVerfy, task.uri))//if another verification is requested, the current one must be stopped
                                    || stopFound
                                    || startBackendFound
                                    || stopBackendFound
                                    || timedOut) {
                                    if (timedOut) {
                                        Log.hint("Verification of " + path.basename(task.uri.fsPath) + " timed out after " + task.timeout + "ms");
                                    }
                                    Log.logWithOrigin("workList", "StopVerifying", LogLevel.LowLevelDebug);
                                    task.markStarted(TaskType.StopVerifying, this.getStoppingTimeout());
                                    Log.log("Stop the running verification of " + path.basename(task.uri.fsPath), LogLevel.Debug);
                                    this.stopVerification(task.uri.toString(), isStopManuallyTriggered);
                                    State.hideProgress();
                                }
                                //block until verification is complete or failed
                                if (verificationComplete || verificationFailed) {
                                    if (!Helper.uriEquals(completedOrFailedFileUri, task.uri)) {
                                        Log.error("WARNING: the " + (verificationComplete ? "completed" : "failed") + " verification uri does not correspond to the uri of the started verification.");
                                    }
                                    task.type = NoOp;
                                    Log.logWithOrigin("workList", "VerificationFinished", LogLevel.LowLevelDebug);

                                    let succ = verificationComplete && !verificationFailed ? "succeded" : "failed"
                                    // TODO: Should we somehow notify something via the ViperApi here?
                                    State.hideProgress();
                                }
                            }
                            break;
                        case TaskType.StopVerifying:
                            let timedOut = task.hasTimedOut();
                            if (timedOut) {
                                Log.error("stopping timed out");
                                task.type = NoOp;
                                this.addToWorklist(new Task({
                                    type: TaskType.StartBackend,
                                    backend: State.activeBackend,
                                    manuallyTriggered: false,
                                    isViperServerEngine: State.isActiveViperEngine,
                                    forceRestart: true
                                }));
                            } else {
                                //block until verification is stoped;
                                if (verificationStopped) {
                                    Log.logWithOrigin("workList", "VerificationStopped", LogLevel.LowLevelDebug);
                                    task.type = NoOp;
                                    if (State.unitTest) State.unitTest.verificationStopped();
                                }
                            }
                            break;
                        case TaskType.FileClosed:
                            let uri = task.uri.toString();
                            if (!fileState.open) {
                                //if the file has not been reopened in the meantime:
                                //let server and client forget about the file
                                State.client.sendNotification(Commands.FileClosed, uri);
                                State.viperFiles.delete(uri);
                            }
                            task.type = NoOp;
                            break;
                        case TaskType.UpdateViperTools:
                            if (State.isBackendReady) {
                                this.workList.unshift(new Task({ type: TaskType.StopBackend, manuallyTriggered: task.manuallyTriggered }))
                            } else {
                                Log.logWithOrigin("workList", "Updating Viper Tools now", LogLevel.LowLevelDebug);
                                await updateViperTools(State.context);
                                task.markStarted(TaskType.RestartExtension);
                                Log.logWithOrigin("workList", "RestartExtension", LogLevel.LowLevelDebug);
                            }
                            break;
                        case TaskType.RestartExtension:
                            // note that restarting the extension will kill the timer
                            // that schedules the tasks.
                            await restart();
                            break;
                        case TaskType.Save:
                            task.type = NoOp;
                            if (fileState) {
                                this.handleSaveTask(fileState);
                            }
                            break;
                        case TaskType.StartBackend:
                            let stoppingNeeded = State.isBackendReady && task.forceRestart;
                            let startingNeeded = !State.isBackendReady || stoppingNeeded;

                            //no need to restart when switching between backends
                            if (stoppingNeeded) {
                                this.workList.unshift(new Task({ type: TaskType.StopBackend, manuallyTriggered: task.manuallyTriggered }))
                            }
                            else if (startingNeeded) {
                                Log.logWithOrigin("workList", "Start Backend", LogLevel.LowLevelDebug);
                                task.markStarted(TaskType.StartingBackend);
                                State.client.sendNotification(Commands.StartBackend, task.backend);
                            } else {
                                //swap backend without restarting it
                                State.client.sendNotification(Commands.SwapBackend, task.backend);
                                task.markStarted(TaskType.StartingBackend);
                            }
                            break;
                        case TaskType.StartingBackend:
                            //block until backend change complete;
                            if (backendStarted) {
                                task.type = NoOp;
                                Log.logWithOrigin("workList", "Backend started", LogLevel.LowLevelDebug);
                                State.backendStatusBar.update(task.backend, Color.READY);
                                State.activeBackend = task.backend;
                            }
                            if (backendStopped) {
                                task.type = NoOp;
                                Log.logWithOrigin("workList", "BackendStartFailed BackendStopped", LogLevel.LowLevelDebug);
                                State.statusBarItem.update("Backend start failed", Color.ERROR);
                            }
                            break;
                        case TaskType.StopBackend:
                            task.markStarted(TaskType.StoppingBackend);
                            Log.logWithOrigin("workList", "Stop Backend", LogLevel.LowLevelDebug);
                            State.reset()
                            State.client.sendNotification(Commands.StopBackend);
                            break;
                        case TaskType.StoppingBackend:
                            //block until backend change complete;
                            if (backendStopped) {
                                Log.logWithOrigin("workList", "Backend stopped", LogLevel.LowLevelDebug);
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
                if (State.unitTest && this.workList.length == 0) State.unitTest.ideIsIdle();
            } catch (e) {
                Log.error(`Error in verification controller (critical): ${e}`);
                this.workList.shift();
            }
        }, verificationTimeout);
        State.context.subscriptions.push(this.controller);
    }

    private getStoppingTimeout(): number{
        //TODO Make this a settable parameter.
        return 10000;
    }

    private handleSaveTask(fileState: ViperFileState) {
        if (fileState.onlySpecialCharsChanged) {
            fileState.onlySpecialCharsChanged = false;
        } else {
            //Log.log("Save " + path.basename(task.uri.toString()) + " is handled", LogLevel.Info);
            fileState.changed = true;
            fileState.verified = false;
            this.stopDebuggingOnServer();
            this.stopDebuggingLocally();
            this.addToWorklist(new Task({ type: TaskType.Verify, uri: fileState.uri, manuallyTriggered: false }));
        }
    }

    private canStartVerification(task: Task): CheckResult {
        try {
            let result = false;
            let reason: string;
            let removeRequest = true;
            if (!task.uri) {
                reason = "Cannot Verify, unknown file uri";
            } else {
                let dontVerify = `Don't verify ${path.basename(task.uri.toString())}: `;
                if (!State.isBackendReady) {
                    reason = "Backend is not ready, wait for backend to start.";
                    if (State.activeBackend) {
                        this.addToWorklist(new Task({
                            type: TaskType.StartBackend,
                            backend: State.activeBackend,
                            manuallyTriggered: false,
                            isViperServerEngine: State.isActiveViperEngine
                        }));
                    }
                    removeRequest = false;
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
                            removeRequest = false;
                        }
                    }
                }
            }
            return {
                result: result,
                reason: reason,
                removeRequest: removeRequest,
                error: null
            };
        } catch (e) {
            let error = "Error checking if verification can be started " + e;
            Log.error(error);
            return {
                result: false,
                reason: null,
                removeRequest: true,
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

            let uri = fileState.uri.toString();  // toString keeps the file scheme
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

                        //clear all diagnostics
                        State.diagnosticCollection.clear();

                        //start progress updater
                        clearInterval(this.progressUpdater);
                        let progress_lambda = () => {
                            let progress = this.getProgress(this.lastProgress)
                            let totalProgress = this.getTotalProgress();
                            Log.progress({ domain: "Verification of " + fileState.name(), progress: progress, postfix: totalProgress }, LogLevel.Debug);
                        }
                        progress_lambda()
                        this.progressUpdater = setInterval(progress_lambda, 333);
                        State.statusBarProgress.updateProgressBar(0).show();
                        
                        Log.log("Request verification for " + path.basename(uri), LogLevel.Verbose);

                        let workspace = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : path.dirname(fileState.uri.fsPath);
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
                State.addToWorklist(new Task({ type: TaskType.VerificationFailed, uri: fileState.uri }));
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
                State.hideProgress();
                State.statusBarItem.update("aborting", Color.WARNING);
                State.client.sendRequest(Commands.StopVerification, uriToStop).then((success) => {
                    State.addToWorklist(new Task({ type: TaskType.VerificationStopped, uri: null, manuallyTriggered: false }));
                });
            } else {
                let msg = "Cannot stop the verification, no verification is running.";
                if (manuallyTriggered) {
                    Log.hint(msg);
                } else {
                    Log.log(msg, LogLevel.Debug);
                }
                State.addToWorklist(new Task({ type: TaskType.VerificationStopped, uri: null, manuallyTriggered: false }));
            }
        } else {
            let msg = "Cannot stop the verification, the extension not ready yet.";
            if (manuallyTriggered) {
                Log.hint(msg);
            } else {
                Log.log(msg, LogLevel.Debug);
            }
            State.addToWorklist(new Task({ type: TaskType.VerificationStopped, uri: null, manuallyTriggered: false }));
        }
    }

    public stopDebuggingOnServer() {
        if (State.isDebugging) {
            Log.log("Tell language server to stop debugging", LogLevel.Debug);
            State.client.sendNotification(Commands.StopDebugging);
        }
    }

    public stopDebuggingLocally() {
        if (State.isDebugging) {
            try {
                Log.log("Stop Debugging", LogLevel.Info);
                let visualizer = State.getLastActiveFile().stateVisualizer;
                this.hideStates(() => { }, visualizer);
            } catch (e) {
                Log.error("Error handling stop debugging request: " + e);
            }
        }
    }

    private hideStates(callback, visualizer: StateVisualizer) {
        try {
            if (Settings.areAdvancedFeaturesEnabled()) {
                let editor = visualizer.viperFile.editor;
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
        } catch (e) {
            Log.error("Error hiding States: " + e);
        }
    }

    private getTotalProgress(): string {
        return this.verifyingAllFiles ? ` (${this.nextFileToAutoVerify}/${this.allFilesToAutoVerify.length})` : "";
    }

    public addTiming(filename: string, paramProgress: number, color: string) {
        this.timings.push(Date.now() - this.verificationStartTime);
        let progress = this.getProgress(paramProgress || 0);
        Log.progress({ domain: "Verification of " + filename, progress: progress, postfix: this.getTotalProgress() }, LogLevel.Debug);
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
            this.lastProgress = progress;
            return progress;
        } catch (e) {
            Log.error("Error computing progress: " + e);
        }
    }

    public handleBackendReadyNotification(params: BackendReadyParams) {
        try {
            if (!State.isVerifying) {
                State.statusBarItem.update("ready", Color.READY);
            }
            if (params.restarted) {
                //no file is verifying
                State.resetViperFiles()
                State.addToWorklist(new Task({ type: TaskType.Clear, uri: Helper.getActiveFileUri(), manuallyTriggered: false }));
                if (Settings.isAutoVerifyAfterBackendChangeEnabled()) {
                    Log.log("AutoVerify after backend change", LogLevel.Info);
                    State.addToWorklist(new Task({ type: TaskType.Verify, uri: Helper.getActiveFileUri(), manuallyTriggered: false }));
                }
            }
            Log.log("Backend ready: " + params.name, LogLevel.Info);
            State.addToWorklist(new Task({ type: TaskType.BackendStarted, backend: params.name, manuallyTriggered: true }));
            State.isBackendReady = true;
            State.isActiveViperEngine = params.isViperServer;
            if (State.unitTest) {
                State.unitTest.backendStarted(params.name);
            }
        } catch (e) {
            Log.error("Error handling backend started notification: " + e);
        }
    }

    public handleStateChange(params: StateChangeParams) {
        Log.log("Received state change.", LogLevel.Info)
        try {
            Log.log('Changed FROM ' + VerificationState[this.lastState] + " TO: " + VerificationState[params.newState], LogLevel.Info);
            this.lastState = params.newState;
            if (params.progress <= 0)
                Log.log("The new state is: " + VerificationState[params.newState], LogLevel.Debug);
            let window = vscode.window;
            switch (params.newState) {
                case VerificationState.Starting:
                    State.isBackendReady = false;
                    State.statusBarItem.update('starting', Color.ACTIVE);
                    break;
                case VerificationState.VerificationRunning:
                    State.abortButton.show();
                    State.statusBarProgress.show();
                    if (params.progress > 0) {
                        this.progressLabel = `Verification of ${params.filename}:`;
                        this.addTiming(params.filename, params.progress, Color.ACTIVE);
                    }
                    if (params.diagnostics) {
                        const diagnostics: vscode.Diagnostic[] = params.diagnostics
                            // for mysterious reasons, LSP defines DiagnosticSeverity levels 1 - 4 while
                            // vscode uses 0 - 3. Thus convert them:
                            .map(this.translateLsp2VsCodeDiagnosticSeverity);
                        State.diagnosticCollection.set(vscode.Uri.parse(params.uri, false), diagnostics);
                    }
                    break;
                case VerificationState.PostProcessing:
                    this.progressLabel = `postprocessing ${params.filename}:`;
                    this.addTiming(params.filename, params.progress, Color.ACTIVE);
                    break;
                case VerificationState.Stage:
                    Log.log("Run " + params.stage + " for " + params.filename, LogLevel.Info);
                    State.statusBarItem.update(`File ${params.filename}: Stage ${params.stage}`, Color.ACTIVE);
                    break;
                case VerificationState.Ready:
                    clearInterval(this.progressUpdater);
                    State.hideProgress();

                    State.viperFiles.forEach(file => {
                        file.verifying = false;
                    });
                    State.isVerifying = false;

                    if (params.verificationCompleted < 0 || params.verificationCompleted > 1) {
                        Log.log(`Unexpected value for field 'verificationCompleted' in state change 'ready' message. Expected 0 or 1 but got ${params.verificationCompleted}.`, LogLevel.Info);
                    } else if (params.verificationCompleted == 0) {
                        // the server indicates that there is a follow-up stage after verification
                        State.statusBarItem.update("ready", Color.READY);
                    } else {
                        let uri = vscode.Uri.parse(params.uri);

                        //since at most one file can be verified at a time, set all to non-verified before potentially setting one to verified 
                        State.viperFiles.forEach(file => file.verified = false);

                        let verifiedFile = State.getFileState(params.uri);
                        verifiedFile.success = params.success;
                        if (params.success != Success.Aborted && params.success != Success.Error) {
                            verifiedFile.verified = true;
                        }

                        //complete the timing measurement
                        this.addTiming(params.filename, 100, Color.ACTIVE);
                        if (Settings.showProgress()) {
                            verifiedFile.stateVisualizer.addTimingInformationToFileState({ total: params.time, timings: this.timings });
                        }

                        const diagnostics = params.diagnostics
                            .map(this.translateLsp2VsCodeDiagnosticSeverity);
                        const nofErrors = diagnostics
                            .filter(diag => diag.severity == vscode.DiagnosticSeverity.Error)
                            .length;
                        const nofWarnings = diagnostics.length - nofErrors;

                        function warningsMsg(separator: string): string {
                            if (nofWarnings == 0) {
                                return ``;
                            } else {
                                return`${separator} ${nofWarnings} warning${nofWarnings == 1 ? "" : "s"}`;
                            }
                        }
    
                        let msg: string = "";
                        switch (params.success) {
                            case Success.Success:
                                msg = `Successfully verified ${params.filename} in ${Helper.formatSeconds(params.time)} ${warningsMsg("with")}`;
                                Log.log(msg, LogLevel.Default);
                                State.statusBarItem.update("$(check) " + msg, nofWarnings == 0 ? Color.SUCCESS : Color.WARNING);
                                if (params.manuallyTriggered > 0) Log.hint(msg);
                                break;
                            case Success.ParsingFailed:
                                msg = `Parsing ${params.filename} failed after ${Helper.formatSeconds(params.time)} ${warningsMsg("with")}`;
                                Log.log(msg, LogLevel.Default);
                                State.statusBarItem.update("$(x) " + msg, Color.ERROR);
                                break;
                            case Success.TypecheckingFailed:
                                msg = `Type checking ${params.filename} failed after ${Helper.formatSeconds(params.time)} with ${nofErrors} error${nofErrors == 1 ? "" : "s"} ${warningsMsg("and")}`;
                                Log.log(msg, LogLevel.Default);
                                State.statusBarItem.update("$(x) " + msg, nofErrors == 0 ? Color.WARNING : Color.ERROR);
                                break;
                            case Success.VerificationFailed:
                                msg = `Verifying ${params.filename} failed after ${Helper.formatSeconds(params.time)} with ${nofErrors} error${nofErrors == 1 ? "" : "s"} ${warningsMsg("and")}`;
                                Log.log(msg, LogLevel.Default);
                                State.statusBarItem.update("$(x) " + msg, nofErrors == 0 ? Color.WARNING : Color.ERROR);
                                break;
                            case Success.Aborted:
                                State.statusBarItem.update("Verification aborted", Color.WARNING);
                                Log.log(`Verifying ${params.filename} was aborted`, LogLevel.Info);
                                break;
                            case Success.Error:
                                let moreInfo = " - see View->Output->Viper for more info"
                                State.statusBarItem.update(`$(x) Internal error` + moreInfo, Color.ERROR);
                                //msg = `Verifying ${params.filename} failed due to an internal error`;
                                Log.error(`Internal Error: failed to verify ${params.filename}: Reason: ` + (params.error && params.error.length > 0 ? params.error : "Unknown Reason: Set loglevel to 5 and see the viper.log file for more details"));
                                //Log.hint(msg + moreInfo);

                                if (State.unitTest) State.unitTest.internalErrorDetected();
                                break;
                            case Success.Timeout:
                                State.statusBarItem.update("Verification timed out", Color.WARNING);
                                Log.log(`Verifying ${params.filename} timed out`, LogLevel.Info);
                                break;
                        }

                        // Notify whoever might be listening
                        State.viperApi.notifyVerificationTerminated({
                            status: params.success,
                            filename: uri,
                            message: msg
                        });

                        if (State.unitTest && this.verificationCompleted(params.success)) {
                            State.unitTest.verificationComplete(State.activeBackend, params.filename);
                        }
                        State.addToWorklist(new Task({ type: TaskType.VerificationComplete, uri: uri, manuallyTriggered: false }));
                    }
                    if (this.verifyingAllFiles) {
                        this.autoVerificationResults.push(`${Success[params.success]}: ${URI.parse(params.uri).fsPath}`);
                        this.autoVerifyFile();
                    }
                    break;
                case VerificationState.Stopping:
                    State.statusBarItem.update('preparing', Color.ACTIVE);
                    break;
                case VerificationState.Stopped:
                    clearInterval(this.progressUpdater);
                    State.hideProgress();
                    State.statusBarItem.update('stopped', Color.READY);
                    State.addToWorklist(new Task({ type: TaskType.BackendStopped, manuallyTriggered: false }));
                    break;
                default:
                    break;
            }
        } catch (e) {
            Log.error("Error handling state change (critical): " + e);
        }
    }

    private translateLsp2VsCodeDiagnosticSeverity(diagnostic: vscode.Diagnostic): vscode.Diagnostic {
        switch (diagnostic.severity.valueOf()) {
            case LspDiagnosticSeverity.Error.valueOf():
                diagnostic.severity = vscode.DiagnosticSeverity.Error;
                break;
            case LspDiagnosticSeverity.Warning.valueOf():
                diagnostic.severity = vscode.DiagnosticSeverity.Warning;
                break;
            case LspDiagnosticSeverity.Information.valueOf():
                diagnostic.severity = vscode.DiagnosticSeverity.Information;
                break;
            case LspDiagnosticSeverity.Hint.valueOf():
                diagnostic.severity = vscode.DiagnosticSeverity.Hint;
                break;
        }
        return diagnostic;
    }

    //for unittest
    private verificationCompleted(success: Success) {
        return success === Success.Success
            || success === Success.ParsingFailed
            || success === Success.TypecheckingFailed
            || success === Success.VerificationFailed;
    }

    public verifyAllFilesInWorkspace(folder: string) {
        this.autoVerificationStartTime = Date.now();
        this.verifyingAllFiles = true;
        this.autoVerificationResults = [];
        if (!State.isBackendReady) {
            Log.error("The backend must be running before verifying all files in the workspace")
            return;
        }
        let endings = "{" + Helper.viperFileEndings.join(",") + "}";

        let fileListReader;
        if (folder) {
            fileListReader = this.getAllViperFilesInDir(folder);
        } else {
            fileListReader = vscode.workspace.findFiles('**/' + endings, '');
        }

        fileListReader.then((uris: URI[]) => {
            if (!uris) {
                Log.error('cannot start verifying all files in directory, uris is ' + uris);
            } else {
                Log.log("Starting to verify " + uris.length + " viper files.", LogLevel.Info);
                this.allFilesToAutoVerify = uris;
                this.nextFileToAutoVerify = 0;
                this.autoVerifyFile();
            }
        }).catch(err => {
            Log.error("error reading files list " + err);
        });
    }

    //non recursive at the moment
    //TODO: implement recursively getting files
    private getAllViperFilesInDir(folder) {
        return new Promise((resolve, reject) => {
            let result: vscode.Uri[] = [];
            fs.readdir(folder, (err, files) => {
                files.forEach(file => {
                    let filePath = path.join(folder, file);
                    if (Helper.isViperSourceFile(filePath)) {
                        result.push(Helper.uriToObject(Common.pathToUri(filePath)));
                    }
                });
                resolve(result);
            })
        });
    }

    private printAllVerificationResults() {
        Log.log("Verified " + this.autoVerificationResults.length + " files in " + Helper.formatSeconds((Date.now() - this.autoVerificationStartTime) / 1000), LogLevel.Info);
        this.autoVerificationResults.forEach(res => {
            Log.log("Verification Result: " + res, LogLevel.Info);
        });
        if (State.unitTest) State.unitTest.allFilesVerified(this.autoVerificationResults.length, this.allFilesToAutoVerify.length);
    }

    private autoVerifyFile() {
        if (this.nextFileToAutoVerify < this.allFilesToAutoVerify.length && this.verifyingAllFiles) {
            let currFile = this.allFilesToAutoVerify[this.nextFileToAutoVerify];
            Log.log("AutoVerify " + path.basename(currFile.toString()), LogLevel.Info);
            this.nextFileToAutoVerify++;
            vscode.workspace.openTextDocument(currFile).then((document) => {
                vscode.window.showTextDocument(document).then(() => {
                    // set `manuallyTriggered` to true such that all files get reverified in case they have already
                    // been verified. This is sensible as this action is the immediate result of the user executing
                    // the verify all files in workspace command.
                    State.addToWorklist(new Task({ type: TaskType.Verify, uri: currFile, manuallyTriggered: true }));
                })
            })
        } else {
            this.verifyingAllFiles = false;
            this.printAllVerificationResults();
        }
    }
}

enum LspDiagnosticSeverity {
    Error = 1,
    Warning = 2,
    Information = 3,
    Hint = 4
}
