'use strict';

import child_process = require('child_process');
import {Diagnostic, DiagnosticSeverity, } from 'vscode-languageserver';
import {Settings} from './Settings'
import {BackendOutput, BackendOutputType, Error, SymbExLogEntry, Stage, StateChangeParams, MyProtocolDecorationOptions, StepsAsDecorationOptionsResult, StatementType, StateColors, Position, HeapGraph, Backend, ViperSettings, Commands, VerificationState, LogLevel, Success} from './ViperProtocol'
import {Log} from './Log';
import {NailgunService} from './NailgunService';
import {Statement} from './Statement';
import {Model} from './Model';
import * as pathHelper from 'path';
import {HeapVisualizer} from './HeapVisualizer';
import {Progress} from './TotalProgress';
import {Server} from './ServerClass';
import {DebugServer} from './DebugServer';
import * as fs from 'fs';
import {Verifiable} from './Verifiable';

export class VerificationTask {
    //state that is valid across verifications
    nailgunService: NailgunService;
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
    diagnostics: Diagnostic[];
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

    constructor(fileUri: string, nailgunService: NailgunService) {
        this.fileUri = fileUri;
        this.nailgunService = nailgunService;
    }

    public getHeapGraphDescription(clientIndex: number): HeapGraph {
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

        return {
            heap: HeapVisualizer.heapToDot(step, step.isErrorState || this.nailgunService.settings.showSymbolicState, step.isErrorState, this.model),
            state: step.decorationOptions.index,
            fileName: this.filename,
            fileUri: this.fileUri,
            position: step.position,
            stateInfos: (this.steps[serverIndex].isErrorState ? "Error State -> use the Counter Example\n" : "") + step.pretty(),
            methodName: step.verifiable.name,
            methodType: step.verifiable.typeString(),
            methodOffset: step.verifiable.startIndex - 1,
            conditions: step.prettyConditions()
        };
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
            this.steps.forEach((element, i) => {

                let clientNumber = element.decorationOptions ? "" + element.decorationOptions.numberToDisplay : "";
                let serverNumber = "" + i;
                let spacesToPut = 8 - clientNumber.length - serverNumber.length;
                spacesToPut = spacesToPut < 0 ? 0 : spacesToPut;
                res += `\n\t${clientNumber} ${"\t".repeat(spacesToPut)}(${serverNumber})|${"\t".repeat(element.depthLevel())} ${element.firstLine()}`;
            });
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
                    let options: MyProtocolDecorationOptions = {
                        hoverMessage: step.toToolTip(),
                        range: {
                            start: { line: step.position.line, character: 0 },
                            end: { line: step.position.line, character: 0 }
                        },
                        renderOptions: {
                            before: {
                                contentText: "(" + (decorationOptions.length + 1) + ")",
                                color: step.isErrorState ? StateColors.errorState(this.nailgunService.settings.darkGraphs) : StateColors.interestingState(this.nailgunService.settings.darkGraphs),
                            }
                        },
                        index: decorationOptions.length,
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
                    //let step = this.steps[idx.index];
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
        // if (!manuallyTriggered && this.lastSuccess == Success.Error) {
        //     Log.log("After an internal error, reverification has to be triggered manually.", LogLevel.Info);
        //     this.lastSuccess = Success.None;
        //     return false;
        // }
        //Initialization
        this.prepareVerification();
        this.manuallyTriggered = manuallyTriggered;
        let stage = Server.backend.stages[0];
        if (!stage) {
            Log.error("backend " + Server.backend.name + " has no " + Settings.VERIFY + " stage, even though the settigns were checked.");
            return false;
        }

        Log.log("verify " + pathHelper.basename(this.fileUri));

        Server.executedStages.push(stage);

        Log.log(Server.backend.name + ' verification started', LogLevel.Info);

        Server.sendStateChangeNotification({ newState: VerificationState.VerificationRunning });

        VerificationTask.uriToPath(this.fileUri).then((path) => {
            //Request the debugger to terminate it's session
            DebugServer.stopDebugging();
            //start verification of current file
            this.path = path
            this.filename = pathHelper.basename(path);
            this.verifierProcess = this.nailgunService.startStageProcess(path, stage, this.stdOutHandler.bind(this), this.stdErrHadler.bind(this), this.completionHandler.bind(this));
        });
        return true;
    }

    resetDiagnostics() {
        this.diagnostics = [];
        Server.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
    }

    resetLastSuccess() {
        this.lastSuccess = Success.None;
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

            //do we need to start onError tasks?
            if (!this.aborting) {
                let lastStage: Stage = Server.stage();
                let newStage: Stage;
                if (isVerifyingStage) {
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
                        Server.sendStateChangeNotification({ newState: VerificationState.Stage, stage: newStage.name, filename: this.filename })
                        if (newStage.isVerification) {
                            Log.log("Restart verifiacation after stage " + lastStage.name, LogLevel.Info)
                            this.verify(this.manuallyTriggered);
                        } else {
                            let successMessage = Success[isVerifyingStage ? success : Success.Success];
                            Log.log("Start stage " + newStage.name + " after stage " + lastStage.name + " success was: " + successMessage, LogLevel.Info);
                            Server.executedStages.push(newStage);
                            VerificationTask.uriToPath(this.fileUri).then((path) => {
                                Server.nailgunService.startStageProcess(path, newStage, this.stdOutHandler.bind(this), this.stdErrHadler.bind(this), this.completionHandler.bind(this));
                            });
                        }
                        return;
                    }
                }
            }

            if (isVerifyingStage) {
                if (this.partialData.length > 0) {
                    Log.error("Some unparsed output was detected:\n" + this.partialData);
                    this.partialData = "";
                }
                success = this.determineSuccess(code);

                // Send the computed diagnostics to VSCode.
                Server.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });

                //inform client about postProcessing
                Server.sendStateChangeNotification({
                    newState: VerificationState.PostProcessing,
                    filename: this.filename,
                });

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
                });
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
                });
            }

            //is there the need to restart nailgun?
            if (isVerifyingStage) {
                if (code != 0 && code != 1 && code != 899) {
                    Log.log("Verification Backend Terminated Abnormaly: with code " + code + " Restart the backend.", LogLevel.Debug);
                    if (Settings.isWin && code == null) {
                        this.nailgunService.killNgDeamon().then(resolve => {
                            this.nailgunService.startOrRestartNailgunServer(Server.backend,false);
                        });
                    }
                }
            }

            //reset for next verification
            this.lastSuccess = success;
            this.time = 0;
            this.running = false;
        } catch (e) {
            this.running = false;
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

    private stdErrHadler(data) {
        try {
            data = data.trim();
            if (data.length == 0) return;

            //hide scala/java stacktraces
            if (data.startsWith("at ")) {
                Log.toLogFile(data, LogLevel.LowLevelDebug);
                return;
            }
            //Log.error(data, LogLevel.Debug);
            this.internalErrorMessage = data;

            let stage = Server.stage();
            let message: string;
            let backendAndStage = "backend: " + Server.backend.name + " stage: " + Server.stage().name;
            if (data.startsWith("NailGun v")) {
                let hintMessage = "Wrong arguments for nailgun: Fix the customArguments in the settings of " + backendAndStage;
                Log.hint(hintMessage);
            }
            else if (data.startsWith("connect: No error")) {
                let hintMessage = "No Nailgun server is running on port " + this.nailgunService.settings.nailgunPort + ": is your nailgun correctly linked in the settings?";
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

    private stdOutHandler(data: string) {
        try {
            if (data.trim().length == 0) {
                return;
            }
            let stage = Server.stage();
            if (this.aborting) return;
            if (stage.isVerification) {
                Log.toLogFile(`[${Server.backend.name}: ${stage.name}: stdout]: ${data}`, LogLevel.LowLevelDebug);
                let parts = data.split(/\r?\n/g);
                parts[0] = this.partialData + parts[0];
                for (var i = 0; i < parts.length; i++) {
                    let line = parts[i];

                    if (line.length == 0) continue;

                    //json message
                    if (line.startsWith("{\"") && line.endsWith("}")) {
                        try {
                            let json: BackendOutput = JSON.parse(line);
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
                                    });
                                    break;
                                case BackendOutputType.FunctionVerified: case BackendOutputType.MethodVerified: case BackendOutputType.PredicateVerified:
                                    this.progress.updateProgress(json);
                                    let progressInPercent = this.progress.toPercent();
                                    Log.log("Progress: " + progressInPercent, LogLevel.Info);
                                    Server.sendStateChangeNotification({
                                        newState: VerificationState.VerificationRunning,
                                        progress: progressInPercent,
                                        filename: this.filename
                                    });
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
                                            severity: DiagnosticSeverity.Error,
                                            message: err.message
                                        });
                                    });
                                    break;
                                case BackendOutputType.End:
                                    this.state = VerificationState.VerificationReporting;
                                    this.time = Server.extractNumber(json.time);
                                    break;
                            }
                        } catch (e) {
                            Log.error("Error handling json message: " + e + " raw: " + line);
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
                        if (this.state != VerificationState.VerificationRunning)
                            Log.log("State -> Verification Running", LogLevel.Info);
                        this.state = VerificationState.VerificationRunning;
                        continue;
                    }
                    else if (line.startsWith('Silicon finished') || line.startsWith('carbon finished in')) {
                        Log.log("State -> Error Reporting", LogLevel.Info);
                        this.state = VerificationState.VerificationReporting;
                        this.time = Server.extractNumber(line);
                    }
                    //handle other verification outputs and results
                    else if (line.trim().length > 0) {
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
                if (line == 'No errors found.') {
                }
                else if (line.startsWith('The following errors were found')) {
                }
                else if (line.startsWith('  ')) {
                    let parsedPosition = Server.extractPosition(line);
                    let message = parsedPosition.after.length > 0 ? parsedPosition.after : parsedPosition.before;
                    //for Marktoberdorf
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

                    Log.log(`Error: [${Server.backend.name}] ${tag}${parsedPosition.pos.line + 1}:${parsedPosition.pos.character + 1} ${message}`, LogLevel.Default);
                    this.diagnostics.push({
                        range: {
                            start: parsedPosition.pos,
                            end: { line: parsedPosition.pos.line, character: 10000 }//Number.max does not work -> 10000 is an arbitrary large number that does the job
                        },
                        source: null, //Server.backend.name
                        severity: DiagnosticSeverity.Error,
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

    private completeVerificationState() {

        this.stateIndicesOrderedByPosition = [];
        let symbExLogIndex: number = 0;
        let lastMatchingLogIndex = -1;
        let methodIndex = -1;
        this.steps.forEach((element, i) => {
            if (element.canBeShownAsDecoration) {
                this.stateIndicesOrderedByPosition.push({ index: element.index, position: element.position });
                //determine if the state is an error state
            }
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

    public abortVerification() {
        if (!this.running) return;

        Log.log('Abort running verification', LogLevel.Info);
        this.aborting = true;

        //remove impact of child_process to kill
        this.verifierProcess.removeAllListeners('close');
        this.verifierProcess.stdout.removeAllListeners('data');
        this.verifierProcess.stderr.removeAllListeners('data');
        //log the exit of the child_process to kill
        this.verifierProcess.on('exit', (code, signal) => {
            Log.log(`Child process exited with code ${code} and signal ${signal}`, LogLevel.Debug);
        })
        this.verifierProcess.kill('SIGINT');
        let l = this.verifierProcess.listeners;
        this.verifierProcess = null;
        this.running = false;
        this.lastSuccess = Success.Aborted;
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

    private loadSymbExLogFromFile() {
        try {
            let symbExLogPath = pathHelper.join(Server.workspaceRoot, ".vscode", "executionTreeData.js");
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
                    this.verifiables.push(new Verifiable(index, data, this))
                });

            } else {
                Log.log("No executionTreeData.js found", LogLevel.Debug);
            }
        } catch (e) {
            Log.error("Error loading SymbExLog from file: " + e);
        }
    }

    //URI helper Methods
    public static uriToPath(uri: string): Thenable<string> {
        return new Promise((resolve, reject) => {
            //input check
            if (!uri.startsWith("file:")) {
                Log.error("cannot convert uri to filepath, uri: " + uri);
                return resolve(uri);
            }
            Server.uriToPath(uri).then((path) => {
                return resolve(path);
            });
        });
    }

    public static pathToUri(path: string): Thenable<string> {
        return new Promise((resolve, reject) => {
            //input check
            if (path.startsWith("file")) {
                Log.error("cannot convert path to uri, path: " + path);
                return resolve(path);
            }
            Server.pathToUri(path).then((uri) => {
                return resolve(uri);
            });
        });
    }
}