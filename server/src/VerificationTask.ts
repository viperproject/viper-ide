'use strict';

import child_process = require('child_process');
import {IConnection, Diagnostic, DiagnosticSeverity, } from 'vscode-languageserver';
import {Settings} from './Settings'
import {UpdateStatusBarParams, MyProtocolDecorationOptions, StepsAsDecorationOptionsResult, StatementType, StepInfo, StateColors, MethodBorder, Position, HeapGraph, Backend, ViperSettings, Commands, VerificationState, LogLevel, Success} from './ViperProtocol'
import {Log} from './Log';
import {NailgunService} from './NailgunService';
import {Statement} from './Statement';
import {Model} from './Model';
import * as pathHelper from 'path';
import {HeapVisualizer} from './HeapVisualizer';
import {TotalProgress} from './TotalProgress';
import {Server} from './ServerClass';
import {DebugServer} from './DebugServer';
import * as fs from 'fs';
import {Verifiable} from './Verifiable';

export interface RawSymbExLogEntry {
    value: string,
    type?: string,
    kind?: string,
    open: boolean,
    pos?: string,
    prestate?: { store: string[], heap: string[], oldHeap: string[], pcs: string[] },
    children?: RawSymbExLogEntry[];
}

export class VerificationTask {
    //state
    running: boolean = false;
    aborting: boolean = false;
    manuallyTriggered: boolean;
    state: VerificationState = VerificationState.Stopped;
    verifierProcess: child_process.ChildProcess;
    nailgunService: NailgunService;
    static connection: IConnection;

    //file under verification
    fileUri: string;
    filename: string;
    path: string;

    //working variables
    private lines: string[] = [];
    private wrongFormat: boolean = false;
    private partialData: string = "";
    private linesToSkip: number = 0;
    private inSymbExLoggerHierarchy: boolean = false;
    //isFromMethod: boolean = false;

    //verification results
    time: number = 0;
    diagnostics: Diagnostic[];
    steps: Statement[];
    verifiables: Verifiable[];
    model: Model = new Model();
    lastSuccess: Success = Success.None;
    parsingCompleted: boolean = false;
    typeCheckingCompleted: boolean = false;
    //methodBorders: MethodBorder[];
    //methodBordersOrderedByStart = [];
    clientStepIndexToServerStep: Statement[];
    //symbExLog: SymbExLogEntry[] = [];

    completeSymbExLog: RawSymbExLogEntry[] = [];

    stateIndicesOrderedByPosition: { index: number, position: Position }[];

    constructor(fileUri: string, nailgunService: NailgunService, connection: IConnection) {
        this.fileUri = fileUri;
        this.nailgunService = nailgunService;
        VerificationTask.connection = connection;
    }

    public getHeapGraphDescription(index: number): HeapGraph {
        if (!this.steps) {
            Log.error("Cannot show heap: no steps avaliable, a reverification is needed.");
        }
        if (index < 0 || index >= this.steps.length) {
            Log.error("Cannot show heap at step " + index + " only states 0 - " + (this.steps.length - 1) + " are valid");
            return;
        }
        let step = this.steps[index];
        if (!step) {
            Log.error("Cannot show heap at step " + index + " step is null");
            return;
        }

        //inform debug server about selected State
        DebugServer.moveDebuggerToPos(step.position, step.index);

        return {
            heap: HeapVisualizer.heapToDot(step, step.isErrorState || this.nailgunService.settings.showSymbolicState, step.isErrorState, this.model),
            state: step.decorationOptions.index,
            fileName: this.filename,
            fileUri: this.fileUri,
            position: step.position,
            stateInfos: (this.steps[index].isErrorState ? "Error State -> use the Counter Example\n" : "") + step.pretty(),
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
            let stepInfo: StepInfo[] = [];
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
            return {
                decorationOptions: decorationOptions,
                globalInfo: this.prettySteps() + "\n" + this.model.pretty(),
                uri: this.fileUri
            }
        } catch (e) {
            Log.error("Error getting decoration options: " + e)
        }
    }

    verify(manuallyTriggered: boolean): boolean {
        if (!manuallyTriggered && this.lastSuccess == Success.Error) {
            Log.log("After an internal error, reverification has to be triggered manually.", LogLevel.Info);
            return false;
        }
        //Initialization
        this.manuallyTriggered = manuallyTriggered;
        this.running = true;
        Server.executedStages.push(Settings.getVerifyStage(Server.backend));
        this.aborting = false;
        this.state = VerificationState.Stopped;
        this.resetDiagnostics();
        this.wrongFormat = false;
        this.steps = [];
        this.lines = [];
        this.clientStepIndexToServerStep = [];
        this.model = new Model();
        this.parsingCompleted = true;
        this.typeCheckingCompleted = true;
        this.inSymbExLoggerHierarchy = false;
        if (this.partialData.length > 0) {
            Log.error("Some unparsed output was detected:\n" + this.partialData);
            this.partialData = "";
        }
        if (this.linesToSkip != 0) {
            Log.error("missed lines to skip: " + this.linesToSkip);
            this.linesToSkip = 0;
        }

        Log.log(Server.backend.name + ' verification started', LogLevel.Info);

        VerificationTask.connection.sendNotification(Commands.StateChange, { newState: VerificationState.VerificationRunning });

        VerificationTask.uriToPath(this.fileUri).then((path) => {
            //Request the debugger to terminate it's session
            DebugServer.stopDebugging();
            //start verification of current file
            this.path = path
            this.filename = pathHelper.basename(path);
            let stage = Settings.getVerifyStage(Server.backend);
            if (!stage) {
                Log.error("backend " + Server.backend.name + " has no " + Settings.VERIFY + " stage, even though the settigns were checked.");
                return false;
            }
            this.verifierProcess = this.nailgunService.startStageProcess(path, stage, this.stdOutHandler.bind(this), this.stdErrHadler.bind(this), this.completionHandler.bind(this));
        });
        return true;
    }

    resetDiagnostics() {
        this.diagnostics = [];
        VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
    }

    private completionHandler(code) {
        try {
            Log.log(`Child process exited with code ${code}`, LogLevel.Debug);
            if (this.aborting) {
                this.running = false;
                return;
            }
            let success;

            let verifyingStage = Server.stage().type === Settings.VERIFY;

            if (verifyingStage) {
                if (code != 0 && code != 1 && code != 899) {
                    Log.log("Verification Backend Terminated Abnormaly: with code " + code, LogLevel.Default);
                    if (Settings.isWin && code == null) {
                        this.nailgunService.killNgDeamon();
                        this.nailgunService.restartNailgunServer(VerificationTask.connection, Server.backend);
                    }
                }

                if (this.partialData.length > 0) {
                    Log.error("Some unparsed output was detected:\n" + this.partialData);
                    this.partialData = "";
                }
                success = this.determineSuccess(code);
            }

            //do we need to start onError tasks?
            if (!this.aborting && (!verifyingStage || success == Success.VerificationFailed)) {
                let lastStage = Server.stage();
                if (lastStage.onError && lastStage.onError.length > 0) {
                    if (!Server.executedStages.some(stage => stage.type === lastStage.type)) {
                        let newStage = Settings.getStage(Server.backend, lastStage.onError);
                        if (newStage.type == Settings.VERIFY) {
                            Log.log("Restart verifiacation after stage "+ lastStage.type,LogLevel.Info)
                            this.verify(this.manuallyTriggered);
                        } else {
                            Log.log("Start stage "+ lastStage.type +" after failed verification",LogLevel.Info);
                            Server.nailgunService.startStageProcess(this.filename, newStage, this.stdOutHandler.bind(this), this.stdErrHadler.bind(this), this.completionHandler.bind(this));
                        }
                        return;
                    }
                }
            }

            if (verifyingStage) {
                // Send the computed diagnostics to VSCode.
                VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });

                //inform client about postProcessing
                VerificationTask.connection.sendNotification(Commands.StateChange, {
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
                    //Log.log(JSON.stringify(params),LogLevel.Debug);
                    Log.log("Update the decoration options (" + decorations.decorationOptions.length + ")", LogLevel.Debug);
                    VerificationTask.connection.sendNotification(Commands.StepsAsDecorationOptions, decorations);
                    //Log.log("decoration options update done", LogLevel.Debug);
                }

                let stateChangeParams: UpdateStatusBarParams = {
                    newState: VerificationState.Ready,
                    success: success,
                    manuallyTriggered: this.manuallyTriggered,
                    filename: this.filename,
                    nofErrors: this.diagnostics.length,
                    time: this.time,
                    verificationCompleted: true,
                    uri: this.fileUri
                };
                VerificationTask.connection.sendNotification(Commands.StateChange, stateChangeParams);
                /*
                Log.log("Print out low Level Debug info",LogLevel.Debug);
                this.steps.forEach((step) => {
                    Log.toLogFile(step.pretty(), LogLevel.LowLevelDebug);
                });
                Log.toLogFile("Model: " + this.model.pretty(), LogLevel.LowLevelDebug);
                */
                this.lastSuccess = success;
            }
            //reset for next verification
            this.time = 0;
            this.running = false;
        } catch (e) {
            this.running = false;
            VerificationTask.connection.sendNotification(Commands.VerificationNotStarted, this.fileUri);
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
        data = data.trim();
        if (data.length == 0) return;

        //hide stacktraces
        if (data.startsWith("at ")) {
            Log.toLogFile(data, LogLevel.LowLevelDebug);
            return;
        }

        let stage = Server.stage();
        if (stage.type === Settings.VERIFY) {
            if (data.startsWith("connect: No error")) {
                Log.hint("No Nailgun server is running on port " + this.nailgunService.settings.nailgunPort);
            }
            else if (data.startsWith("java.lang.NullPointerException")) {
                Log.error("A nullpointer exception happened in the verification backend.", LogLevel.Default);
            }
            else if (data.startsWith("java.lang.ClassNotFoundException:")) {
                Log.error("Class " + Server.stage().mainMethod + " is unknown to Nailgun\nFix the backend settings for " + Server.backend.name, LogLevel.Default);
            }
            else if (data.startsWith("java.io.IOException: Stream closed")) {
                Log.error("A concurrency error occured, try again.", LogLevel.Default);
            }
            else if (data.startsWith("java.lang.StackOverflowError")) {
                Log.error("StackOverflowError in verification backend", LogLevel.Default);
            }
            else if (data.startsWith("SLF4J: Class path contains multiple SLF4J bindings")) {
                Log.error(Server.backend.name + " is referencing two versions of the backend, fix its paths in the settings", LogLevel.Default);
            } else {
                Log.error("Unknown backend error message: " + data, LogLevel.Debug);
            }
        } else {
            Log.error("Backend error message: " + stage.type + " " + data, LogLevel.Debug);
        }
    }

    private stdOutHandler(data: string) {
        if (data.trim().length == 0) {
            return;
        }
        let stage = Server.stage();
        if (this.aborting) return;
        if (stage.type === Settings.VERIFY) {
            Log.toLogFile(`[${Server.backend.name}:${stage.type}: stdout raw]: ${data}`, LogLevel.LowLevelDebug);
            let parts = data.split(/\r?\n/g);
            parts[0] = this.partialData + parts[0];
            for (var i = 0; i < parts.length; i++) {
                let line = parts[i];

                //handle start and end of verification
                if (line.startsWith('Silicon started') || line.startsWith('carbon started')) {
                    Log.log("State -> Verification Running", LogLevel.Info);
                    this.state = VerificationState.VerificationRunning;
                }
                else if (line.startsWith('Silicon finished in') || line.startsWith('carbon finished in')) {
                    Log.log("State -> Error Reporting", LogLevel.Info);
                    this.state = VerificationState.VerificationReporting;
                    this.time = this.extractNumber(line);
                }
                //handle other verification outputs and results
                else if (line.trim().length > 0) {
                    if (i < parts.length - 1 || (this.state != VerificationState.VerificationRunning)) {
                        //only in VerificationRunning state, the lines are nicley split by newLine characters
                        //therefore, the partialData construct is only enabled during the verification;
                        //Log.toLogFile(`[${Server.backend.name}: stdout]: ${line}`, LogLevel.LowLevelDebug);
                        let linesToSkip = this.handleBackendOutputLine(line); {
                            if (linesToSkip < 0) {
                                return;
                            } else if (linesToSkip > 0) {
                                this.linesToSkip = linesToSkip;
                            }
                        }
                    }
                }
            }
            if (this.state == VerificationState.VerificationRunning) {
                this.partialData = parts[parts.length - 1];
            }
        } else {
            Log.log(`${Server.backend.name}:${stage.type}: ${data}`, LogLevel.Debug);
        }
    }

    private handleBackendOutputLine(line: string): number {
        if (this.linesToSkip - 1 > 0) {
            this.linesToSkip--;
            return;
        }
        switch (this.state) {
            case VerificationState.Stopped:
                if (line.startsWith("Command-line interface:")) {
                    Log.error('Could not start verification -> fix customArguments for backend', LogLevel.Default);
                    this.state = VerificationState.VerificationPrintingHelp;
                }
                break;
            case VerificationState.VerificationRunning:
                line = line.trim();
                if (line.startsWith("{\"") && line.endsWith("}")) {
                    try {
                        let progress = new TotalProgress(JSON.parse(line));
                        Log.log("Progress: " + progress.toPercent(), LogLevel.Info);
                        VerificationTask.connection.sendNotification(Commands.StateChange, { newState: VerificationState.VerificationRunning, progress: progress.toPercent(), filename: this.filename })
                    } catch (e) {
                        Log.error("Error reading progress: " + e);
                    }
                }
                else if (line.startsWith('Silicon finished in') || line.startsWith('carbon finished in')) {
                    Log.log("WARNING: analyze the reason for this code to be executed", LogLevel.Debug);
                    this.state = VerificationState.VerificationReporting;
                    this.time = this.extractNumber(line);
                } else if (line.startsWith("\"")) {
                    // let moreThanOne = false;
                    // while (line.startsWith("\"") && line.indexOf("\"", 1) > 0 && line.indexOf("\"", 1) != line.lastIndexOf("\"")) {
                    //     //we have multiple objects in this line -> split them
                    //     moreThanOne = true;
                    //     this.handleBackendOutputLine(line.substring(0, line.indexOf("\"", 1) + 1));
                    //     line = line.substring(line.indexOf("\"", 1) + 1, line.length);
                    // }
                    // if (moreThanOne) {
                    //     this.handleBackendOutputLine(line);
                    // } else {
                    this.model.extendModel(line);
                    // }
                    //Log.toLogFile("Model: " + line);
                } else if (line.startsWith("---------- FUNCTION") || line.startsWith("---------- PREDICATE") || line.startsWith("---------- METHOD")) {
                    /*if (this.methodBorders.length > 0) {
                        this.methodBorders[this.methodBorders.length - 1].lastStateIndex = this.steps.length - 1;
                    }

                    let nameParts = line.replace(/-/g, "").trim().split(" ");

                    this.methodBorders.push({ name: line, methodName: nameParts[1], methodType: nameParts[0].toLowerCase(), firstStateIndex: this.steps.length, lastStateIndex: -1, start: -1, end: -1 });
                    */
                    // if (line.startsWith("---------- METHOD ")) {
                    //     //this.isFromMethod = true;
                    // } else {
                    //     //this.isFromMethod = false;
                    //     //TODO: handle method predicate or function mention if needed
                    // }
                    return 0;
                } else if (line.startsWith("-----")) {

                }
                else if (line.startsWith("h = ") || line.startsWith("hLHS = ")) {
                    //TODO: handle if needed
                    return 0;
                }
                else if (line.startsWith("hR = ")) {
                    Log.log("skip the next 3 lines", LogLevel.Info);
                    return 3;
                    //i = i + 3;
                }
                else if (line.startsWith('PRODUCE') || line.startsWith('CONSUME') || line.startsWith('EVAL') || line.startsWith('EXECUTE')) {
                    if (this.lines.length > 0) {
                        let msg = "Warning: Ignore " + this.lines.length + " line(s):";
                        this.lines.forEach((line) => {
                            msg = msg + "\n\t" + line;
                        });
                        Log.error(msg);
                        Log.log("Next line: " + line, LogLevel.Debug);
                    }
                    this.lines = [];
                    this.lines.push(line);
                }
                else {
                    if (line.trim() == ')') {
                        if (this.lines.length != 6) {
                            Log.error("error reading verification trace. Unexpected format.");
                            let msg = "Warning: Ignore " + this.lines.length + " line(s):";
                            this.lines.forEach((line) => {
                                msg = msg + "\n\t" + line;
                            });
                            Log.error(msg);
                            this.lines = [];
                        } else {
                            //this.steps.push(Statement.CreateFromTrace(this.lines[0], this.lines[2], this.lines[3], this.lines[4], this.lines[5], this.model, this.steps.length, this.methodBorders.length - 1));
                            this.lines = [];
                        }
                    }
                    else {
                        this.lines.push(line);
                    }
                }
                break;
            case VerificationState.VerificationReporting:
                if (line == 'No errors found.') {
                }
                else if (line.startsWith('The following errors were found')) {
                }
                else if (line.startsWith('  ')) {
                    let pos = /\s*(\d+):(\d+):\s(.*)/.exec(line);
                    if (!pos || pos.length != 4) {
                        Log.error('could not parse error description: "' + line + '"');
                        return 0;
                    }
                    let lineNr = +pos[1] - 1;
                    let charNr = +pos[2] - 1;
                    let message = pos[3].trim();

                    //for Marktoberdorf
                    let tag: string;
                    if (line.indexOf("[") >= 0 && line.indexOf("]") >= 0) {
                        tag = line.substring(line.indexOf("[") + 1, line.indexOf("]"));
                        if (tag == "typechecker.error") {
                            this.typeCheckingCompleted = false;
                        }
                        else if (tag == "parser.error") {
                            this.parsingCompleted = false;
                            this.typeCheckingCompleted = false;
                        }
                    }

                    Log.log(`Error: [${Server.backend.name}] ${tag ? "[" + tag + "] " : ""}${lineNr + 1}:${charNr + 1} ${message}`, LogLevel.Default);
                    this.diagnostics.push({
                        range: {
                            start: { line: lineNr, character: charNr },
                            end: { line: lineNr, character: 10000 }//Number.max does not work -> 10000 is an arbitrary large number that does the job
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

    private extractNumber(s: string): number {
        let regex = /^.*?(\d+)([\.,](\d+))?.*$/.exec(s);
        if (regex && regex[1] && regex[3]) {
            return Number.parseFloat(regex[1] + "." + regex[3]);
        } else if (regex && regex[1]) {
            return Number.parseInt(regex[1]);
        }
        Log.error("Error extracting number from \"" + s + "\"");
        return 0;
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
                this.completeSymbExLog = <RawSymbExLogEntry[]>JSON.parse(content);
                Log.log("Execution tree successfully loaded: " + this.completeSymbExLog.length + " toplevel construct" + (this.completeSymbExLog.length == 1 ? "" : "s") + " found", LogLevel.Info);
                //parse SymbexLog
                this.steps = [];
                this.verifiables = [];
                this.completeSymbExLog.forEach(data => {
                    let index = this.verifiables.length;
                    this.verifiables.push(new Verifiable(index, data, this))
                });

            } else {
                Log.log("No executionTreeData.js found");
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
            VerificationTask.connection.sendRequest(Commands.UriToPath, uri).then((path) => {
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
            VerificationTask.connection.sendRequest(Commands.PathToUri, path).then((uri) => {
                return resolve(uri);
            });
        });
    }
}