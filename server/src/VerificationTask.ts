'use strict';
import { SymbolInformation, SymbolKind } from 'vscode-languageserver-types/lib/main';

import child_process = require('child_process');
import * as language_server from 'vscode-languageserver';
import { Settings } from './Settings'
import { Member, Common, ExecutionTrace, BackendOutput, BackendOutputType, SymbExLogEntry, Stage, MyProtocolDecorationOptions, StepsAsDecorationOptionsResult, StatementType, StateColors, Position, Range, HeapGraph, VerificationState, LogLevel, Success } from './ViperProtocol'
import { Log } from './Log';
import { BackendService } from './BackendService';
import { Statement } from './Statement';
import { Model } from './Model';
import * as pathHelper from 'path';
import { HeapVisualizer } from './HeapVisualizer';
import { Progress } from './TotalProgress';
import { Server } from './ServerClass';
import { DebugServer } from './DebugServer';
import * as fs from 'fs';
import { Verifiable } from './Verifiable';

export class VerificationTask {
    //state that is valid across verifications
    verificationCount: number = 0;
    // file under verification
    fileUri: string;
    filename: string;
    path: string;
    lastSuccess: Success = Success.None;
    internalErrorMessage: string = "";

    //state specific to one verification
    running: boolean = false;
    aborting: boolean = false;
    state: VerificationState = VerificationState.Stopped;
    manuallyTriggered: boolean;
    verifierProcess: child_process.ChildProcess;
    //working variables
    private lines: string[] = [];
    private wrongFormat: boolean = false;
    private partialData: string = "";
    //verification results
    time: number = 0;
    diagnostics: language_server.Diagnostic[];
    steps: Statement[];
    verifiables: Verifiable[];
    model: Model = new Model();
    parsingCompleted: boolean = false;
    typeCheckingCompleted: boolean = false;
    clientStepIndexToServerStep: Statement[];
    symbExLog: SymbExLogEntry[] = [];
    stateIndicesOrderedByPosition: { index: number, position: Position }[];

    backendType: string;

    progress: Progress;

    shownExecutionTrace: ExecutionTrace[];

    symbolInformation: SymbolInformation[];

    constructor(fileUri: string) {
        this.fileUri = fileUri;
    }

    public getHeapGraphDescription(clientIndex: number, isHeapNeeded: boolean): HeapGraph {
        //convert client index to server index
        let serverIndex = this.clientStepIndexToServerStep[clientIndex].index;

        if (!this.steps) {
            Log.error("Cannot show heap: no steps avaliable, a reverification is needed.");
        }
        if (serverIndex < 0 || serverIndex >= this.steps.length) {
            Log.error("Cannot show heap at step " + clientIndex + " only states 0 - " + (this.clientStepIndexToServerStep.length - 1) + " are valid");
            return;
        }
        let step = this.steps[serverIndex];
        if (!step) {
            Log.error("Cannot show heap at step " + clientIndex + " step is null");
            return;
        }

        //inform debug server about selected State
        DebugServer.moveDebuggerToPos(step.position, clientIndex);

        return isHeapNeeded ? {
            heap: HeapVisualizer.heapToDotUsingOwnDotGraph(step, false, Settings.settings.advancedFeatures.showSymbolicState, step.isErrorState, this.model),
            oldHeap: HeapVisualizer.heapToDotUsingOwnDotGraph(step, true, Settings.settings.advancedFeatures.showSymbolicState, step.isErrorState, this.model),
            partialExecutionTree: HeapVisualizer.executionTreeAroundStateToDot(step),
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

    private prettySteps(): string {
        try {
            let res: string = "";
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

            res += '\nNumberOfClientSteps: ' + numberOfClientSteps
            //Log.log("Steps:\n" + res, LogLevel.LowLevelDebug);
            return res;
        } catch (e) {
            Log.error("Runtime Error in Pretty Steps: " + e)
        }
    }

    private comparePositionAndIndex(a: Statement, b: Statement): number {
        if (!a && !b) return 0;
        if (!a) return -1;
        if (!b) return 1;
        if (a.position.line < b.position.line || (a.position.line === b.position.line && a.position.character < b.position.character)) {
            return -1;
        } else if (a.position.line === b.position.line && a.position.character === b.position.character) {
            return (a.index < b.index) ? -1 : 1;
        } else {
            return 1;
        }
    }

    private comparePosition(a: Position, b: Position): number {
        if (!a && !b) return 0;
        if (!a) return -1;
        if (!b) return 1;
        if (a.line < b.line || (a.line === b.line && a.character < b.character)) {
            return -1;
        } else if (a.line === b.line && a.character === b.character) {
            return 0;
        } else {
            return 1;
        }
    }

    private compareByIndex(a: Statement, b: Statement): number {
        if (!a && !b) return 0;
        if (!a) return -1;
        if (!b) return 1;
        if (a.index < b.index) {
            return -1;
        } else if (a.index === b.index) {
            return 0;
        } else {
            return 1;
        }
    }

    public getDecorationOptions(): StepsAsDecorationOptionsResult {
        try {
            let decorationOptions: MyProtocolDecorationOptions[] = [];
            let count = 0;
            this.steps.forEach((step) => {
                //is it Top level Statement?
                if (step.verifiable.root === step) {
                    count = 1;
                }
                if (step.canBeShownAsDecoration) {

                    let parent = step.getClientParent();
                    let options: MyProtocolDecorationOptions = {
                        hoverMessage: (step.kind ? step.kind + ": " : "") + StatementType[step.type] + " " + step.formula,
                        range: {
                            start: { line: step.position.line, character: 0 },
                            end: { line: step.position.line, character: 0 }
                        },
                        renderOptions: {
                            before: {
                                contentText: ""/*"(" + (decorationOptions.length + 1) + ")"*/,
                                color: step.isErrorState ? StateColors.errorState(Settings.settings.advancedFeatures.darkGraphs) : StateColors.interestingState(Settings.settings.advancedFeatures.darkGraphs),
                            }
                        },
                        index: decorationOptions.length,
                        parent: parent ? parent.decorationOptions.index : -1,
                        numberToDisplay: count++,
                        originalPosition: step.position,
                        depth: step.depthLevel(),
                        methodIndex: step.verifiable.index,
                        isErrorState: step.isErrorState,
                    }
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
                    } else {
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
            }
        } catch (e) {
            Log.error("Error getting decoration options: " + e)
        }
    }

    prepareVerification() {
        this.running = true;
        this.aborting = false;
        this.state = VerificationState.Stopped;
        this.lines = [];
        this.wrongFormat = false;
        if (this.partialData.length > 0) {
            Log.error("Some unparsed output was detected:\n" + this.partialData);
            this.partialData = "";
        }
        this.time = 0;
        this.resetDiagnostics();
        this.steps = [];
        this.verifiables = [];
        this.model = new Model();
        this.parsingCompleted = true;
        this.typeCheckingCompleted = true;
        this.clientStepIndexToServerStep = [];
        this.symbExLog = [];
        this.stateIndicesOrderedByPosition = [];
        this.internalErrorMessage = "";
    }

    verify(manuallyTriggered: boolean): boolean {
        //Initialization
        this.prepareVerification();
        this.manuallyTriggered = manuallyTriggered;
        let stage = Server.backend.stages[0];
        if (!stage) {
            Log.error("backend " + Server.backend.name + " has no " + Settings.VERIFY + " stage, even though the settigns were checked.");
            return false;
        }

        Log.log("verify " + pathHelper.basename(this.fileUri), LogLevel.Default);

        Server.executedStages.push(stage);
        Log.log(Server.backend.name + ' verification started', LogLevel.Info);

        let path = Common.uriToPath(this.fileUri);
        //Request the debugger to terminate it's session
        DebugServer.stopDebugging();
        //start verification of current file
        this.path = path
        this.filename = pathHelper.basename(path);
        this.verificationCount++;

        //notify client
        Server.sendStateChangeNotification({
            newState: VerificationState.VerificationRunning,
            filename: this.filename
        }, this);

        this.startVerificationTimeout(this.verificationCount);
        this.verifierProcess = Server.backendService.startStageProcess(path, stage, this.stdOutHandler.bind(this), this.stdErrHandler.bind(this), this.completionHandler.bind(this));
        return true;
    }

    resetDiagnostics() {
        this.diagnostics = [];
        Server.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
    }

    resetLastSuccess() {
        this.lastSuccess = Success.None;
    }

    private startVerificationTimeout(verificationCount: number) {
        if (Server.backend.timeout) {
            setTimeout(() => {
                //Log.log("check for verification timeout", LogLevel.Debug);
                if (this.running && this.verificationCount == verificationCount) {
                    Log.hint("The verification timed out after " + Server.backend.timeout + "ms");
                    this.abortVerificationIfRunning().then(() => {
                        //wait for verification to terminate
                        Server.sendStateChangeNotification({
                            newState: VerificationState.Ready,
                            verificationCompleted: false,
                            success: Success.Timeout,
                            verificationNeeded: false,
                            uri: this.fileUri
                        }, this);
                    });
                }
                this.running = false;
            }, Server.backend.timeout);
        }
    }

    private completionHandler(code) {
        try {
            Log.log(`Child process exited with code ${code}`, LogLevel.Debug);
            if (code == null) {
                this.internalErrorMessage = "Possibly the backend generated to much output."
            }
            if (this.aborting) {
                this.running = false;
                return;
            }
            let success;

            let isVerifyingStage = Server.stage().isVerification;

            //do we need to start a followUp Stage?
            if (!this.aborting) {
                let lastStage: Stage = Server.stage();
                let newStage: Stage;
                if (isVerifyingStage) {
                    success = this.determineSuccess(code);
                    newStage = Settings.getStageFromSuccess(Server.backend, lastStage, success)
                } else {
                    newStage = Settings.getStage(Server.backend, lastStage.onSuccess);
                }
                if (newStage) {
                    //only continue if no cycle
                    //only verifications are allowed to be repeated twice if the preceeding operation was no verification
                    let newStageExecutions = Server.executedStages.filter(stage => stage.name === newStage.name).length;
                    if (newStageExecutions <= 0 ||
                        (newStage.isVerification && !lastStage.isVerification && newStageExecutions <= 1)) {
                        Server.sendStateChangeNotification({ newState: VerificationState.Stage, stage: newStage.name, filename: this.filename }, this)
                        let successMessage = Success[isVerifyingStage ? success : Success.Success];

                        Log.log(`Start stage ${newStage.name} after stage ${lastStage.name}, success was: ${successMessage}`, LogLevel.Info);
                        Server.executedStages.push(newStage);
                        let path = Common.uriToPath(this.fileUri);
                        Server.backendService.startStageProcess(path, newStage, this.stdOutHandler.bind(this), this.stdErrHandler.bind(this), this.completionHandler.bind(this));
                        return;
                    }
                }
            }

            if (isVerifyingStage) {
                if (this.partialData.length > 0) {
                    Log.error("Some unparsed output was detected:\n" + this.partialData);
                    this.partialData = "";
                }

                // Send the computed diagnostics to VSCode.
                Server.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });

                //inform client about postProcessing
                Server.sendStateChangeNotification({
                    newState: VerificationState.PostProcessing,
                    filename: this.filename,
                }, this);

                //load the Execution trace from the SymbExLogFile
                this.loadSymbExLogFromFile();

                //complete the information about the method borders.
                //this can only be done at the end of the verification
                this.completeVerificationState();

                Log.log("Number of Steps: " + this.steps.length, LogLevel.Info);
                //pass decorations to language client
                let decorations: StepsAsDecorationOptionsResult = this.getDecorationOptions();

                if (decorations.decorationOptions.length > 0) {
                    Server.sendStepsAsDecorationOptions(decorations);
                    //Log.log("decoration options update done", LogLevel.Debug);
                }

                //notify client about outcome of verification
                Server.sendStateChangeNotification({
                    newState: VerificationState.Ready,
                    success: success,
                    manuallyTriggered: this.manuallyTriggered,
                    filename: this.filename,
                    nofErrors: this.diagnostics.length,
                    time: this.time,
                    verificationCompleted: true,
                    uri: this.fileUri,
                    error: this.internalErrorMessage
                }, this);

                //is there the need to restart nailgun?
                if (code != 0 && code != 1 && code != 899) {
                    Log.log("Verification Backend Terminated Abnormaly: with code " + code, LogLevel.Debug);
                    if (code == null) {
                        //this.nailgunService.setStopping();
                        Server.backendService.stopVerification()
                        // .then(resolve => {
                        //     this.nailgunService.startOrRestartNailgunServer(Server.backend, false);
                        // });
                    }
                }
            } else {
                success = Success.Success;
                Server.sendStateChangeNotification({
                    newState: VerificationState.Ready,
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
            this.verifierProcess = null;
        } catch (e) {
            this.running = false;
            this.verifierProcess = null;
            Server.sendVerificationNotStartedNotification(this.fileUri);
            Log.error("Error handling verification completion: " + e);
        }
    }

    private determineSuccess(code: number): Success {
        let result: Success = Success.None;
        if (this.diagnostics.length == 0 && code == 0) {
            result = Success.Success;
        } else if (this.diagnostics.length > 0) {
            //use tag and backend trace as indicators for completed parsing
            if (!this.parsingCompleted && this.steps.length == 0) {
                result = Success.ParsingFailed;
            } else if (this.parsingCompleted && !this.typeCheckingCompleted) {
                result = Success.TypecheckingFailed;
            } else {
                result = Success.VerificationFailed;
            }
        } else {
            result = this.aborting ? Success.Aborted : Success.Error;
        }
        return result;
    }

    private stdErrHandler(data) {
        try {
            data = data.trim();
            if (data.length == 0) return;

            Log.toLogFile(data, LogLevel.LowLevelDebug);
            //hide scala/java stacktraces
            if (data.startsWith("at ") || data.startsWith("...") || data.startsWith("Caused by:")) {
                return;
            }
            this.internalErrorMessage = data;

            let stage = Server.stage();
            let message: string;
            let backendAndStage = "backend: " + Server.backend.name + " stage: " + Server.stage().name;
            if (data.startsWith("NailGun v")) {
                let hintMessage = "Wrong arguments for nailgun: Fix the customArguments in the settings of " + backendAndStage;
                Log.hint(hintMessage);
            }
            else if (data.startsWith("connect: No error")) {
                let hintMessage = "No Nailgun server is running on port " + Settings.settings.nailgunSettings.port + ": is your nailgun correctly linked in the settings?";
                Log.hint(hintMessage);
            }
            if (data.startsWith("java.lang.NullPointerException")) {
                message = "A nullpointer exception happened in " + backendAndStage;
            }
            else if (data.startsWith("java.lang.ClassNotFoundException:")) {
                message = "Class " + Server.stage().mainMethod + " is unknown to Nailgun\nFix the backend settings for " + Server.backend.name;
            }
            else if (data.startsWith("java.io.IOException: Stream closed")) {
                message = "A concurrency error occured, try again. Original Error message: " + data;
            }
            else if (/java\.io\.IOException:.*?No such file or directory/.test(data)) {
                let match = /java\.io\.IOException:.*?(".*?").*?No such file or directory/.exec(data)
                message = "File not found"
                if (match && match[1]) {
                    message = message + " at: " + match[1];
                }
                Log.hint(message + " consider changing the settings or updating the ViperTools", true, true);
            }
            else if (data.startsWith("java.lang.StackOverflowError")) {
                message = "StackOverflowError in verification backend";
            }
            else if (data.startsWith("SLF4J: Class path contains multiple SLF4J bindings")) {
                Log.error(Server.backend.name + "'s path is referencing the same class multiple times", LogLevel.Info);
            }
            else if (data.startsWith("SLF4J:")) {
                Log.error("Error in " + backendAndStage + ": " + data, LogLevel.LowLevelDebug);
            }
            else {
                Log.error("Error in " + backendAndStage + ": " + data, LogLevel.Debug);
            }
            if (message) {
                Log.error(message, LogLevel.Default);
                this.internalErrorMessage = message;
            }
        } catch (e) {
            let message = "Error handling stderr: " + e
            Log.error(message);
            this.internalErrorMessage = message;
        }
    }

    public static parseJsonMessage(line: string): BackendOutput {
        let json: BackendOutput;
        try {
            json = JSON.parse(line);
        } catch (e) {
            Log.error("Error handling json message: " + e + " raw: " + line);
            return null;
        }
        let error: string;
        if (!json || !json.type) {
            error = "Message has no type, raw: " + JSON.stringify(json);
        } else {
            switch (json.type) {
                case BackendOutputType.Start:
                    //backendType;
                    if (!json.backendType) {
                        error = "The Start message needs to contain the backendType";
                    }
                    break;
                case BackendOutputType.VerificationStart:
                    //nofPredicates,nofMethods,nofFunctions;
                    if (json.nofFunctions == undefined || json.nofMethods == undefined || json.nofPredicates == undefined) {
                        error = "The VerificationStart message needs to contain nofPredicates, nofMethods, and nofFunctions.";
                    }
                    break;
                case BackendOutputType.Stopped: case BackendOutputType.Success: case BackendOutputType.FunctionVerified: case BackendOutputType.MethodVerified: case BackendOutputType.PredicateVerified:
                    //nothing
                    break;
                case BackendOutputType.Error:
                    //errors, err.tag, err.start, err.end, err.message
                    if (!json.errors) {
                        error = "Error message needs to contain errors";
                    } else {
                        json.errors.forEach(err => {
                            if (!err.tag || !err.start || !err.end || !err.message) {
                                error = "each error in error message needs to be of type {start: string, end: string, tag: string, message: string}";
                            }
                        });
                    }
                    break;
                case BackendOutputType.End:
                    //time
                    if (!Server.containsNumber(json.time)) {
                        error = "End message needs to contain the time";
                    }
                    break;
                case BackendOutputType.Outline:
                    //symbolInformation
                    if (!json.members) {
                        error = "The outline message needs to provide a list of members";
                    }
                    break;
                default:
                    error = "Unknown message type: " + json.type;
            }
        }
        if (error) {
            Log.error("Malformed backend message: " + error);
            return null;
        } else {
            return json;
        }
    }

    private stdOutHandler(data: string) {
        try {
            if (data.trim().length == 0) {
                return;
            }
            let stage = Server.stage();
            if (this.aborting) return;
            if (stage.isVerification) {
                let parts = data.split(/\r?\n/g);
                parts[0] = this.partialData + parts[0];
                for (var i = 0; i < parts.length; i++) {
                    let line = parts[i];

                    if (line.length == 0) continue;

                    //json message
                    if (line.startsWith("{\"") && line.endsWith("}")) {
                        Log.toLogFile(`[${Server.backend.name}: ${stage.name}: stdout]: ${line}`, LogLevel.LowLevelDebug);
                        let json = VerificationTask.parseJsonMessage(line);
                        if (!json) {
                            return;
                        }

                        switch (json.type) {
                            case BackendOutputType.Start:
                                this.backendType = json.backendType;
                                break;
                            case BackendOutputType.VerificationStart:
                                this.progress = new Progress(json);
                                Server.sendStateChangeNotification({
                                    newState: VerificationState.VerificationRunning,
                                    progress: 0,
                                    filename: this.filename
                                }, this);
                                break;
                            case BackendOutputType.FunctionVerified: case BackendOutputType.MethodVerified: case BackendOutputType.PredicateVerified:
                                if (!this.progress) {
                                    Log.error("The backend must send a VerificationStart message before the ...Verified message.");
                                    return;
                                }
                                this.progress.updateProgress(json);
                                let progressInPercent = this.progress.toPercent();
                                Server.sendStateChangeNotification({
                                    newState: VerificationState.VerificationRunning,
                                    progress: progressInPercent,
                                    filename: this.filename
                                }, this);
                                break;
                            case BackendOutputType.Error:
                                json.errors.forEach(err => {
                                    if (err.tag && err.tag == "typechecker.error") {
                                        this.typeCheckingCompleted = false;
                                    }
                                    else if (err.tag && err.tag == "parser.error") {
                                        this.parsingCompleted = false;
                                        this.typeCheckingCompleted = false;
                                    }
                                    let range = Server.extractRange(err.start, err.end);
                                    Log.log(`Error: [${Server.backend.name}] ${err.tag ? "[" + err.tag + "] " : ""}${range.start.line + 1}:${range.start.character + 1} ${err.message}`, LogLevel.Default);
                                    this.diagnostics.push({
                                        range: range,
                                        source: null, //Server.backend.name
                                        severity: language_server.DiagnosticSeverity.Error,
                                        message: err.message
                                    });

                                    //since the viper server keeps running, 
                                    //we need to trigger the verification completion event manually
                                    if (Server.backendService.isViperServerService) {
                                        Server.backendService.isSessionRunning = false;
                                        this.completionHandler(0);
                                    }
                                });
                                break;
                            case BackendOutputType.Success:
                                //since the server keeps running, 
                                //we need to trigger the verification completion event manually
                                if (Server.backendService.isViperServerService) {
                                    Server.backendService.isSessionRunning = false;
                                    this.completionHandler(0);
                                }
                                break;
                            case BackendOutputType.End:
                                this.state = VerificationState.VerificationReporting;
                                this.time = Server.extractNumber(json.time);
                                break;
                            case BackendOutputType.Stopped:
                                Log.log("Stopped message found", LogLevel.Debug);
                                if (Server.backendService.isViperServerService && Server.backendService.isSessionRunning) {
                                    Server.backendService.isSessionRunning = false;
                                    this.completionHandler(1);
                                }
                                break;
                            case BackendOutputType.Outline:
                                this.symbolInformation = [];
                                json.members.forEach((m: Member) => {
                                    let pos = Server.extractPosition(m.location);
                                    let range = !pos
                                        ? language_server.Range.create(0, 0, 0, 0)
                                        : language_server.Range.create(pos.pos.line, pos.pos.character, pos.pos.line, pos.pos.character);
                                    let location: language_server.Location = { uri: this.fileUri, range: range };
                                    let kind: SymbolKind;
                                    let className = m.type.substring(m.type.lastIndexOf('.') + 1, m.type.length);
                                    switch (className) {
                                        case "Method": kind = SymbolKind.Method; break;
                                        case "Function": kind = SymbolKind.Function; break;
                                        case "Field": kind = SymbolKind.Field; break;
                                        case "Predicate": kind = SymbolKind.Interface; break;
                                        case "Domain": kind = SymbolKind.Class; break;
                                        default: kind = SymbolKind.Enum;
                                    }
                                    let info: SymbolInformation = { name: m.name, kind: kind, location: location }
                                    this.symbolInformation.push(info);
                                })
                                break;
                        }

                        //no need to handle old ouput, if it is in json format
                        continue;
                    } else if (line.startsWith('"')) {
                        while (i + 1 < parts.length && !line.endsWith('"')) {
                            line += parts[++i];
                        }
                        if (line.endsWith('"')) {
                            this.model.extendModel(line);
                            this.partialData = "";
                        } else {
                            this.partialData = line;
                        }
                        //no need to handle old ouput
                        continue;
                    }

                    //non json output handling:
                    //handle start and end of verification
                    if ((line.startsWith('Silicon') && !line.startsWith('Silicon finished')) || line.startsWith('carbon started')) {
                        Log.toLogFile(`[${Server.backend.name}: ${stage.name}: stdout]: ${line}`, LogLevel.LowLevelDebug);
                        if (this.state != VerificationState.VerificationRunning)
                            Log.log("State -> Verification Running", LogLevel.Info);
                        this.state = VerificationState.VerificationRunning;
                        continue;
                    }
                    else if (line.startsWith('Silicon finished') || line.startsWith('carbon finished in')) {
                        Log.toLogFile(`[${Server.backend.name}: ${stage.name}: stdout]: ${line}`, LogLevel.LowLevelDebug);
                        Log.log("State -> Error Reporting", LogLevel.Info);
                        this.state = VerificationState.VerificationReporting;
                        this.time = Server.extractNumber(line);
                    }
                    //handle other verification outputs and results
                    else if (line.trim().length > 0) {
                        Log.toLogFile(`[${Server.backend.name}: ${stage.name}: stdout]: ${line}`, LogLevel.LowLevelDebug);
                        if (i < parts.length - 1 || (this.state != VerificationState.VerificationRunning)) {
                            //only in VerificationRunning state, the lines are nicley split by newLine characters
                            //therefore, the partialData construct is only enabled during the verification;
                            //Log.toLogFile(`[${Server.backend.name}: stdout]: ${line}`, LogLevel.LowLevelDebug);
                            let linesToSkip = this.handleBackendOutputLine(line); {
                            }
                        }
                    }
                }
            } else {
                Log.log(`${Server.backend.name}:${stage.name}: ${data}`, LogLevel.Debug);
            }
        } catch (e) {
            Log.error("Error handling the std output of the backend: " + e);
        }
    }

    private handleBackendOutputLine(line: string) {
        switch (this.state) {
            case VerificationState.Stopped:
                if (line.startsWith("Command-line interface:")) {
                    Log.error('Could not start verification -> fix customArguments for backend', LogLevel.Default);
                    this.state = VerificationState.VerificationPrintingHelp;
                }
                break;
            case VerificationState.VerificationRunning:
                line = line.trim();
                //detect vetification end, get time
                if (line.startsWith('Silicon finished in') || line.startsWith('carbon finished in')) {
                    Log.log("WARNING: analyze the reason for this code to be executed", LogLevel.Debug);
                    this.state = VerificationState.VerificationReporting;
                    this.time = Server.extractNumber(line);
                    //model for counterexample
                }
                break;
            case VerificationState.VerificationReporting:
                if (line == 'No errors found.') { }
                else if (line.startsWith('The following errors were found')) { }
                else if (line.startsWith('  Internal error:')) {
                    this.internalErrorMessage = line.substring('  Internal error:'.length, line.length).trim();
                }
                else if (line.startsWith('  ')) {
                    let parsedPosition = Server.extractPosition(line);
                    let message = parsedPosition.after.length > 0 ? parsedPosition.after : parsedPosition.before;
                    //read in error tags
                    let tag: string;
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
                        end: { line: pos.line, character: 10000 }//Number.max does not work -> 10000 is an arbitrary large number that does the job
                    };

                    Log.log(`Error: [${Server.backend.name}] ${tag}${posString} ${message}`, LogLevel.Default);
                    this.diagnostics.push({
                        range: range,
                        source: null, //Server.backend.name
                        severity: language_server.DiagnosticSeverity.Error,
                        message: message
                    });
                } else {
                    Log.error("Unexpected message during VerificationReporting: " + line);
                }
                break;
            case VerificationState.VerificationPrintingHelp:
                return -1;
        }
    }

    private prettyRange(range: Range): string {
        return `${this.prettyPos(range.start)}-${this.prettyPos(range.end)}`;
    }

    private prettyPos(pos: Position): string {
        return `${pos.line + 1}:${pos.character + 1}`;
    }

    private completeVerificationState() {

        this.stateIndicesOrderedByPosition = [];
        let symbExLogIndex: number = 0;
        let lastMatchingLogIndex = -1;
        let methodIndex = -1;
        this.steps.forEach((element, i) => {
            if (element.canBeShownAsDecoration) {
                this.stateIndicesOrderedByPosition.push({ index: element.index, position: element.position });
                let statement = element
            }

            //check trivial states
            if (element.isTrivialState) {
                if (element.children && element.hasNonTrivialChildren()) {
                    Log.log("Warning: server state " + element.index + " is a trivial state with a non trivial child", LogLevel.Debug);
                }
            }

            //determine if the state is an error state
            //TODO: is the detection right?
            for (let j = 0; j < this.diagnostics.length; j++) {
                let diagnostic = this.diagnostics[j];
                if (this.comparePosition(diagnostic.range.start, element.position) == 0) {
                    element.isErrorState = true;
                    element.fillInConcreteValues(this.model);
                    break;
                }
            }
        });
        this.stateIndicesOrderedByPosition.sort(this.comparePositionAndIndex);
    }

    public getPositionOfState(index): Position {
        if (index >= 0 && index < this.steps.length) {
            if (this.steps[index].position) {
                return this.steps[index].position;
            } else {
                return { line: 0, character: 0 };
            }
        } else {
            return { line: -1, character: -1 };
        }
    }

    public abortVerificationIfRunning(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            try {
                if (!this.running) {
                    resolve(true);
                    return;
                }

                Log.log('Abort running verification', LogLevel.Info);
                this.aborting = true;

                if (this.verifierProcess) {
                    //remove impact of child_process to kill
                    this.verifierProcess.removeAllListeners('close');
                    this.verifierProcess.stdout.removeAllListeners('data');
                    this.verifierProcess.stderr.removeAllListeners('data');

                    //log the exit of the child_process to kill
                    let ngClientEndPromise = new Promise((res, rej) => {
                        this.verifierProcess.on('exit', (code, signal) => {
                            Log.log(`Child process exited with code ${code} and signal ${signal}`, LogLevel.Debug);
                            res(true);
                        })
                    });
                    let deamonKillerPromise = Server.backendService.stopVerification(this.verifierProcess.pid);
                    Promise.all([ngClientEndPromise, deamonKillerPromise, /*this.waitForNgServerToDetectShutDownClient()*/]).then(() => {
                        resolve(true);
                    });
                } else {
                    Server.backendService.stopVerification().then(() => {
                        resolve(true);
                    })
                }
                this.verifierProcess = null;
                this.running = false;
                this.lastSuccess = Success.Aborted;
            } catch (e) {
                Log.error("Error aborting verification of " + this.filename + ": " + e);
                resolve(false);
            }
        });
    }

    private waitForNgServerToDetectShutDownClient(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (!Server.backendService.isSessionRunning) {
                resolve(true);
            } else {
                Server.backendService.ngSessionFinished = () => {
                    Log.log("NGSession finished", LogLevel.Debug);
                    resolve(true);
                }
            }
        });
    }

    public getStepsOnLine(line: number): Statement[] {
        let result = [];
        this.steps.forEach((step) => {
            if (step.position.line == line) {
                result.push(step);
            }
        })
        return result;
    }

    public loadSymbExLogFromFile() {
        try {
            let symbExLogPath = pathHelper.join(Server.tempDirectory, "executionTreeData.js");
            Log.log("Loading The symbexLog from: " + symbExLogPath, LogLevel.Debug);
            if (fs.existsSync(symbExLogPath)) {
                let content = fs.readFileSync(symbExLogPath).toString();
                content = content.substring(content.indexOf("["), content.length).replace(/\n/g, ' ');
                this.symbExLog = <SymbExLogEntry[]>JSON.parse(content);
                Log.log("Execution tree successfully loaded: " + this.symbExLog.length + " toplevel construct" + (this.symbExLog.length == 1 ? "" : "s") + " found", LogLevel.Info);
                //parse SymbexLog
                this.steps = [];
                this.verifiables = [];
                this.symbExLog.forEach(data => {
                    let index = this.verifiables.length;
                    this.verifiables.push(new Verifiable(this.steps, index, data, this))
                });

            } else {
                Log.log("No executionTreeData.js found", LogLevel.Debug);
            }
        } catch (e) {
            Log.error("Error loading SymbExLog from file: " + e);
            Log.hint("Error reading backend output: please update the extension and the backend to the newest version.");
        }
    }

    public static stopAllRunningVerifications(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            try {
                if (Server.verificationTasks && Server.verificationTasks.size > 0) {
                    let promises: Promise<boolean>[] = [];
                    Server.verificationTasks.forEach(task => {
                        if (task.running) {
                            promises.push(new Promise((res, rej) => {
                                task.abortVerificationIfRunning().then(() => { res(true) });
                            }));
                        }
                    });
                    if (promises.length > 0) {
                        Log.log("Stop all running verificationTasks", LogLevel.Debug)
                    }
                    Promise.all(promises).then(() => {
                        resolve(true);
                    })
                } else {
                    //nothing to stop
                    resolve(true);
                }
            } catch (e) {
                Log.error("Error stopping all running verifications: " + e);
                reject();
            }
        });
    }
}