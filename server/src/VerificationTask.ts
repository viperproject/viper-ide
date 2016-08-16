'use strict';

import child_process = require('child_process');
import {IConnection, Diagnostic, DiagnosticSeverity, } from 'vscode-languageserver';
import {Settings} from './Settings'
import {StepInfo, StateColors, MethodBorder, Position, HeapGraph, Backend, ViperSettings, Commands, VerificationState, LogLevel, Success} from './ViperProtocol'
import {Log} from './Log';
import {NailgunService} from './NailgunService';
import {Statement, StatementType} from './Statement';
import {Model} from './Model';
import * as pathHelper from 'path';
import {HeapVisualizer} from './HeapVisualizer';
import {TotalProgress} from './TotalProgress';
import {Server} from './ServerClass';
import {DebugServer} from './DebugServer';

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
    //isFromMethod: boolean = false;

    //verification results
    time: number = 0;
    diagnostics: Diagnostic[];
    steps: Statement[];
    model: Model = new Model();
    lastSuccess: Success = Success.None;
    parsingCompleted: boolean = false;
    typeCheckingCompleted: boolean = false;
    methodBorders: MethodBorder[];
    methodBordersOrderedByStart = [];

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
            state: index,
            fileName: this.filename,
            fileUri: this.fileUri,
            position: step.position,
            stateInfos: (this.steps[index].isErrorState ? "Error State -> use the Counter Example\n" : "") + step.pretty(),
            methodName: this.methodBorders[step.methodIndex].methodName,
            methodType: this.methodBorders[step.methodIndex].methodType,
            methodOffset: this.methodBorders[step.methodIndex].firstStateIndex - 1,
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
                while (!allBordersPrinted && i === this.methodBorders[this.methodBordersOrderedByStart[methodIndex + 1].index].firstStateIndex) {
                    methodIndex++;
                    if (methodIndex + 1 >= this.methodBorders.length)
                        allBordersPrinted = true;
                    currentMethod = this.methodBorders[this.methodBordersOrderedByStart[methodIndex].index];
                    res += "\n" + currentMethod.methodType + " " + currentMethod.methodName;
                    currentMethodOffset = i - 1;
                }
                res += `\n\t${i - currentMethodOffset} (${i}) ${"\t".repeat(element.depthLevel())} ${element.firstLine()}`;
            });
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

    public getDecorationOptions() {
        try {
            let decorationOptions = [];
            let line = 0;
            let optionsInLine = -1;
            //working variables
            let stepInfo: StepInfo[] = [];
            this.stateIndicesOrderedByPosition.forEach(idx => {
                let step = this.steps[idx.index];
                if (step.position.line === line) {
                    optionsInLine++;
                } else {
                    line = step.position.line;
                    optionsInLine = 0;
                }
                decorationOptions.push({
                    hoverMessage: step.toToolTip(),
                    range: {
                        start: { line: step.position.line, character: step.position.character + optionsInLine + 1 },
                        end: { line: step.position.line, character: step.position.character + optionsInLine + 2 }
                    },
                    renderOptions: {
                        before: {
                            contentText: "(" + (step.index + 1) + ")",
                            color: step.isErrorState ? StateColors.errorState : StateColors.interestingState,
                        }
                    },
                    states: [step.index],
                });
                stepInfo[step.index] = { originalPosition: step.position, depth: step.depthLevel(), methodIndex: step.methodIndex, index: decorationOptions.length, isErrorState: step.isErrorState }
            });
            return {
                decorationOptions: decorationOptions,
                stepInfo: stepInfo,
                methodBorders: this.methodBorders,
                globalInfo: this.prettySteps() + "\n" + this.model.pretty(),
                uri: this.fileUri
            };
        } catch (e) {
            Log.error("Runtime Error in getGecorationOptions: " + e)
        }
    }

    verify(onlyTypeCheck: boolean, manuallyTriggered: boolean): boolean {
        if (!manuallyTriggered && this.lastSuccess == Success.Error) {
            Log.log("After an internal error, reverification has to be triggered manually.", LogLevel.Info);
            return false;
        }
        //Initialization
        this.manuallyTriggered = manuallyTriggered;
        this.running = true;
        this.aborting = false;
        this.state = VerificationState.Stopped;
        this.resetDiagnostics();
        this.wrongFormat = false;
        this.steps = [];
        this.lines = [];
        this.methodBorders = [];
        this.model = new Model();
        this.parsingCompleted = true;
        this.typeCheckingCompleted = true;
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
            this.verifierProcess = this.nailgunService.startVerificationProcess(path, true, onlyTypeCheck, Server.backend);
            //subscribe handlers
            this.verifierProcess.stdout.on('data', this.stdOutHandler.bind(this));
            this.verifierProcess.stderr.on('data', this.stdErrHadler.bind(this));
            this.verifierProcess.on('close', this.verificationCompletionHandler.bind(this));
            this.verifierProcess.on('exit', (code, msg) => {
                Log.log("verifierProcess onExit: " + code + " and " + msg, LogLevel.Debug);
            });
        });
        return true;
    }

    resetDiagnostics() {
        this.diagnostics = [];
        VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
    }

    private verificationCompletionHandler(code) {
        try {
            Log.log(`Child process exited with code ${code}`, LogLevel.Debug);
            if (this.aborting) return;

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

            //complete the information about the method borders.
            //this can only be done at the end of the verification
            this.completeVerificationState();

            // Send the computed diagnostics to VSCode.
            VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });

            let success: Success = Success.None;

            if (this.diagnostics.length == 0 && code == 0) {
                success = Success.Success;
            } else if (this.diagnostics.length > 0) {
                //use tag and backend trace as indicators for completed parsing
                if (!this.parsingCompleted && this.steps.length == 0) {
                    success = Success.ParsingFailed;
                } else if (this.parsingCompleted && !this.typeCheckingCompleted) {
                    success = Success.TypecheckingFailed;
                } else {
                    success = Success.VerificationFailed;
                }
            } else {
                success = this.aborting ? Success.Aborted : Success.Error;
            }

            this.lastSuccess = success;

            VerificationTask.connection.sendNotification(Commands.StateChange,
                {
                    newState: VerificationState.Ready,
                    success: success,
                    manuallyTriggered: this.manuallyTriggered,
                    filename: this.filename,
                    nofErrors: this.diagnostics.length,
                    time: this.time,
                    verificationCompleted: true,
                    uri: this.fileUri
                });
            this.time = 0;
            this.running = false;

            Log.log("Number of Steps: " + this.steps.length, LogLevel.Info);

            //pass decorations to language client
            Log.log("get params for updating the decoration options", LogLevel.Debug);
            let params = { uri: this.fileUri, decorations: this.getDecorationOptions() }
            //Log.log(JSON.stringify(params),LogLevel.Debug);
            Log.log("Update the decoration options (" + params.decorations.decorationOptions.length + ")", LogLevel.Debug);
            VerificationTask.connection.sendNotification(Commands.StepsAsDecorationOptions, params);
            Log.log("decoration options update done", LogLevel.Debug);
            /*
            Log.log("Print out low Level Debug info",LogLevel.Debug);
            this.steps.forEach((step) => {
                Log.toLogFile(step.pretty(), LogLevel.LowLevelDebug);
            });
            Log.toLogFile("Model: " + this.model.pretty(), LogLevel.LowLevelDebug);
            */
        } catch (e) {
            Log.error("Error handling verification completion: " + e);
        }
    }

    private stdErrHadler(data) {
        data = data.trim();
        if (data.length == 0) return;

        if (data.startsWith("at ")) {
            Log.toLogFile(data, LogLevel.LowLevelDebug);
            return;
        }
        if (data.startsWith("connect: No error")) {
            Log.hint("No Nailgun server is running on port " + this.nailgunService.settings.nailgunPort);
        }
        else if (data.startsWith("java.lang.NullPointerException")) {
            Log.error("A nullpointer exception happened in the verification backend.", LogLevel.Default);
        }
        else if (data.startsWith("java.lang.ClassNotFoundException:")) {
            Log.error("Class " + Server.backend.mainMethod + " is unknown to Nailgun\nFix the backend settings for " + Server.backend.name, LogLevel.Default);
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
    }

    private stdOutHandler(data: string) {
        if (data.trim().length == 0) {
            return;
        }
        Log.toLogFile(`[${Server.backend.name}: stdout raw]: ${data}`, LogLevel.LowLevelDebug);

        if (this.aborting) return;
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
                this.time = Number.parseFloat(/.*?(\d*\.\d*).*/.exec(line)[1]);
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
                    this.time = Number.parseFloat(/.*?(\d*\.\d*).*/.exec(line)[1]);
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
                    if (this.methodBorders.length > 0) {
                        this.methodBorders[this.methodBorders.length - 1].lastStateIndex = this.steps.length - 1;
                    }

                    let nameParts = line.replace(/-/g, "").trim().split(" ");

                    this.methodBorders.push({ name: line, methodName: nameParts[1], methodType: nameParts[0].toLowerCase(), firstStateIndex: this.steps.length, lastStateIndex: -1, start: -1, end: -1 });

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
                            this.steps.push(new Statement(this.lines[0], this.lines[2], this.lines[3], this.lines[4], this.lines[5], this.model, this.steps.length, this.methodBorders.length - 1));
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
                    if (pos.length != 4) {
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

    //TODO: might be source of bugs, if methods don't contain a state
    private completeVerificationState() {
        this.methodBordersOrderedByStart = [];
        this.methodBorders.forEach((element, i) => {
            //firstStateInfo can point to non existing state, e.g. if there is no state in a method
            if (element.firstStateIndex < this.steps.length) {
                element.start = this.steps[element.firstStateIndex].position.line;
            } else {
                element.start = Number.MAX_SAFE_INTEGER;
            }
            if (element.lastStateIndex < 0) {
                element.lastStateIndex = this.steps.length - 1;
            }
            //element.end = this.steps[element.lastStateIndex].position.line;
            this.methodBordersOrderedByStart.push({ start: element.start, index: i });
        });

        this.methodBordersOrderedByStart.sort((a: MethodBorder, b: MethodBorder) => { return a.start == b.start ? 0 : (a.start < b.start ? -1 : 1) });
        this.methodBordersOrderedByStart.forEach((element, i) => {
            let border = this.methodBorders[element.index];
            border.end = element.index < this.methodBorders.length - 1 ? this.methodBorders[element.index + 1].start - 1 : Number.MAX_VALUE;
        });

        this.stateIndicesOrderedByPosition = [];

        let depth = -1;
        let methodStack = [];
        let lastElement;
        let methodIndex = -1;
        this.steps.forEach((element, i) => {
            while (methodIndex + 1 < this.methodBorders.length && i === this.methodBorders[this.methodBordersOrderedByStart[methodIndex + 1].index].firstStateIndex) {
                methodIndex++;
            }

            element.methodIndex = this.methodBordersOrderedByStart[methodIndex].index;
            //determine depth
            let methodContainingCurrentStep: number = this.getMethodContainingCurrentStep(element);
            if (depth === -1 || element.index === this.methodBorders[element.methodIndex].firstStateIndex) {
                // the depth of the first state in a method is 0
                depth = 0;
                methodStack[depth] = methodContainingCurrentStep;
            } else {
                if (methodStack[depth] === methodContainingCurrentStep) {
                    //stay on same depth
                } else if (depth > 0 && methodStack[depth - 1] === methodContainingCurrentStep) {
                    depth--;
                } else {
                    methodStack[++depth] = methodContainingCurrentStep;
                }
            }
            element.depth = depth + (lastElement && this.comparePosition(element.position, lastElement.position) == 0 ? 1 : 0);

            this.stateIndicesOrderedByPosition.push({ index: element.index, position: element.position });
            //determine if the state is an error state
            for (let j = 0; j < this.diagnostics.length; j++) {
                let diagnostic = this.diagnostics[j];
                if (this.comparePosition(diagnostic.range.start, element.position) == 0) {
                    element.isErrorState = true;
                    element.fillInConcreteValues(this.model);
                    break;
                }
            }
            lastElement = element;
        });
        this.stateIndicesOrderedByPosition.sort(this.comparePositionAndIndex);
    }

    //-1 means in no method
    private getMethodContainingCurrentStep(step: Statement): number {
        //TODO: is this a good idea? assuming that the 
        if (step.position.line == 0 && step.position.character == 0) {
            return step.methodIndex;
        }
        for (let i = 0; i < this.methodBordersOrderedByStart.length; i++) {
            let border = this.methodBorders[this.methodBordersOrderedByStart[i].index];
            if (step.position.line >= border.start && step.position.line <= border.end) {
                return this.methodBordersOrderedByStart[i].index;
            }
        }
        Log.log("step " + step.index + " is in no method (using define can cause this)", LogLevel.Debug);
        return -1;
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