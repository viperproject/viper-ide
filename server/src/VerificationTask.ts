'use strict';

import child_process = require('child_process');
import {IConnection, Diagnostic, DiagnosticSeverity, } from 'vscode-languageserver';
import {Settings} from './Settings'
import {StateColors,MethodBorder, Position, HeapGraph, Backend, ViperSettings, Commands, VerificationState, LogLevel, Success} from './ViperProtocol'
import {Log} from './Log';
import {NailgunService} from './NailgunService';
import {Statement, StatementType} from './Statement';
import {Model} from './Model';
import * as pathHelper from 'path';
import {HeapVisualizer} from './HeapVisualizer';
import {TotalProgress} from './TotalProgress';
import {Server} from './server';

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
    lines: string[] = [];
    wrongFormat: boolean = false;
    isFromMethod: boolean = false;

    //verification results
    time: number = 0;
    diagnostics: Diagnostic[];
    steps: Statement[];
    model: Model = new Model();
    lastSuccess: Success = Success.None;
    parsingCompleted: boolean = false;
    typeCheckingCompleted: boolean = false;
    methodBorders: MethodBorder[];

    stateIndicesOrderedByPosition: { index: number, position: Position }[];

    constructor(fileUri: string, nailgunService: NailgunService, connection: IConnection) {
        this.fileUri = fileUri;
        this.nailgunService = nailgunService;
        VerificationTask.connection = connection;
    }

    public getHeapGraphDescription(index: number): HeapGraph {
        if (index < 0 || index >= this.steps.length) {
            Log.error("Cannot show heap at step " + index + " only states 0 - " + this.steps.length + " are valid");
            return;
        }
        let step = this.steps[index];
        if (!step) {
            Log.error("Cannot show heap at step " + index + " step is null");
            return;
        }
        return {
            heap: HeapVisualizer.heapToDot(step,step.isErrorState || this.nailgunService.settings.showSymbolicState),
            state: index,
            fileName: this.filename,
            fileUri: this.fileUri,
            position: step.position,
            stateInfos: (this.steps[index].isErrorState ? "Error State -> use the Counter Example\n" : "") + step.pretty() + this.prettySteps()
        };
    }

    private prettySteps(): string {
        let res: string = "";
        let methodIndex = 0;
        let maxLine = 0;
        let indent = "";

        let currentMethod;
        this.steps.forEach((element, i) => {
            if (i === this.methodBorders[methodIndex].firstStateIndex) {
                currentMethod = this.methodBorders[methodIndex];
                res += "\n" + currentMethod.methodName;
                if (methodIndex + 1 < this.methodBorders.length)
                    methodIndex++;
            }
            res += `\n\t${i}${"\t".repeat(element.depthLevel())} ${element.firstLine()}`;
        });
        return res;
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
        let result = [];
        //working variables
        let currDecoration = null;
        let prevStep = null;
        let label = "";
        let toolTip = "";
        let states = [];
        let stateIndexToDecorationIndex = [];
        let depths = [];
        let methodIndices = [];
        let stepInfo = [];
        this.stateIndicesOrderedByPosition.forEach(idx => {
            let step = this.steps[idx.index];
            if (!currDecoration || this.comparePosition(step.position, prevStep.position) != 0) {
                //we need a new decoration
                if (currDecoration) {
                    currDecoration.renderOptions.before.contentText = label + "⚫";
                    currDecoration.hoverMessage = toolTip;
                    currDecoration.states = states;
                    result.push(currDecoration);
                    label = "";
                    toolTip = "";
                    states = [];
                }
                currDecoration = {
                    hoverMessage: "",
                    range: {
                        start: step.position,
                        end: { line: step.position.line, character: step.position.character + 1 }
                    },
                    renderOptions: {
                        before: {
                            contentText: "",
                            color: step.isErrorState?StateColors.errorState:StateColors.interestingState,
                        }
                    },
                    states: []
                }
            }
            label += `,${step.index}`;
            toolTip += step.toToolTip() + "\n";
            states.push(step.index);
            prevStep = step;
            stepInfo[step.index] = { depth: step.depthLevel(), methodIndex: step.methodIndex, index: result.length, isErrorState: step.isErrorState }
        });

        //add the last decoration;
        if (currDecoration) {
            currDecoration.renderOptions.before.contentText = `(${label.substring(1,label.length)})⚫`;
            currDecoration.hoverMessage = toolTip;
            currDecoration.states = states;
            result.push(currDecoration);
        }
        return {
            decorationOptions: result,
            stepInfo: stepInfo,
            methodBorders: this.methodBorders,
        };
    }

    verify(onlyTypeCheck: boolean, manuallyTriggered: boolean): void {
        if (!manuallyTriggered && this.lastSuccess == Success.Error) {
            Log.log("After an internal error, reverification has to be triggered manually.", LogLevel.Info);
            return;
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

        Log.log(Server.backend.name + ' verification started', LogLevel.Info);

        VerificationTask.connection.sendNotification(Commands.StateChange, { newState: VerificationState.VerificationRunning, firstTime: false });

        VerificationTask.uriToPath(this.fileUri).then((path) => {
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
    }

    resetDiagnostics() {
        this.diagnostics = [];
        VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
    }

    private verificationCompletionHandler(code) {
        Log.log(`Child process exited with code ${code}`, LogLevel.Debug);
        if (this.aborting) return;

        if (code != 0 && code != 1 && code != 899) {
            Log.log("Verification Backend Terminated Abnormaly: with code " + code, LogLevel.Default);
            if (Settings.isWin && code == null) {
                this.nailgunService.killNgDeamon();
                this.nailgunService.restartNailgunServer(VerificationTask.connection, Server.backend);
            }
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
                firstTime: false
            });
        this.time = 0;
        this.running = false;

        Log.log("Number of Steps: " + this.steps.length, LogLevel.Info);
        //show last state

        VerificationTask.connection.sendNotification(Commands.StepsAsDecorationOptions, { uri: this.fileUri, decorations: this.getDecorationOptions() });

        //let allSteps = "";
        this.steps.forEach((step) => {
            Log.toLogFile(step.pretty(), LogLevel.LowLevelDebug);
            //allSteps  += "\n" +step.firstLine();
        });
        Log.toLogFile("Model: " + this.model.pretty(), LogLevel.LowLevelDebug);
        //Log.toLogFile("All Steps: " + allSteps,LogLevel.LowLevelDebug);
    }

    private stdErrHadler(data) {
        data = data.trim();
        if (data.length == 0) return;

        if (data.startsWith("at ")) {
            Log.toLogFile(data, LogLevel.LowLevelDebug);
            return;
        }
        Log.error(data, LogLevel.Debug);

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
        }
    }
    private stdOutHandler(data) {
        if (data.trim().length == 0) {
            return;
        }
        Log.toLogFile(`[${Server.backend.name}: stdout]: ${data}`, LogLevel.LowLevelDebug);

        if (this.aborting) return;

        let stringData: string = data;
        let parts = stringData.split(/\r?\n/g);
        for (var i = 0; i < parts.length; i++) {
            let part = parts[i];

            //skip empty lines
            if (part.trim().length > 0) {
                switch (this.state) {
                    case VerificationState.Stopped:
                        if (part.startsWith("Command-line interface:")) {
                            Log.error('Could not start verification -> fix customArguments for backend', LogLevel.Default);
                            this.state = VerificationState.VerificationPrintingHelp;
                        }
                        if (part.startsWith("(c) ") && part.indexOf("ETH") > 0) {
                            this.state = VerificationState.VerificationRunning;
                        }
                        break;
                    case VerificationState.VerificationRunning:
                        part = part.trim();
                        if (part.startsWith('Silicon finished in') || part.startsWith('carbon finished in')) {
                            this.state = VerificationState.VerificationReporting;
                            this.time = Number.parseFloat(/.*?(\d*\.\d*).*/.exec(part)[1]);
                        }
                        else if (part.startsWith('Silicon started') || part.startsWith('carbon started')) {
                        }
                        else if (part.startsWith("{\"") && part.endsWith("}")) {
                            try {
                                let progress = new TotalProgress(JSON.parse(part));
                                Log.log("Progress: " + progress.toPercent(), LogLevel.Info);
                                VerificationTask.connection.sendNotification(Commands.StateChange, { newState: VerificationState.VerificationRunning, progress: progress.toPercent(), filename: this.filename })
                            } catch (e) {
                                Log.error("Error reading progress: " + e);
                            }
                        } else if (part.startsWith("\"")) {
                            if (!part.endsWith("\"")) {
                                //TODO: it can also be that the model is split among multiple stdout pieces
                                while (i + 1 < parts.length && !part.endsWith("\"")) {
                                    part += parts[++i];
                                }
                            }
                            this.model.extendModel(part);
                            //Log.toLogFile("Model: " + part);
                        } else if (part.startsWith("----")) {
                            if (this.methodBorders.length > 0) {
                                this.methodBorders[this.methodBorders.length - 1].lastStateIndex = this.steps.length - 1;
                            }
                            this.methodBorders.push({ methodName: part, firstStateIndex: this.steps.length, lastStateIndex: -1, start: -1, end: -1 });
                            if (part.startsWith("---------- METHOD ")) {
                                this.isFromMethod = true;
                                continue;
                            } else {
                                this.isFromMethod = false;
                                //TODO: handle method predicate or function mention if needed
                                continue;
                            }
                        }
                        else if (part.startsWith("h = ") || part.startsWith("hLHS = ")) {
                            //TODO: handle if needed
                            continue;
                        }
                        else if (part.startsWith("hR = ")) {
                            i = i + 3;
                        }
                        else if (part.startsWith('PRODUCE') || part.startsWith('CONSUME') || part.startsWith('EVAL') || part.startsWith('EXECUTE')) {
                            if (this.lines.length > 0) {
                                let msg = "Warning: Ignore " + this.lines.length + " line(s):";
                                this.lines.forEach((line) => {
                                    msg = msg + "\n\t" + line;
                                });
                                Log.error(msg);
                                Log.log("Next line: " + part, LogLevel.Debug);
                            }
                            this.lines = [];
                            this.lines.push(part);
                        }
                        else {
                            if (part.trim() == ')') {
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
                                this.lines.push(part);
                            }
                        }
                        break;
                    case VerificationState.VerificationReporting:
                        if (part == 'No errors found.') {
                        }
                        else if (part.startsWith('The following errors were found')) {
                        }
                        else if (part.startsWith('  ')) {
                            let pos = /\s*(\d+):(\d+):\s(.*)/.exec(part);
                            if (pos.length != 4) {
                                Log.error('could not parse error description: "' + part + '"');
                                continue;
                            }
                            let lineNr = +pos[1] - 1;
                            let charNr = +pos[2] - 1;
                            let message = pos[3].trim();

                            //for Marktoberdorf
                            let tag: string;
                            if (part.indexOf("[") >= 0 && part.indexOf("]") >= 0) {
                                tag = part.substring(part.indexOf("[") + 1, part.indexOf("]"));
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
                            Log.error("Unexpected message during VerificationReporting: " + part);
                        }
                        break;
                    case VerificationState.VerificationPrintingHelp:
                        return;
                }
            }
        }
    }

    private completeVerificationState() {
        let methodBorderIndicesOrderedByStart = [];
        this.methodBorders.forEach((element,i) => {
            element.start = this.steps[element.firstStateIndex].position.line;
            if (element.lastStateIndex < 0) {
                element.lastStateIndex = this.steps.length - 1;
            }
            //element.end = this.steps[element.lastStateIndex].position.line;
            methodBorderIndicesOrderedByStart.push({start:element.start,index:i});
        });

        methodBorderIndicesOrderedByStart.sort((a:MethodBorder,b:MethodBorder)=>{return a.start == b.start?0:(a.start<b.start?-1:1)});
        methodBorderIndicesOrderedByStart.forEach((element,i) => {
            let border = this.methodBorders[element.index];
            border.end = element.index<this.methodBorders.length-1?this.methodBorders[element.index+1].start-1:Number.MAX_VALUE;
        });

        let methodIndex = 0;
        let maxLine = 0;
        let indent = "";

        let currentMethod;
        this.stateIndicesOrderedByPosition = [];
        this.steps.forEach((element, i) => {
            this.stateIndicesOrderedByPosition.push({ index: element.index, position: element.position });
            if (i === this.methodBorders[methodIndex].firstStateIndex) {
                currentMethod = this.methodBorders[methodIndex];
                if (methodIndex + 1 < this.methodBorders.length)
                    methodIndex++;
            }
            let isInMethod = currentMethod && element.position.line >= currentMethod.start && element.position.line <= currentMethod.end;
            if (isInMethod) {
                element.isInMethod = isInMethod;
            }
            //determine if the state is an error state
            for (let j = 0; j < this.diagnostics.length; j++) {
                let diagnostic = this.diagnostics[j];
                if (this.comparePosition(diagnostic.range.start, element.position) == 0) {
                    element.isErrorState = true;
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