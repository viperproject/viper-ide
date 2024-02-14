/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2024 ETH Zurich.
  */

import { readdir } from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { URI } from 'vscode-uri';
import { Location } from 'vs-verification-toolbox';
import { AwaitTimer } from './AwaitTimer';
import { State } from './ExtensionState';
import { Common, VerifyParams, TimingInfo, VerificationState, Commands, StateChangeParams, LogLevel, Success, Backend, StopVerificationRequest } from './ViperProtocol';
import { Log } from './Log';
import { Helper } from './Helper';
import { ViperFileState } from './ViperFileState';
import { Color } from './StatusBar';
import { Settings } from './Settings';
import { updateViperTools } from './ViperTools';
import { restart } from './extension';
import { ProjectManager } from './ProjectManager';

export interface ITask {
    type: TaskType;
    uri?: vscode.Uri;
    backend?: Backend;
    manuallyTriggered?: boolean;
    success?: Success;
    timeout?: number;
    forceRestart?: boolean;
    resolve?: () => void;
    reject?: (err: Error) => void;
}

export class Task implements ITask {
    type: TaskType;
    uri?: vscode.Uri;
    backend?: Backend;
    manuallyTriggered?: boolean;
    success?: Success;
    timeout?: number;
    private startTime?: number = 0;
    forceRestart?: boolean;
    resolve: () => void;
    reject: (err: Error) => void;
    private hasBeenResolvedOrRejected: boolean = false;
    private failedToStop: number = 0;

    constructor(task: ITask) {
        this.type = task.type;
        this.uri = task.uri;
        this.backend = task.backend;
        this.manuallyTriggered = task.manuallyTriggered;
        this.success = task.success;
        this.timeout = task.timeout;
        this.forceRestart = task.forceRestart;

        this.resolve = () => {
            if (this.hasBeenResolvedOrRejected) {
                throw new Error(`Task has already been resolved or rejected`);
            }
            this.hasBeenResolvedOrRejected = true;
            if (task.resolve) {
                task.resolve();
            }
        }
        this.reject = (err: Error) => {
            if (this.hasBeenResolvedOrRejected) {
                throw new Error(`Task has already been resolved or rejected`);
            }
            this.hasBeenResolvedOrRejected = true;
            if (task.reject) {
                task.reject(err);
            }
        }
    }

    markStarted(type: TaskType, timeout?: number): void {
        this.type = type;
        this.startTime = Date.now();
        if (timeout) {
            this.timeout = timeout;
        }
    }

    hasTimedOut(): boolean {
        return this.startTime > 0 && this.timeout > 0 && (Date.now() - this.startTime) > this.timeout;
    }

    /** calls the corresponding callback informing clients that the task has been successfully processed */
    completeSuccessfully(): void {
        if (this.resolve) {
            this.resolve();
        }
    }

    /** calls the corresponding callback informing clients that processing the task has failed */
    completeFailed(err: Error): void {
        if (this.reject) {
            this.reject(err);
        }
    }

    /** trying to stop the task failed */
    stopFailed(): void {
        this.failedToStop = Date.now();
    }

    /** can only retry stopping on timeout the task 10s after previous failure */
    canTryStopOnTimeout(): boolean {
        return (Date.now() - this.failedToStop) > 10_000;
    }
}

export enum TaskType {
    NoOp = 0, Clear = 1,
    Save = 2, Verify = 3, StopVerification = 4, UpdateViperTools = 5, StartBackend = 6, FileClosed = 8,
    Verifying = 30,
    VerificationComplete = 300, VerificationFailed = 301,
    RestartExtension = 800,
}

export interface CheckResult {
    result: boolean,
    reason: string,
    removeRequest: boolean,
    error: string
}

export class VerificationController {

    private lastCanStartVerificationReason: string;
    private lastCanStartVerificationUri: vscode.Uri;

    private location: Location;
    private controller: AwaitTimer;
    private workList: Task[];

    //for timing:
    private verificationStartTime: number;
    private timings: number[];
    private oldTimings: TimingInfo;
    private progressUpdater;
    private lastProgress: number;
    private lastState: VerificationState = VerificationState.Stopped;

    //for autoverify all viper files in workspace
    private verifyingAllFiles = false;
    private allFilesToAutoVerify: URI[];
    private nextFileToAutoVerify: number;
    private autoVerificationResults: string[];
    private autoVerificationStartTime: number;

    public addToWorklist(task: Task): void {
        this.workList.push(task);
    }

    private isActive(type: TaskType): boolean {
        return type == TaskType.Verifying;
    }

    private isImportant(type: TaskType): boolean {
        return type == TaskType.StartBackend || type == TaskType.StopVerification;
    }

    constructor(location: Location) {
        this.location = location;
        this.workList = [];
        const verificationTimeout = 100; // ms
        this.controller = new AwaitTimer(async () => {
            try {
                //only keep most recent verify request
                let verifyFound = false;
                let stopFound = false;
                let isStopManuallyTriggered = false;
                /** tasks at entries strictly below `clear` get turned into NoOps, i.e. get cleared */
                let clear = -1;
                let verificationComplete = false;
                let verificationFailed = false;
                let completedOrFailedFileUri: vscode.Uri;
                let uriOfFoundVerfy: vscode.Uri;
                let startBackendFound = false;

                /** 
                 * list of calls that should be executed at the end of this timer's exeuction
                 * to complete certain tasks
                 */
                type TaskNotification = { task: Task, notify: () => void };
                const notifyTasks: TaskNotification[] = [];

                function addNotificationForTask(task: Task, notify: () => void): void {
                    if (hasNotificationForTask(task)) {
                        throw new Error(`'notifyTasks' already contains a notification for task ${JSON.stringify(task)}`);
                    }
                    notifyTasks.push({ task: task, notify: notify });
                }

                function hasNotificationForTask(task: Task): boolean {
                    return notifyTasks.some(notifyTask => task === notifyTask.task);
                }

                for (let i = this.workList.length - 1; i >= 0; i--) {
                    const task = this.workList[i];
                    switch (task.type) {
                        case TaskType.UpdateViperTools:
                            clear = i;
                            break;
                        case TaskType.RestartExtension:
                            clear = i;
                            break;
                        case TaskType.Verify:
                            if (!task.manuallyTriggered && !State.autoVerify) {
                                task.type = TaskType.NoOp;
                                addNotificationForTask(task, () => task.completeFailed(new Error(`verification is skipped because it got neither manually triggered nor is auto-verification enabled`)));
                            } else {
                                //remove all older verify tasks
                                if (verifyFound || stopFound) {
                                    task.type = TaskType.NoOp;
                                    addNotificationForTask(task, () => task.completeFailed(new Error(`verification is skipped because it is preceeded by another verify command`)));
                                } else if ((verificationComplete || verificationFailed) && Common.uriEquals(completedOrFailedFileUri, task.uri)) {
                                    //remove verification requests of just verified file
                                    task.type = TaskType.NoOp;
                                    addNotificationForTask(task, () => task.completeFailed(new Error(`verification has completed for this file`)));
                                } else {
                                    verifyFound = true;
                                    uriOfFoundVerfy = task.uri;
                                }
                            }
                            break;
                        case TaskType.StopVerification:
                            task.type = TaskType.NoOp;
                            // we mark the task as successfully processed. This does not reflect whether 
                            // stopping the verification was actually successful or not
                            addNotificationForTask(task, () => task.completeSuccessfully());
                            stopFound = true;
                            isStopManuallyTriggered = isStopManuallyTriggered || task.manuallyTriggered;
                            break;
                        case TaskType.FileClosed:
                            if (this.workList[0].type === TaskType.Verifying && this.workList[0].uri.toString() === task.uri.toString()) {
                                stopFound = true;
                            }
                            break;
                        case TaskType.Clear:
                            task.type = TaskType.NoOp;
                            addNotificationForTask(task, () => task.completeSuccessfully());
                            clear = i;
                            break;
                        case TaskType.VerificationComplete:
                            task.type = TaskType.NoOp;
                            addNotificationForTask(task, () => task.completeSuccessfully());
                            verificationComplete = true;
                            completedOrFailedFileUri = task.uri;
                            break;
                        case TaskType.VerificationFailed:
                            task.type = TaskType.NoOp;
                            addNotificationForTask(task, () => task.completeSuccessfully());
                            verificationFailed = true;
                            completedOrFailedFileUri = task.uri;
                            break;
                        case TaskType.StartBackend:
                            startBackendFound = true;
                            clear = i;
                            break;
                        case TaskType.Save:
                            if (this.workList[0].type === TaskType.Verifying) {
                                stopFound = true;
                            }
                            break;
                        default:
                            break;
                    }
                    if (i < clear && task.type !== TaskType.NoOp && !this.isActive(task.type) && !this.isImportant(task.type)) {
                        // clear the this.workList
                        task.type = TaskType.NoOp;
                        addNotificationForTask(task, () => task.completeFailed(new Error(`task has been cleared`)));
                    }
                }

                // remove NoOps:
                this.workList = this.workList.filter(task => {
                    const keep = task.type !== TaskType.NoOp;
                    if (!keep) {
                        // sanity check that all tasks are going to be either resolved or rejected
                        if (!hasNotificationForTask(task)) {
                            throw new Error(`There is no notification task for task ${JSON.stringify(task)}`);
                        }
                    }
                    return keep;
                });

                //Start processing the tasks
                let done = false;
                while (!done && this.workList.length > 0) {
                    const task = this.workList[0];

                    const fileState = State.getFileState(task.uri); //might be null
                    switch (task.type) {
                        case TaskType.Verify:
                            if (!State.autoVerify && !task.manuallyTriggered) {
                                task.type = TaskType.NoOp;
                                addNotificationForTask(task, () => task.completeFailed(new Error(`verification is skipped because it got neither manually triggered nor is auto-verification enabled`)));
                            } else {
                                const canVerify = this.canStartVerification(task);
                                if (canVerify.result) {
                                    Log.logWithOrigin("workList", "Verifying", LogLevel.LowLevelDebug);
                                    if (State.unitTest) State.unitTest.verificationStarted(State.activeBackend.name, path.basename(task.uri.toString()));
                                    task.markStarted(TaskType.Verifying);
                                    task.timeout = State.activeBackend.timeout;
                                    await this.verify(fileState, task.manuallyTriggered);
                                } else if (canVerify.reason && (canVerify.reason != this.lastCanStartVerificationReason || (task.uri && !Common.uriEquals(task.uri, this.lastCanStartVerificationUri)))) {
                                    Log.log(canVerify.reason, LogLevel.Info);
                                    this.lastCanStartVerificationReason = canVerify.reason;
                                    if (canVerify.removeRequest) {
                                        task.type = TaskType.NoOp;
                                        addNotificationForTask(task, () => task.completeFailed(new Error(`verification could not be started because of ${canVerify.reason}`)));
                                    }
                                }
                                this.lastCanStartVerificationUri = task.uri;
                            }
                            break;
                        case TaskType.Verifying:
                            if (!State.isVerifying) {
                                //verification done
                                task.type = TaskType.NoOp;
                                addNotificationForTask(task, () => task.completeSuccessfully());
                                State.hideProgress();
                            } else {
                                const timedOut = task.hasTimedOut();
                                const canStopOnTimeout = task.canTryStopOnTimeout();
                                //should the verification be aborted?
                                if ((verifyFound && !Common.uriEquals(uriOfFoundVerfy, task.uri))//if another verification is requested, the current one must be stopped
                                    || stopFound
                                    || startBackendFound
                                    || (timedOut && canStopOnTimeout)) {
                                    if (timedOut) {
                                        Log.hint("Verification of " + path.basename(task.uri.fsPath) + " timed out after " + task.timeout + "ms");
                                    }
                                    Log.log("Stop the running verification of " + path.basename(task.uri.fsPath) + ` we have ${verifyFound}, ${stopFound}, ${startBackendFound}, ${timedOut}`, LogLevel.Debug);
                                    const success = await this.stopVerification(task.uri.toString(), isStopManuallyTriggered);
                                    if (State.unitTest) State.unitTest.verificationStopped(success);
                                    if (success) {
                                        State.hideProgress();
                                    } else {
                                        task.stopFailed
                                    }
                                }
                                //block until verification is complete or failed
                                if (verificationComplete || verificationFailed) {
                                    if (!Common.uriEquals(completedOrFailedFileUri, task.uri)) {
                                        Log.error("WARNING: the " + (verificationComplete ? "completed" : "failed") + " verification uri does not correspond to the uri of the started verification.");
                                    }
                                    task.type = TaskType.NoOp;
                                    addNotificationForTask(task, () => task.completeSuccessfully());
                                    Log.logWithOrigin("workList", "VerificationFinished", LogLevel.LowLevelDebug);

                                    // TODO: Should we somehow notify something via the ViperApi here?
                                    State.hideProgress();
                                }
                            }
                            break;
                        case TaskType.FileClosed:
                            if (!fileState.open) {
                                //if the file has not been reopened in the meantime:
                                State.viperFiles.delete(task.uri.toString());
                            }
                            task.type = TaskType.NoOp;
                            addNotificationForTask(task, () => task.completeSuccessfully());
                            break;
                        case TaskType.UpdateViperTools:
                            Log.logWithOrigin("workList", "Updating Viper Tools now", LogLevel.LowLevelDebug);
                            // shutdown ViperServer before updating it to make sure that the JAR is not locked by the OS:
                            await State.dispose();
                            await updateViperTools(State.context);
                            if (State.unitTest) State.unitTest.viperUpdateComplete();
                            task.markStarted(TaskType.RestartExtension);
                            Log.logWithOrigin("workList", "RestartExtension", LogLevel.LowLevelDebug);
                            break;
                        case TaskType.RestartExtension:
                            // note that `restart` awaits the disposable of the timer
                            // this is problematic since the timer's disposable awaits
                            // the timer's function
                            // therefore, we stop the timer from firing again but do
                            // not await neither the Timer's `stop` nor the extension's
                            // `restart`:
                            this.controller.stop()
                                .then(() => Log.log(`timer got stopped`, LogLevel.Debug))
                                .then(restart)
                                .then(() => {
                                    Log.log(`extension got restarted`, LogLevel.Debug);
                                    if (State.unitTest) {
                                        State.unitTest.extensionRestarted();
                                        Log.log(`'extensionRestarted' notification sent`, LogLevel.LowLevelDebug);
                                    }
                                    task.completeSuccessfully();
                                }).catch(err => Log.error(`Error while restarting the extension: ${err}`));
                            break;
                        case TaskType.Save:
                            task.type = TaskType.NoOp;
                            addNotificationForTask(task, () => task.completeSuccessfully());
                            if (fileState) {
                                this.handleSaveTask(fileState);
                            }
                            break;
                        case TaskType.StartBackend:
                            if (!State.isBackendReady || State.activeBackend !== task.backend) {
                                // the backend has changed
                                State.activeBackend = task.backend;
                                // set all files to be not-verified:
                                State.viperFiles.forEach(file => file.verified = false);
                                // Get acronym with only characters, numbers or whitespace
                                const acronym = task.backend.name.split(" ").map(word => word.length > 0 ? word[0] : " ").filter(char => char.match(/[a-zA-Z0-9 ]/)).join("");
                                State.backendStatusBar.update(acronym, Color.READY);
                                // there is no remote task we need to execute on the server and can thus directly set the ready flag:
                                State.isBackendReady = true;
                                Log.log(`Backend ${task.backend.name} is now ready`, LogLevel.Debug);
                                if (State.unitTest) State.unitTest.backendStarted(task.backend.name);
                                // reverify the currently open file with the new backend:
                                const fileUri = Helper.getActiveVerificationUri();
                                if (fileUri) {
                                    State.addToWorklist(new Task({ type: TaskType.Verify, uri: fileUri, manuallyTriggered: false }));
                                }
                            } else {
                                Log.log(`Skipping 'StartBackend' because the same backend (${task.backend.name}) has been selected`, LogLevel.LowLevelDebug);
                            }
                            task.type = TaskType.NoOp;
                            addNotificationForTask(task, () => task.completeSuccessfully());
                            break;
                        case TaskType.NoOp:
                            addNotificationForTask(task, () => task.completeSuccessfully());
                            break;
                        default:
                            Log.error(`unhandled task type ${task.type}`);
                            task.type = TaskType.NoOp;
                            break;
                    }

                    //in case the leading element is now a NoOp, remove it, otherwise block.
                    if (task.type === TaskType.NoOp) {
                        const removedTask = this.workList.shift();
                        // sanity check that all tasks are eventually either resolved or rejected:
                        if (!hasNotificationForTask(removedTask)) {
                            throw new Error(`There is no notification task for task ${JSON.stringify(removedTask)}`);
                        }
                    } else {
                        // break out of while loop to wait for next triggering of timer
                        done = true;
                    }
                }
                notifyTasks.forEach(notifyTask => notifyTask.notify());
                if (State.unitTest && this.workList.length == 0) State.unitTest.ideIsIdle();
            } catch (e) {
                Log.error(`Error in verification controller (critical): ${e}`);
                this.workList.shift();
            }
        }, verificationTimeout);
        // the following statement ensures that the controller, i.e. `AwaitTimer`, is disposed
        // when shutting down the extension:
        State.context.subscriptions.push(this.controller);
    }

    private handleSaveTask(fileState: ViperFileState): void {
        fileState.changed = true;
        fileState.verified = false;
        const uri = ProjectManager.getProject(fileState.uri) ?? fileState.uri;
        const projectState = State.getFileState(uri);
        projectState.changed = true;
        projectState.verified = false;
        State.addToWorklist(new Task({ type: TaskType.Verify, uri: uri, manuallyTriggered: false }));
    }

    private canStartVerification(task: Task): CheckResult {
        try {
            let result = false;
            let reason: string;
            let removeRequest = true;
            if (!task.uri) {
                reason = "Cannot Verify, unknown file uri";
            } else {
                const dontVerify = `Don't verify ${path.basename(task.uri.toString())}: `;
                if (!State.isBackendReady) {
                    reason = "Backend is not ready, wait for backend to start.";
                    if (State.activeBackend) {
                        State.addToWorklist(new Task({
                            type: TaskType.StartBackend,
                            backend: State.activeBackend,
                            manuallyTriggered: false,
                        }));
                    }
                    removeRequest = false;
                } else {
                    const fileState = State.getFileState(task.uri);
                    if (!fileState) {
                        reason = "it's not a viper file";
                    } else {
                        const activeFile = Helper.getActiveVerificationUri();
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
            const error = "Error checking if verification can be started " + e;
            Log.error(error);
            return {
                result: false,
                reason: null,
                removeRequest: true,
                error: error
            };
        }
    }

    private async verify(fileState: ViperFileState, manuallyTriggered: boolean): Promise<void> {
        try {
            //reset timing;
            this.verificationStartTime = Date.now();
            this.timings = [];
            clearInterval(this.progressUpdater);
            this.lastProgress = 0;
            //load expected timing
            const expectedTimings: TimingInfo = fileState.timingInfo;
            if (expectedTimings && expectedTimings.total) {
                Log.log("Verification is expected to take " + Helper.formatSeconds(expectedTimings.total), LogLevel.Info);
                this.oldTimings = expectedTimings;
            }

            const uri = fileState.uri;
            if (Helper.isViperSourceFile(uri)) {
                if (!State.client) {
                    Log.hint("Extension not ready yet.");
                } else {
                    //change fileState
                    fileState.changed = false;
                    fileState.verified = false;
                    fileState.verifying = true;

                    //start progress updater
                    clearInterval(this.progressUpdater);
                    const progress_lambda: () => void = () => {
                        const progress = this.getProgress(this.lastProgress)
                        const totalProgress = this.getTotalProgress();
                        Log.progress({ domain: "Verification of " + fileState.name(), progress: progress, postfix: totalProgress }, LogLevel.Debug);
                    }
                    progress_lambda()
                    this.progressUpdater = setInterval(progress_lambda, 333);
                    State.statusBarProgress.updateProgressBar(0).show();
                    
                    Log.log("Request verification for " + path.basename(uri.toString()), LogLevel.Verbose);

                    const workspace = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : path.dirname(fileState.uri.fsPath);
                    const backend = State.activeBackend;
                    const customArgs = await Settings.getCustomArgsForBackend(this.location, backend, uri);
                    if (customArgs.isRight) {
                        const content = fileState.editor.document.getText()
                        const params: VerifyParams = { uri: uri.toString(), content, manuallyTriggered: manuallyTriggered, workspace: workspace, backend: backend.type, customArgs: customArgs.right };
                        //request verification from Server
                        State.isVerifying = true;
                        await State.client.sendNotification(Commands.Verify, params);
                    } else {
                        await Settings.handleSettingsCheckResult(customArgs);
                    }
                }
            }
        } catch (e) {
            if (!State.isVerifying) {
                //make sure the worklist is not blocked
                State.addToWorklist(new Task({ type: TaskType.VerificationFailed, uri: fileState.uri }));
            }
            Log.error(`Error requesting verification of ${fileState.name()}: ${e.toString()}`);
        }
    }

    /** the boolean success indicates whether stopping was successful */
    private async stopVerification(uriToStop: string, manuallyTriggered: boolean): Promise<boolean> {
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
                const params: StopVerificationRequest = { uri: uriToStop };
                const response = await State.client.sendRequest(Commands.StopVerification, params);
                return response.success;
            } else {
                const msg = "Cannot stop the verification, no verification is running.";
                if (manuallyTriggered) {
                    Log.hint(msg);
                } else {
                    Log.log(msg, LogLevel.Debug);
                }
                // we treat this case as succcess:
                return true;
            }
        } else {
            const msg = "Cannot stop the verification, the extension not ready yet.";
            if (manuallyTriggered) {
                Log.hint(msg);
            } else {
                Log.log(msg, LogLevel.Debug);
            }
            return false;
        }
    }

    private getTotalProgress(): string {
        return this.verifyingAllFiles ? ` (${this.nextFileToAutoVerify}/${this.allFilesToAutoVerify.length})` : "";
    }

    public addTiming(filename: string, paramProgress: number): void {
        this.timings.push(Date.now() - this.verificationStartTime);
        const progress = this.getProgress(paramProgress || 0);
        Log.progress({ domain: "Verification of " + filename, progress: progress, postfix: this.getTotalProgress() }, LogLevel.Debug);
    }

    private getProgress(progress: number): number {
        try {
            const timeSpentUntilLastStep = this.timings.length > 0 ? this.timings[this.timings.length - 1] : 0;
            const timeAlreadySpent = Date.now() - this.verificationStartTime;
            if (this.oldTimings && this.oldTimings.timings) {
                const old = this.oldTimings.timings;
                if (old.length >= this.timings.length) {
                    let timeSpentLastTime = this.timings.length > 0 ? old[this.timings.length - 1] : 0;
                    const oldTotal = old[old.length - 1];
                    let timeSpent = timeSpentUntilLastStep;
                    if (old.length > this.timings.length && (timeAlreadySpent - timeSpentUntilLastStep) > (old[this.timings.length] - old[this.timings.length - 1])) {
                        //if this time we should already have completed the step, factor that in
                        timeSpentLastTime = old[this.timings.length];
                        timeSpent = timeAlreadySpent;
                    }
                    const leftToCompute = oldTotal - timeSpentLastTime
                    const estimatedTotal = timeSpent + leftToCompute;
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

    public handleStateChange(params: StateChangeParams): void {
        Log.error("Received state change.")
        try {
            Log.error('Changed FROM ' + VerificationState[this.lastState] + " TO: " + VerificationState[params.newState]);
            this.lastState = params.newState;
            if (params.progress <= 0) {
                Log.error("The new state is: " + VerificationState[params.newState]);
            }
            switch (params.newState) {
                case VerificationState.Starting:
                    State.isBackendReady = false;
                    State.statusBarItem.update('starting', Color.ACTIVE);
                    break;
                case VerificationState.VerificationRunning:
                    State.abortButton.show();
                    State.statusBarProgress.show();
                    if (params.progress > 0) {
                        this.addTiming(params.filename, params.progress);
                    }
                    break;
                case VerificationState.PostProcessing:
                    this.addTiming(params.filename, params.progress);
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

                    Log.error(`LJDINFASKOLF ${params.verificationCompleted} / ${params.verificationNeeded}`);
                    params.verificationCompleted = 1;
                    if (params.verificationCompleted < 0 || params.verificationCompleted > 1) {
                        Log.log(`Unexpected value for field 'verificationCompleted' in state change 'ready' message. Expected 0 or 1 but got ${params.verificationCompleted}.`, LogLevel.Info);
                    } else if (params.verificationCompleted == 0) {
                        // the server indicates that there is a follow-up stage after verification
                        State.statusBarItem.update("ready", Color.READY);
                    } else {
                        const uri = vscode.Uri.parse(params.uri);

                        //since at most one file can be verified at a time, set all to non-verified before potentially setting one to verified 
                        State.viperFiles.forEach(file => file.verified = false);

                        const verifiedFile = State.getFileState(params.uri);
                        verifiedFile.success = params.success;
                        if (params.success != Success.Aborted && params.success != Success.Error) {
                            verifiedFile.verified = true;
                        }

                        //complete the timing measurement
                        this.addTiming(params.filename, 100);
                        if (Settings.showProgress()) {
                            verifiedFile.timingInfo = { total: params.time, timings: this.timings };
                        }

                        const allDiagnostics = vscode.languages.getDiagnostics().filter(diag => ProjectManager.inSameProject(uri, diag[0]));
                        const errorInOpenFile = allDiagnostics.some(
                            fileDiag => fileDiag[0].toString() == params.uri
                                && fileDiag[1].some(diag => diag.severity == vscode.DiagnosticSeverity.Error)
                        );
                        const postfix = errorInOpenFile ? "" : " due to imported files";
                        const diagnostics = allDiagnostics.flatMap(fileDiag => fileDiag[1]);
                        const nofErrors = diagnostics
                            .filter(diag => diag.severity == vscode.DiagnosticSeverity.Error)
                            .length;
                        const nofWarnings = diagnostics.length - nofErrors;

                        function errorsMsg(separator: string): string {
                            return `${separator} ${nofErrors} error${nofErrors == 1 ? "" : "s"}${postfix}`
                        }
                        function warningsMsg(separator: string): string {
                            switch (nofWarnings) {
                                case 0: return "";
                                case 1: return ` ${separator} 1 warning`;
                                default: return ` ${separator} ${nofWarnings} warnings`;
                            }
                        }
    
                        let msg = "";
                        switch (params.success) {
                            case Success.Success:
                                msg = `Verified ${params.filename} (${Helper.formatSeconds(params.time)})${warningsMsg("with")}`;
                                Log.log(msg, LogLevel.Default);
                                State.statusBarItem.update("$(check) " + msg, nofWarnings == 0 ? Color.SUCCESS : Color.WARNING);
                                if (params.manuallyTriggered > 0) {
                                    Log.hint(msg);
                                }
                                break;
                            case Success.ParsingFailed:
                                msg = `Parsing ${params.filename} failed (${Helper.formatSeconds(params.time)})${postfix}${warningsMsg("with")}`;
                                Log.log(msg, LogLevel.Default);
                                State.statusBarItem.update("$(x) " + msg, Color.ERROR);
                                break;
                            case Success.TypecheckingFailed:
                                msg = `Type checking ${params.filename} failed (${Helper.formatSeconds(params.time)}) ${errorsMsg("with")}${warningsMsg("and")}`;
                                Log.log(msg, LogLevel.Default);
                                State.statusBarItem.update("$(x) " + msg, nofErrors == 0 ? Color.WARNING : Color.ERROR);
                                break;
                            case Success.VerificationFailed:
                                msg = `Verifying ${params.filename} failed (${Helper.formatSeconds(params.time)}) ${errorsMsg("with")}${warningsMsg("and")}`;
                                Log.log(msg, LogLevel.Default);
                                State.statusBarItem.update("$(x) " + msg, nofErrors == 0 ? Color.WARNING : Color.ERROR);
                                break;
                            case Success.Aborted:
                                State.statusBarItem.update("Verification aborted", Color.WARNING);
                                Log.log(`Verifying ${params.filename} was aborted`, LogLevel.Info);
                                break;
                            case Success.Error:
                                State.statusBarItem.update(`$(x) Internal error - see View->Output->Viper for more info"`, Color.ERROR);
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

                        Log.error(`Verification Completed check (${params.success}): backend: ${State.activeBackend.name}, file: ${params.filename}`);
                        if (State.unitTest && this.verificationCompleted(params.success)) {
                            State.unitTest.verificationComplete(State.activeBackend.name, params.filename);
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
    private verificationCompleted(success: Success): boolean {
        return success === Success.Success
            || success === Success.ParsingFailed
            || success === Success.TypecheckingFailed
            || success === Success.VerificationFailed;
    }

    public async verifyAllFilesInWorkspace(folder: string | null): Promise<void> {
        this.autoVerificationStartTime = Date.now();
        this.verifyingAllFiles = true;
        this.autoVerificationResults = [];
        if (!State.isBackendReady) {
            Log.error("The backend must be running before verifying all files in the workspace")
            return;
        }
        const endings = "{" + Helper.viperFileEndings.join(",") + "}";

        let uris: vscode.Uri[];
        if (folder) {
            uris = await this.getAllViperFilesInDir(folder);
        } else {
            uris = await vscode.workspace.findFiles('**/' + endings, '');
        }

        if (!uris) {
            Log.error(`cannot start verifying all files in directory, uris is ${uris}`);
        } else {
            Log.log(`Starting to verify ${uris.length} viper files.`, LogLevel.Info);
            this.allFilesToAutoVerify = uris;
            this.nextFileToAutoVerify = 0;
            this.autoVerifyFile();
        }
    }

    //non recursive at the moment
    //TODO: implement recursively getting files
    private async getAllViperFilesInDir(folder: string): Promise<vscode.Uri[]> {
        const files = await readdir(folder);
        return files
            .map(file => path.join(folder, file))
            .filter(filePath => Helper.isViperSourceFile(filePath))
            .map(filePath => Common.uriToObject(Common.pathToUri(filePath)));
    }

    private printAllVerificationResults(): void {
        Log.log("Verified " + this.autoVerificationResults.length + " files (" + Helper.formatSeconds((Date.now() - this.autoVerificationStartTime) / 1000) + ")", LogLevel.Info);
        this.autoVerificationResults.forEach(res => {
            Log.log("Verification Result: " + res, LogLevel.Info);
        });
        if (State.unitTest) State.unitTest.allFilesVerified(this.autoVerificationResults.length, this.allFilesToAutoVerify.length);
    }

    private autoVerifyFile(): void {
        if (this.nextFileToAutoVerify < this.allFilesToAutoVerify.length && this.verifyingAllFiles) {
            const currFile = this.allFilesToAutoVerify[this.nextFileToAutoVerify];
            Log.log("AutoVerify " + path.basename(currFile.toString()), LogLevel.Info);
            this.nextFileToAutoVerify++;
            vscode.workspace.openTextDocument(currFile)
                .then(document => vscode.window.showTextDocument(document))
                .then(() => {
                    // set `manuallyTriggered` to true such that all files get reverified in case they have already
                    // been verified. This is sensible as this action is the immediate result of the user executing
                    // the verify all files in workspace command.
                    State.addToWorklist(new Task({ type: TaskType.Verify, uri: currFile, manuallyTriggered: true }));
                })
                .then(Helper.identity, err => Log.error(`Error while auto verifying files: ${err}`));
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
