/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_languageserver_1 = require("vscode-languageserver");
const language_server = require("vscode-languageserver");
const Settings_1 = require("./Settings");
const ViperProtocol_1 = require("./ViperProtocol");
const Log_1 = require("./Log");
const Model_1 = require("./Model");
const pathHelper = require("path");
const HeapVisualizer_1 = require("./HeapVisualizer");
const TotalProgress_1 = require("./TotalProgress");
const ServerClass_1 = require("./ServerClass");
const DebugServer_1 = require("./DebugServer");
const fs = require("fs");
const Verifiable_1 = require("./Verifiable");
class VerificationTask {
    constructor(fileUri) {
        //state that is valid across verifications
        this.verificationCount = 0;
        this.lastSuccess = ViperProtocol_1.Success.None;
        this.internalErrorMessage = "";
        //state specific to one verification
        this.running = false;
        this.global_faliure = false;
        this.aborting = false;
        this.state = ViperProtocol_1.VerificationState.Stopped;
        //working variables
        this.lines = [];
        this.wrongFormat = false;
        this.partialData = "";
        //verification results
        this.time = 0;
        this.model = new Model_1.Model();
        this.parsingCompleted = false;
        this.typeCheckingCompleted = false;
        this.symbExLog = [];
        this.fileUri = fileUri;
    }
    getHeapGraphDescription(clientIndex, isHeapNeeded) {
        //convert client index to server index
        let serverIndex = this.clientStepIndexToServerStep[clientIndex].index;
        if (!this.steps) {
            Log_1.Log.error("Cannot show heap: no steps avaliable, a reverification is needed.");
        }
        if (serverIndex < 0 || serverIndex >= this.steps.length) {
            Log_1.Log.error("Cannot show heap at step " + clientIndex + " only states 0 - " + (this.clientStepIndexToServerStep.length - 1) + " are valid");
            return;
        }
        let step = this.steps[serverIndex];
        if (!step) {
            Log_1.Log.error("Cannot show heap at step " + clientIndex + " step is null");
            return;
        }
        //inform debug server about selected State
        DebugServer_1.DebugServer.moveDebuggerToPos(step.position, clientIndex);
        return isHeapNeeded ? {
            heap: HeapVisualizer_1.HeapVisualizer.heapToDotUsingOwnDotGraph(step, false, Settings_1.Settings.settings.advancedFeatures.showSymbolicState, step.isErrorState, this.model),
            oldHeap: HeapVisualizer_1.HeapVisualizer.heapToDotUsingOwnDotGraph(step, true, Settings_1.Settings.settings.advancedFeatures.showSymbolicState, step.isErrorState, this.model),
            partialExecutionTree: HeapVisualizer_1.HeapVisualizer.executionTreeAroundStateToDot(step),
            state: step.decorationOptions.index,
            fileName: this.filename,
            fileUri: this.fileUri,
            position: step.position,
            stateInfos: (this.steps[serverIndex].isErrorState ? "Error State -> use the Counter Example\n" : "") + step.pretty(),
            methodName: step.verifiable.name,
            methodType: step.verifiable.typeString(),
            methodOffset: step.verifiable.startIndex - 1,
            conditions: step.prettyConditions()
        } : null;
    }
    prettySteps() {
        try {
            let res = "";
            let methodIndex = -1;
            let currentMethodOffset = -1;
            let maxLine = 0;
            let indent = "";
            let allBordersPrinted = false;
            let currentMethod;
            let numberOfClientSteps = 0;
            this.steps.forEach((element, i) => {
                let clientNumber = element.decorationOptions ? "" + element.decorationOptions.numberToDisplay : "";
                if (element.canBeShownAsDecoration) {
                    numberOfClientSteps++;
                }
                let parent = element.getClientParent();
                if (parent && element.decorationOptions) {
                    clientNumber += " " + parent.decorationOptions.numberToDisplay;
                }
                let serverNumber = "" + i;
                let spacesToPut = 8 - clientNumber.length - serverNumber.length;
                spacesToPut = spacesToPut < 0 ? 0 : spacesToPut;
                res += `\n\t${clientNumber} ${"\t".repeat(spacesToPut)}(${serverNumber})|${"\t".repeat(element.depthLevel())} ${element.firstLine()}`;
            });
            res += '\nNumberOfClientSteps: ' + numberOfClientSteps;
            //Log.log("Steps:\n" + res, LogLevel.LowLevelDebug);
            return res;
        }
        catch (e) {
            Log_1.Log.error("Runtime Error in Pretty Steps: " + e);
        }
    }
    comparePositionAndIndex(a, b) {
        if (!a && !b)
            return 0;
        if (!a)
            return -1;
        if (!b)
            return 1;
        if (a.position.line < b.position.line || (a.position.line === b.position.line && a.position.character < b.position.character)) {
            return -1;
        }
        else if (a.position.line === b.position.line && a.position.character === b.position.character) {
            return (a.index < b.index) ? -1 : 1;
        }
        else {
            return 1;
        }
    }
    compareByIndex(a, b) {
        if (!a && !b)
            return 0;
        if (!a)
            return -1;
        if (!b)
            return 1;
        if (a.index < b.index) {
            return -1;
        }
        else if (a.index === b.index) {
            return 0;
        }
        else {
            return 1;
        }
    }
    getDecorationOptions() {
        try {
            let decorationOptions = [];
            let count = 0;
            this.steps.forEach((step) => {
                //is it Top level Statement?
                if (step.verifiable.root === step) {
                    count = 1;
                }
                if (step.canBeShownAsDecoration) {
                    let parent = step.getClientParent();
                    let options = {
                        hoverMessage: (step.kind ? step.kind + ": " : "") + ViperProtocol_1.StatementType[step.type] + " " + step.formula,
                        range: {
                            start: { line: step.position.line, character: 0 },
                            end: { line: step.position.line, character: 0 }
                        },
                        renderOptions: {
                            before: {
                                contentText: "" /*"(" + (decorationOptions.length + 1) + ")"*/,
                                color: step.isErrorState ? ViperProtocol_1.StateColors.errorState(Settings_1.Settings.settings.advancedFeatures.darkGraphs) : ViperProtocol_1.StateColors.interestingState(Settings_1.Settings.settings.advancedFeatures.darkGraphs),
                            }
                        },
                        index: decorationOptions.length,
                        parent: parent ? parent.decorationOptions.index : -1,
                        numberToDisplay: count++,
                        originalPosition: step.position,
                        depth: step.depthLevel(),
                        methodIndex: step.verifiable.index,
                        isErrorState: step.isErrorState,
                    };
                    decorationOptions.push(options);
                    this.clientStepIndexToServerStep.push(step);
                    //add decorationOptions to step
                    step.decorationOptions = options;
                }
            });
            let optionsInLine = -1;
            let line = 0;
            this.stateIndicesOrderedByPosition.forEach(idx => {
                let step = this.steps[idx.index];
                if (step.canBeShownAsDecoration) {
                    if (step.position.line === line) {
                        optionsInLine++;
                    }
                    else {
                        line = step.position.line;
                        optionsInLine = 0;
                    }
                    step.decorationOptions.range.start.character = step.position.character + optionsInLine + 1;
                    step.decorationOptions.range.end.character = step.position.character + optionsInLine + 2;
                }
            });
            let model = this.model.pretty();
            return {
                decorationOptions: decorationOptions,
                globalInfo: this.prettySteps() + "\n" + (model ? model : "no model"),
                uri: this.fileUri
            };
        }
        catch (e) {
            Log_1.Log.error("Error getting decoration options: " + e);
        }
    }
    prepareVerification() {
        this.running = true;
        this.aborting = false;
        this.state = ViperProtocol_1.VerificationState.Stopped;
        this.lines = [];
        this.wrongFormat = false;
        if (this.partialData.length > 0) {
            Log_1.Log.error("Some unparsed output was detected:\n" + this.partialData);
            this.partialData = "";
        }
        this.time = 0;
        this.resetDiagnostics();
        this.steps = [];
        this.verifiables = [];
        this.model = new Model_1.Model();
        this.parsingCompleted = true;
        this.typeCheckingCompleted = true;
        this.clientStepIndexToServerStep = [];
        this.symbExLog = [];
        this.stateIndicesOrderedByPosition = [];
        this.internalErrorMessage = "";
    }
    verify(manuallyTriggered) {
        //Initialization
        this.prepareVerification();
        this.manuallyTriggered = manuallyTriggered;
        let stage = ServerClass_1.Server.backend.stages[0];
        if (!stage) {
            Log_1.Log.error("backend " + ServerClass_1.Server.backend.name + " has no " + Settings_1.Settings.VERIFY + " stage, even though the settigns were checked.");
            return false;
        }
        Log_1.Log.log("verify " + pathHelper.basename(this.fileUri), ViperProtocol_1.LogLevel.Default);
        ServerClass_1.Server.executedStages.push(stage);
        Log_1.Log.log(ServerClass_1.Server.backend.name + ' verification started', ViperProtocol_1.LogLevel.Info);
        let path = ViperProtocol_1.Common.uriToPath(this.fileUri);
        //Request the debugger to terminate it's session
        DebugServer_1.DebugServer.stopDebugging();
        //start verification of current file
        this.path = path;
        this.filename = pathHelper.basename(path);
        this.verificationCount++;
        //notify client
        ServerClass_1.Server.sendStateChangeNotification({
            newState: ViperProtocol_1.VerificationState.VerificationRunning,
            filename: this.filename
        }, this);
        //this.startVerificationTimeout(this.verificationCount);
        ServerClass_1.Server.backendService.startStageProcess(path, stage, this.stdOutHandler.bind(this), this.stdErrHandler.bind(this), this.completionHandler.bind(this));
        return true;
    }
    resetDiagnostics() {
        this.diagnostics = [];
        ServerClass_1.Server.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
    }
    resetLastSuccess() {
        this.lastSuccess = ViperProtocol_1.Success.None;
    }
    // private startVerificationTimeout(verificationCount: number) {
    //     if (Server.backend.timeout) {
    //         Log.log("Set verification timeout to " + Server.backend.timeout, LogLevel.LowLevelDebug);
    //         setTimeout(() => {
    //             //Log.log("check for verification timeout", LogLevel.Debug);
    //             if (this.running && this.verificationCount == verificationCount) {
    //                 Log.hint("The verification timed out after " + Server.backend.timeout + "ms");
    //                 this.abortVerificationIfRunning().then(() => {
    //                     //wait for verification to terminate
    //                     Server.sendStateChangeNotification({
    //                         newState: VerificationState.Ready,
    //                         verificationCompleted: false,
    //                         success: Success.Timeout,
    //                         verificationNeeded: false,
    //                         uri: this.fileUri
    //                     }, this);
    //                 });
    //             }
    //             this.running = false;
    //         }, Server.backend.timeout);
    //     } else {
    //         Log.log("No verification timeout set", LogLevel.LowLevelDebug);
    //     }
    // }
    completionHandler(code) {
        try {
            Log_1.Log.log(`completionHandler is called with code ${code}`, ViperProtocol_1.LogLevel.Debug);
            //if (code == null) {
            //    this.internalErrorMessage = "Possibly the backend generated to much output."
            //}
            if (this.aborting) {
                this.running = false;
                return;
            }
            let success = ViperProtocol_1.Success.None;
            let isVerifyingStage = ServerClass_1.Server.stage().isVerification;
            //do we need to start a followUp Stage?
            if (!this.aborting) {
                let lastStage = ServerClass_1.Server.stage();
                let newStage;
                if (isVerifyingStage) {
                    success = this.determineSuccess(code);
                    newStage = Settings_1.Settings.getStageFromSuccess(ServerClass_1.Server.backend, lastStage, success);
                }
                else {
                    newStage = Settings_1.Settings.getStage(ServerClass_1.Server.backend, lastStage.onSuccess);
                }
                if (newStage) {
                    //only continue if no cycle
                    //only verifications are allowed to be repeated twice if the preceeding operation was no verification
                    let newStageExecutions = ServerClass_1.Server.executedStages.filter(stage => stage.name === newStage.name).length;
                    if (newStageExecutions <= 0 ||
                        (newStage.isVerification && !lastStage.isVerification && newStageExecutions <= 1)) {
                        ServerClass_1.Server.sendStateChangeNotification({ newState: ViperProtocol_1.VerificationState.Stage, stage: newStage.name, filename: this.filename }, this);
                        let successMessage = ViperProtocol_1.Success[isVerifyingStage ? success : ViperProtocol_1.Success.Success];
                        Log_1.Log.log(`Start stage ${newStage.name} after stage ${lastStage.name}, success was: ${successMessage}`, ViperProtocol_1.LogLevel.Info);
                        ServerClass_1.Server.executedStages.push(newStage);
                        let path = ViperProtocol_1.Common.uriToPath(this.fileUri);
                        ServerClass_1.Server.backendService.startStageProcess(path, newStage, this.stdOutHandler.bind(this), this.stdErrHandler.bind(this), this.completionHandler.bind(this));
                        return;
                    }
                }
            }
            if (isVerifyingStage) {
                if (this.partialData.length > 0) {
                    Log_1.Log.error("Some unparsed output was detected:\n" + this.partialData);
                    this.partialData = "";
                }
                // Send the computed diagnostics to VSCode.
                //Server.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
                //inform client about postProcessing
                ServerClass_1.Server.sendStateChangeNotification({
                    newState: ViperProtocol_1.VerificationState.PostProcessing,
                    filename: this.filename,
                }, this);
                //load the Execution trace from the SymbExLogFile
                this.loadSymbExLogFromFile();
                //complete the information about the method borders.
                //this can only be done at the end of the verification
                this.completeVerificationState();
                Log_1.Log.log("Number of Steps: " + this.steps.length, ViperProtocol_1.LogLevel.Info);
                //pass decorations to language client
                let decorations = this.getDecorationOptions();
                if (decorations.decorationOptions.length > 0) {
                    ServerClass_1.Server.sendStepsAsDecorationOptions(decorations);
                    //Log.log("decoration options update done", LogLevel.Debug);
                }
                //notify client about outcome of verification
                ServerClass_1.Server.sendStateChangeNotification({
                    newState: ViperProtocol_1.VerificationState.Ready,
                    success: success,
                    manuallyTriggered: this.manuallyTriggered,
                    filename: this.filename,
                    nofErrors: this.diagnostics.length,
                    time: this.time,
                    verificationCompleted: true,
                    uri: this.fileUri,
                    error: this.internalErrorMessage
                }, this);
                if (code != 0 && code != 1 && code != 899) {
                    Log_1.Log.log("Verification Backend Terminated Abnormaly: with code " + code, ViperProtocol_1.LogLevel.Debug);
                }
            }
            else {
                success = ViperProtocol_1.Success.Success;
                ServerClass_1.Server.sendStateChangeNotification({
                    newState: ViperProtocol_1.VerificationState.Ready,
                    success: success,
                    manuallyTriggered: this.manuallyTriggered,
                    filename: this.filename,
                    nofErrors: 0,
                    time: this.time,
                    verificationCompleted: false,
                    uri: this.fileUri,
                    error: this.internalErrorMessage
                }, this);
            }
            //reset for next verification
            this.lastSuccess = success;
            this.time = 0;
            this.running = false;
        }
        catch (e) {
            this.running = false;
            ServerClass_1.Server.sendVerificationNotStartedNotification(this.fileUri);
            Log_1.Log.error("Error handling verification completion: " + e);
        }
    }
    determineSuccess(code) {
        let result = ViperProtocol_1.Success.None;
        if (this.diagnostics.length == 0 && code == 0) {
            result = ViperProtocol_1.Success.Success;
        }
        else if (this.diagnostics.length > 0) {
            //use tag and backend trace as indicators for completed parsing
            if (!this.parsingCompleted && this.steps.length == 0) {
                result = ViperProtocol_1.Success.ParsingFailed;
            }
            else if (this.parsingCompleted && !this.typeCheckingCompleted) {
                result = ViperProtocol_1.Success.TypecheckingFailed;
            }
            else {
                result = ViperProtocol_1.Success.VerificationFailed;
            }
        }
        else {
            result = this.aborting ? ViperProtocol_1.Success.Aborted : ViperProtocol_1.Success.Error;
        }
        return result;
    }
    stdErrHandler(data) {
        try {
            data = data.trim();
            if (data.length == 0)
                return;
            Log_1.Log.toLogFile(data, ViperProtocol_1.LogLevel.LowLevelDebug);
            //hide scala/java stacktraces
            if (data.startsWith("at ") || data.startsWith("...") || data.startsWith("Caused by:")) {
                return;
            }
            this.internalErrorMessage = data;
            let stage = ServerClass_1.Server.stage();
            let message;
            let backendAndStage = "backend: " + ServerClass_1.Server.backend.name + " stage: " + ServerClass_1.Server.stage().name;
            if (data.startsWith("java.lang.NullPointerException")) {
                message = "A nullpointer exception happened in " + backendAndStage;
            }
            else if (data.startsWith("java.lang.ClassNotFoundException:")) {
                message = "Class " + ServerClass_1.Server.stage().mainMethod + " is unknown\nFix the backend settings for " + ServerClass_1.Server.backend.name;
            }
            else if (data.startsWith("java.io.IOException: Stream closed")) {
                message = "A concurrency error occured, try again. Original Error message: " + data;
            }
            else if (/java\.io\.IOException:.*?No such file or directory/.test(data)) {
                let match = /java\.io\.IOException:.*?(".*?").*?No such file or directory/.exec(data);
                message = "File not found";
                if (match && match[1]) {
                    message = message + " at: " + match[1];
                }
                Log_1.Log.hint(message + " consider changing the settings or updating the ViperTools", true, true);
            }
            else if (data.startsWith("java.lang.StackOverflowError")) {
                message = "StackOverflowError in verification backend";
            }
            else if (data.startsWith("SLF4J: Class path contains multiple SLF4J bindings")) {
                Log_1.Log.error(ServerClass_1.Server.backend.name + "'s path is referencing the same class multiple times", ViperProtocol_1.LogLevel.Info);
            }
            else if (data.startsWith("SLF4J:")) {
                Log_1.Log.error("Error in " + backendAndStage + ": " + data, ViperProtocol_1.LogLevel.LowLevelDebug);
            }
            else {
                Log_1.Log.error("Error in " + backendAndStage + ": " + data, ViperProtocol_1.LogLevel.Debug);
            }
            if (message) {
                Log_1.Log.error(message, ViperProtocol_1.LogLevel.Default);
                this.internalErrorMessage = message;
            }
        }
        catch (e) {
            let message = "Error handling stderr: " + e;
            Log_1.Log.error(message);
            this.internalErrorMessage = message;
        }
    }
    static parseJsonMessage(line) {
        let json;
        try {
            json = JSON.parse(line);
            let error;
            if (!json || !json.type) {
                error = "Message has no type, raw: " + JSON.stringify(json);
            }
            else {
                switch (json.type) {
                    case ViperProtocol_1.BackendOutputType.Start:
                        //backendType;
                        if (!json.backendType) {
                            error = "The Start message needs to contain the backendType";
                        }
                        break;
                    case ViperProtocol_1.BackendOutputType.VerificationStart:
                        //nofPredicates,nofMethods,nofFunctions;
                        if (json.nofFunctions == undefined || json.nofMethods == undefined || json.nofPredicates == undefined) {
                            error = "The VerificationStart message needs to contain nofPredicates, nofMethods, and nofFunctions.";
                        }
                        break;
                    case ViperProtocol_1.BackendOutputType.Stopped:
                    case ViperProtocol_1.BackendOutputType.Success:
                    case ViperProtocol_1.BackendOutputType.FunctionVerified:
                    case ViperProtocol_1.BackendOutputType.MethodVerified:
                    case ViperProtocol_1.BackendOutputType.PredicateVerified:
                        //nothing
                        break;
                    case ViperProtocol_1.BackendOutputType.Error:
                        //errors, err.tag, err.start, err.end, err.message
                        if (!json.errors) {
                            error = "Error message needs to contain errors";
                        }
                        else {
                            json.errors.forEach(err => {
                                if (!err.tag || !err.start || !err.end || !err.message) {
                                    error = "each error in error message needs to be of type {start: string, end: string, tag: string, message: string}";
                                }
                            });
                        }
                        break;
                    case ViperProtocol_1.BackendOutputType.End:
                        //time
                        if (!ServerClass_1.Server.containsNumber(json.time)) {
                            error = "End message needs to contain the time";
                        }
                        break;
                    case ViperProtocol_1.BackendOutputType.Outline:
                        //symbolInformation
                        if (!json.members) {
                            error = "The outline message needs to provide a list of members";
                        }
                        break;
                    case ViperProtocol_1.BackendOutputType.Definitions:
                        //symbolInformation
                        if (!json.definitions) {
                            error = "The definitions message needs to provide a list of definitions";
                        }
                        break;
                    default:
                        error = "Unknown message type: " + json.type;
                }
            }
            if (error) {
                throw new SyntaxError("malformed backend message: " + error);
            }
            else {
                return json;
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling json message: " + e + " raw: " + line);
            return null;
        }
    }
    stdOutHandler(data) {
        try {
            if (data.trim().length == 0) {
                return;
            }
            let stage = ServerClass_1.Server.stage();
            if (this.aborting) {
                return;
            }
            if (!stage.isVerification) {
                Log_1.Log.log(`${ServerClass_1.Server.backend.name}:${stage.name}: ${data}`, ViperProtocol_1.LogLevel.Debug);
                return;
            }
            let parts = data.split(/\r?\n/g);
            parts[0] = this.partialData + parts[0];
            for (var i = 0; i < parts.length; i++) {
                let line = parts[i];
                if (line.length == 0)
                    continue;
                //json message
                if (line.startsWith("{\"") && line.endsWith("}")) {
                    Log_1.Log.toLogFile(`[${ServerClass_1.Server.backend.name}: ${stage.name}: stdout]: ${line}`, ViperProtocol_1.LogLevel.LowLevelDebug);
                    let json = VerificationTask.parseJsonMessage(line);
                    if (!json) {
                        if (ServerClass_1.Server.backendService.isViperServerService) {
                            ServerClass_1.Server.backendService.isSessionRunning = false;
                            this.completionHandler(0);
                        }
                        let diag = {
                            range: {
                                start: { line: 0, character: 0 },
                                end: { line: 0, character: 0 }
                            },
                            source: null,
                            severity: language_server.DiagnosticSeverity.Error,
                            message: "the message from ViperServer violates the expected protocol"
                        };
                        this.diagnostics.push(diag);
                        ServerClass_1.Server.sendStateChangeNotification({
                            newState: ViperProtocol_1.VerificationState.VerificationReporting,
                            filename: this.filename,
                            nofErrors: this.diagnostics.length,
                            uri: this.fileUri,
                            diagnostics: JSON.stringify(this.diagnostics)
                        }, this);
                    }
                    switch (json.type) {
                        case ViperProtocol_1.BackendOutputType.Start:
                            this.backendType = json.backendType;
                            break;
                        case ViperProtocol_1.BackendOutputType.VerificationStart:
                            this.progress = new TotalProgress_1.Progress(json);
                            ServerClass_1.Server.sendStateChangeNotification({
                                newState: ViperProtocol_1.VerificationState.VerificationRunning,
                                progress: 0,
                                filename: this.filename
                            }, this);
                            break;
                        case ViperProtocol_1.BackendOutputType.FunctionVerified:
                        case ViperProtocol_1.BackendOutputType.MethodVerified:
                        case ViperProtocol_1.BackendOutputType.PredicateVerified:
                            if (!this.progress) {
                                Log_1.Log.error("The backend must send a VerificationStart message before the ...Verified message.");
                                return;
                            }
                            this.progress.updateProgress(json);
                            let progressInPercent = this.progress.toPercent();
                            ServerClass_1.Server.sendStateChangeNotification({
                                newState: ViperProtocol_1.VerificationState.VerificationRunning,
                                progress: progressInPercent,
                                filename: this.filename
                            }, this);
                            // NOTE: This is where we know on the language-server side that we have verified a
                            //       top-level construct (predicate, function, method). This is where we could put
                            //       the call to inform the language client of the progress. That in turn shouldd
                            //       notify anyone listening for those events.
                            //       The remaining question is whether we get partial symb-ex-logs
                            break;
                        case ViperProtocol_1.BackendOutputType.Error:
                            json.errors.forEach(err => {
                                if (err.tag && err.tag == "typechecker.error") {
                                    this.typeCheckingCompleted = false;
                                }
                                else if (err.tag && err.tag == "parser.error") {
                                    this.parsingCompleted = false;
                                    this.typeCheckingCompleted = false;
                                }
                                let range = ServerClass_1.Server.extractRange(err.start, err.end);
                                Log_1.Log.log(`Error: [${ServerClass_1.Server.backend.name}] ${err.tag ? "[" + err.tag + "] " : ""}${range.start.line + 1}:${range.start.character + 1} ${err.message}`, ViperProtocol_1.LogLevel.Default);
                                let diag = {
                                    range: range,
                                    source: null,
                                    severity: language_server.DiagnosticSeverity.Error,
                                    message: err.message + (err.cached ? " (cached)" : "")
                                };
                                this.diagnostics.push(diag);
                                ServerClass_1.Server.sendStateChangeNotification({
                                    newState: ViperProtocol_1.VerificationState.VerificationRunning,
                                    filename: this.filename,
                                    nofErrors: this.diagnostics.length,
                                    uri: this.fileUri,
                                    diagnostics: JSON.stringify(this.diagnostics)
                                }, this);
                                //Server.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
                            });
                            break;
                        case ViperProtocol_1.BackendOutputType.Success:
                            //since the server keeps running, 
                            //we need to trigger the verification completion event manually
                            if (ServerClass_1.Server.backendService.isViperServerService) {
                                ServerClass_1.Server.backendService.isSessionRunning = false;
                                this.completionHandler(0);
                            }
                            break;
                        case ViperProtocol_1.BackendOutputType.End:
                            this.state = ViperProtocol_1.VerificationState.VerificationReporting;
                            this.time = ServerClass_1.Server.extractNumber(json.time);
                            break;
                        case ViperProtocol_1.BackendOutputType.Stopped:
                            Log_1.Log.log("Stopped message found", ViperProtocol_1.LogLevel.Debug);
                            if (ServerClass_1.Server.backendService.isViperServerService && ServerClass_1.Server.backendService.isSessionRunning) {
                                ServerClass_1.Server.backendService.isSessionRunning = false;
                                this.completionHandler(1);
                            }
                            break;
                        case ViperProtocol_1.BackendOutputType.Outline:
                            this.symbolInformation = [];
                            json.members.forEach((m) => {
                                let pos = ServerClass_1.Server.extractPosition(m.location);
                                let range = !pos
                                    ? language_server.Range.create(0, 0, 0, 0)
                                    : language_server.Range.create(pos.pos.line, pos.pos.character, pos.pos.line, pos.pos.character);
                                let location = { uri: this.fileUri, range: range };
                                let kind;
                                switch (m.type) {
                                    case "method":
                                        kind = vscode_languageserver_1.SymbolKind.Method;
                                        break;
                                    case "function":
                                        kind = vscode_languageserver_1.SymbolKind.Function;
                                        break;
                                    case "predicate":
                                        kind = vscode_languageserver_1.SymbolKind.Interface;
                                        break;
                                    case "field":
                                        kind = vscode_languageserver_1.SymbolKind.Field;
                                        break;
                                    case "domain":
                                        kind = vscode_languageserver_1.SymbolKind.Class;
                                        break;
                                    default: kind = vscode_languageserver_1.SymbolKind.Enum;
                                }
                                let info = { name: m.name, kind: kind, location: location };
                                this.symbolInformation.push(info);
                            });
                            break;
                        case ViperProtocol_1.BackendOutputType.Definitions:
                            this.definitions = [];
                            json.definitions.forEach((def) => {
                                let start = (def.scopeStart == "global") ? null : ServerClass_1.Server.extractPosition(def.scopeStart);
                                let end = (def.scopeEnd == "global") ? null : ServerClass_1.Server.extractPosition(def.scopeEnd);
                                let pos = ServerClass_1.Server.extractPosition(def.location);
                                let location = language_server.Range.create(pos.pos.line, pos.pos.character, pos.pos.line, pos.pos.character);
                                let range = null;
                                if (start && end) {
                                    range = language_server.Range.create(start.pos.line, start.pos.character, end.pos.line, end.pos.character);
                                }
                                let definition = new ViperProtocol_1.Definition(def, location, range);
                                this.definitions.push(definition);
                                //Log.log("Definition: " + JSON.stringify(definition), LogLevel.LowLevelDebug);
                            });
                            break;
                    }
                }
                else if (line.startsWith('"')) {
                    while (i + 1 < parts.length && !line.endsWith('"')) {
                        line += parts[++i];
                    }
                    if (line.endsWith('"')) {
                        this.model.extendModel(line);
                        this.partialData = "";
                    }
                    else {
                        this.partialData = line;
                    }
                }
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling the output of the backend: " + e);
        }
    }
    handleBackendOutputLine(line) {
        switch (this.state) {
            case ViperProtocol_1.VerificationState.Stopped:
                if (line.startsWith("Command-line interface:")) {
                    Log_1.Log.error('Could not start verification -> fix customArguments for backend', ViperProtocol_1.LogLevel.Default);
                    this.state = ViperProtocol_1.VerificationState.VerificationPrintingHelp;
                }
                break;
            case ViperProtocol_1.VerificationState.VerificationRunning:
                line = line.trim();
                //detect vetification end, get time
                if (line.startsWith('Silicon finished in') || line.startsWith('carbon finished in')) {
                    Log_1.Log.log("WARNING: analyze the reason for this code to be executed", ViperProtocol_1.LogLevel.Debug);
                    this.state = ViperProtocol_1.VerificationState.VerificationReporting;
                    this.time = ServerClass_1.Server.extractNumber(line);
                    //model for counterexample
                }
                break;
            case ViperProtocol_1.VerificationState.VerificationReporting:
                if (line == 'No errors found.') { }
                else if (line.startsWith('The following errors were found')) { }
                else if (line.startsWith('  Internal error:')) {
                    this.internalErrorMessage = line.substring('  Internal error:'.length, line.length).trim();
                }
                else if (line.startsWith('  ')) {
                    let parsedPosition = ServerClass_1.Server.extractPosition(line);
                    let message = parsedPosition.after.length > 0 ? parsedPosition.after : parsedPosition.before;
                    //read in error tags
                    let tag;
                    if (line.indexOf("[") >= 0 && line.indexOf("]") >= 0) {
                        tag = line.substring(line.indexOf("[") + 1, line.indexOf("]")).trim();
                        if (tag == "typechecker.error") {
                            this.typeCheckingCompleted = false;
                        }
                        else if (tag == "parser.error") {
                            this.parsingCompleted = false;
                            this.typeCheckingCompleted = false;
                        }
                    }
                    tag = tag ? "[" + tag + "] " : "";
                    let pos = parsedPosition.pos || { line: 0, character: 0 };
                    let posString = parsedPosition.range ? this.prettyRange(parsedPosition.range) : this.prettyPos(pos);
                    //either pick range or pos to show diagnostics.
                    let range = parsedPosition.range ? parsedPosition.range : {
                        start: pos,
                        end: { line: pos.line, character: 10000 } //Number.max does not work -> 10000 is an arbitrary large number that does the job
                    };
                    Log_1.Log.log(`Error: [${ServerClass_1.Server.backend.name}] ${tag}${posString} ${message}`, ViperProtocol_1.LogLevel.Default);
                    this.diagnostics.push({
                        range: range,
                        source: null,
                        severity: language_server.DiagnosticSeverity.Error,
                        message: message
                    });
                }
                else {
                    Log_1.Log.error("Unexpected message during VerificationReporting: " + line);
                }
                break;
            case ViperProtocol_1.VerificationState.VerificationPrintingHelp:
                return -1;
        }
    }
    prettyRange(range) {
        return `${this.prettyPos(range.start)}-${this.prettyPos(range.end)}`;
    }
    prettyPos(pos) {
        return `${pos.line + 1}:${pos.character + 1}`;
    }
    completeVerificationState() {
        this.stateIndicesOrderedByPosition = [];
        let symbExLogIndex = 0;
        let lastMatchingLogIndex = -1;
        let methodIndex = -1;
        this.steps.forEach((element, i) => {
            if (element.canBeShownAsDecoration) {
                this.stateIndicesOrderedByPosition.push({ index: element.index, position: element.position });
                let statement = element;
            }
            //check trivial states
            if (element.isTrivialState) {
                if (element.children && element.hasNonTrivialChildren()) {
                    Log_1.Log.log("Warning: server state " + element.index + " is a trivial state with a non trivial child", ViperProtocol_1.LogLevel.Debug);
                }
            }
            //determine if the state is an error state
            //TODO: is the detection right?
            for (let j = 0; j < this.diagnostics.length; j++) {
                let diagnostic = this.diagnostics[j];
                if (ViperProtocol_1.Common.comparePosition(diagnostic.range.start, element.position) == 0) {
                    element.isErrorState = true;
                    element.fillInConcreteValues(this.model);
                    break;
                }
            }
        });
        this.stateIndicesOrderedByPosition.sort(this.comparePositionAndIndex);
    }
    getPositionOfState(index) {
        if (index >= 0 && index < this.steps.length) {
            if (this.steps[index].position) {
                return this.steps[index].position;
            }
            else {
                return { line: 0, character: 0 };
            }
        }
        else {
            return { line: -1, character: -1 };
        }
    }
    abortVerificationIfRunning() {
        return new Promise((resolve, reject) => {
            try {
                if (!this.running) {
                    resolve(true);
                    return;
                }
                Log_1.Log.log('Abort running verification', ViperProtocol_1.LogLevel.Info);
                this.aborting = true;
                ServerClass_1.Server.backendService.stopVerification().then(() => { resolve(true); });
                this.running = false;
                this.lastSuccess = ViperProtocol_1.Success.Aborted;
            }
            catch (e) {
                Log_1.Log.error("Error aborting verification of " + this.filename + ": " + e);
                resolve(false);
            }
        });
    }
    getStepsOnLine(line) {
        let result = [];
        this.steps.forEach((step) => {
            if (step.position.line == line) {
                result.push(step);
            }
        });
        return result;
    }
    loadSymbExLogFromFile() {
        try {
            let symbExLogPath = pathHelper.join(ServerClass_1.Server.tempDirectory, "executionTreeData.js");
            Log_1.Log.log("Loading The symbexLog from: " + symbExLogPath, ViperProtocol_1.LogLevel.Debug);
            if (fs.existsSync(symbExLogPath)) {
                let content = fs.readFileSync(symbExLogPath).toString();
                content = content.substring(content.indexOf("["), content.length).replace(/\n/g, ' ');
                this.symbExLog = JSON.parse(content);
                Log_1.Log.log("Execution tree successfully loaded: " + this.symbExLog.length + " toplevel construct" + (this.symbExLog.length == 1 ? "" : "s") + " found", ViperProtocol_1.LogLevel.Info);
                //parse SymbexLog
                this.steps = [];
                this.verifiables = [];
                this.symbExLog.forEach(data => {
                    let index = this.verifiables.length;
                    this.verifiables.push(new Verifiable_1.Verifiable(this.steps, index, data, this));
                });
            }
            else {
                Log_1.Log.log("No executionTreeData.js found", ViperProtocol_1.LogLevel.Debug);
            }
        }
        catch (e) {
            Log_1.Log.error("Error loading SymbExLog from file: " + e);
            Log_1.Log.hint("Error reading backend output: please update the extension and the backend to the newest version.");
        }
    }
    static stopAllRunningVerifications() {
        return new Promise((resolve, reject) => {
            try {
                if (ServerClass_1.Server.verificationTasks && ServerClass_1.Server.verificationTasks.size > 0) {
                    let promises = [];
                    ServerClass_1.Server.verificationTasks.forEach(task => {
                        if (task.running) {
                            promises.push(new Promise((res, rej) => {
                                task.abortVerificationIfRunning().then(() => { res(true); });
                            }));
                        }
                    });
                    if (promises.length > 0) {
                        Log_1.Log.log("Stop all running verificationTasks", ViperProtocol_1.LogLevel.Debug);
                    }
                    Promise.all(promises).then(() => {
                        resolve(true);
                    });
                }
                else {
                    //nothing to stop
                    resolve(true);
                }
            }
            catch (e) {
                Log_1.Log.error("Error stopping all running verifications: " + e);
                reject();
            }
        });
    }
}
exports.VerificationTask = VerificationTask;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmVyaWZpY2F0aW9uVGFzay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmVyaWZpY2F0aW9uVGFzay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0lBTUk7QUFFSixZQUFZLENBQUM7O0FBQ2IsaUVBQXFFO0FBR3JFLHlEQUF5RDtBQUN6RCx5Q0FBcUM7QUFDckMsbURBQTZTO0FBQzdTLCtCQUE0QjtBQUc1QixtQ0FBZ0M7QUFDaEMsbUNBQW1DO0FBQ25DLHFEQUFrRDtBQUNsRCxtREFBMkM7QUFDM0MsK0NBQXVDO0FBQ3ZDLCtDQUE0QztBQUM1Qyx5QkFBeUI7QUFDekIsNkNBQTBDO0FBRzFDLE1BQWEsZ0JBQWdCO0lBeUN6QixZQUFZLE9BQWU7UUF4QzNCLDBDQUEwQztRQUMxQyxzQkFBaUIsR0FBVyxDQUFDLENBQUM7UUFLOUIsZ0JBQVcsR0FBWSx1QkFBTyxDQUFDLElBQUksQ0FBQztRQUNwQyx5QkFBb0IsR0FBVyxFQUFFLENBQUM7UUFFbEMsb0NBQW9DO1FBQ3BDLFlBQU8sR0FBWSxLQUFLLENBQUM7UUFDekIsbUJBQWMsR0FBWSxLQUFLLENBQUM7UUFDaEMsYUFBUSxHQUFZLEtBQUssQ0FBQztRQUMxQixVQUFLLEdBQXNCLGlDQUFpQixDQUFDLE9BQU8sQ0FBQztRQUVyRCxtQkFBbUI7UUFDWCxVQUFLLEdBQWEsRUFBRSxDQUFDO1FBQ3JCLGdCQUFXLEdBQVksS0FBSyxDQUFDO1FBQzdCLGdCQUFXLEdBQVcsRUFBRSxDQUFDO1FBQ2pDLHNCQUFzQjtRQUN0QixTQUFJLEdBQVcsQ0FBQyxDQUFDO1FBSWpCLFVBQUssR0FBVSxJQUFJLGFBQUssRUFBRSxDQUFDO1FBQzNCLHFCQUFnQixHQUFZLEtBQUssQ0FBQztRQUNsQywwQkFBcUIsR0FBWSxLQUFLLENBQUM7UUFFdkMsY0FBUyxHQUFxQixFQUFFLENBQUM7UUFhN0IsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7SUFDM0IsQ0FB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