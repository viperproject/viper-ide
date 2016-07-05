'use strict';

import child_process = require('child_process');
import {IConnection, Diagnostic, DiagnosticSeverity, } from 'vscode-languageserver';
import {Settings} from './Settings'
import {Backend, ViperSettings, Commands, VerificationState, LogLevel} from './ViperProtocol'
import {Log} from './Log';
import {NailgunService} from './NailgunService';
import {Statement} from './Statement';
import {Model} from './Model';
import * as pathHelper from 'path';

interface Progress {
    current: number;
    total: number;
}

class TotalProgress {
    predicates: Progress;
    functions: Progress;
    methods: Progress;

    constructor(json: TotalProgress) {
        this.predicates = json.predicates;
        this.methods = json.methods;
        this.functions = json.functions;
    }

    public toPercent(): number {
        let total = this.predicates.total + this.methods.total + this.functions.total;
        let current = this.predicates.current + this.methods.current + this.functions.current;
        return 100 * current / total;
    }
}

export class VerificationTask {
    //state
    running: boolean = false;
    manuallyTriggered: boolean;
    state: VerificationState = VerificationState.Stopped;
    verifierProcess: child_process.ChildProcess;
    backend: Backend;
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

    constructor(fileUri: string, nailgunService: NailgunService, connection: IConnection, backend: Backend) {
        this.fileUri = fileUri;
        this.nailgunService = nailgunService;
        this.backend = backend;
        VerificationTask.connection = connection;
    }

    verify(backend: Backend, onlyTypeCheck: boolean, manuallyTriggered: boolean): void {
        this.manuallyTriggered = manuallyTriggered;
        this.backend = backend;
        this.running = true;

        this.state = VerificationState.Stopped;

        //Initialization
        this.resetDiagnostics();
        this.wrongFormat = false;
        this.steps = [];
        this.lines = [];
        this.model = new Model();

        Log.log(backend.name + ' verification started', LogLevel.Info);

        VerificationTask.connection.sendNotification(Commands.StateChange, { newState: VerificationState.VerificationRunning, success: false, firstTime: false });

        VerificationTask.uriToPath(this.fileUri).then((path) => {
            //start verification of current file
            this.path = path
            this.filename = pathHelper.basename(path);
            this.verifierProcess = this.nailgunService.startVerificationProcess(path, true, onlyTypeCheck, backend);
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

        if (code != 0 && code != 1 && code != 899) {
            Log.hint("Verification Backend Terminated Abnormaly: with code " + code);
            if (Settings.isWin) {
                this.nailgunService.killNgDeamon();
                this.nailgunService.restartNailgunServer(VerificationTask.connection, this.backend);
            }
        }

        // Send the computed diagnostics to VSCode.
        VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
        VerificationTask.connection.sendNotification(Commands.StateChange,
            {
                newState: VerificationState.Ready,
                success: this.diagnostics.length == 0 && code == 0,
                manuallyTriggered: this.manuallyTriggered,
                filename: this.filename,
                onlyParsed: this.steps.length == 0
            });
        this.running = false;

        Log.log("Number of Steps: " + this.steps.length, LogLevel.Info);
        //show last state

        this.steps.forEach((step) => {
            Log.toLogFile(step.pretty(), LogLevel.LowLevelDebug);
        });
        Log.toLogFile("Model: " + this.model.pretty(), LogLevel.LowLevelDebug);
    }

    private stdErrHadler(data) {
        data = data.trim();
        if (data.length == 0) {
            return;
        }
        if (data.startsWith("connect: No error")) {
            Log.hint("No Nailgun server is running on port " + this.nailgunService.settings.nailgunPort);
            return;
        }
        else if (data.startsWith("java.lang.ClassNotFoundException:")) {
            Log.hint("Class " + this.backend.mainMethod + " is unknown to Nailgun\nFix the backend settings for " + this.backend.name);
        }
        else if (data.startsWith("java.lang.StackOverflowError")) {
            Log.hint("StackOverflowError in Verification Backend");
        }
        else if (data.startsWith("SLF4J: Class path contains multiple SLF4J bindings")) {
            Log.hint(this.backend.name + " is referencing two versions of the backend, fix its paths in the settings");
        }
        else if (data.startsWith("SLF4J: ")) {

        } else {
            //this can lead to many error messages
            Log.error(data, LogLevel.Debug);
        }
    }
    private stdOutHandler(data) {
        if (data.trim().length == 0) {
            return;
        }
        Log.toLogFile(`[${this.backend.name}: stdout]: ${data}`, LogLevel.LowLevelDebug);

        let stringData: string = data;
        let parts = stringData.split(/\r?\n/g);
        for (var i = 0; i < parts.length; i++) {
            let part = parts[i];

            //skip empty lines
            if (part.trim().length > 0) {
                switch (this.state) {
                    case VerificationState.Stopped:
                        if (part.startsWith("Command-line interface:")) {
                            Log.error('Could not start verification -> fix format');
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
                                VerificationTask.connection.sendNotification(Commands.StateChange, { newState: VerificationState.VerificationRunning, progress: progress.toPercent() })
                            } catch (e) {
                                Log.error("Error reading progress: " + e);
                            }
                        }
                        else if (part.startsWith("\"")) {
                            if (!part.endsWith("\"")) {
                                //TODO: it can also be that the model is split among multiple stdout pieces
                                while (i + 1 < parts.length && !part.endsWith("\"")) {
                                    part += parts[++i];
                                }
                            }
                            this.model.extendModel(part);
                            //Log.toLogFile("Model: " + part);
                        } else if (part.startsWith("---------- METHOD ")) {
                            this.isFromMethod = true;
                            continue;
                        } else if (part.startsWith("----")) {
                            this.isFromMethod = false;
                            //TODO: handle method mention if needed
                            continue;
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
                                    this.steps.push(new Statement(this.lines[0], this.lines[2], this.lines[3], this.lines[4], this.lines[5], this.model));
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
                            this.state = VerificationState.VerificationReporting;
                            Log.log(this.backend.name + ": Successfully verified " + this.filename + " in " + this.time + ' seconds.', LogLevel.Default);
                            this.time = 0;
                        }
                        else if (part.startsWith('The following errors were found')) {
                            Log.log(this.backend.name + ': Verifying ' + this.filename + ' failed after ' + this.time + ' seconds.', LogLevel.Default);
                            this.time = 0;
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

                            Log.log(`Error: [${this.backend.name}] ${lineNr + 1}:${charNr + 1} ${message}`, LogLevel.Default);
                            this.diagnostics.push({
                                range: {
                                    start: { line: lineNr, character: charNr },
                                    end: { line: lineNr, character: 10000 }//Number.max does not work -> 10000 is an arbitrary large number that does the job
                                },
                                source: this.backend.name,
                                severity: DiagnosticSeverity.Error,
                                message: message
                            });
                        }
                        break;
                    case VerificationState.VerificationPrintingHelp:
                        return;
                }
            }
        }
    }

    public getNextLine(previousLine): number {
        let next = Number.MAX_VALUE;
        this.steps.forEach(element => {
            let line = element.position.line
            if (line > previousLine && line < next) {
                next = line;
            }
        });
        return next;
    }

    public abortVerification() {
        Log.log('abort running verification', LogLevel.Info);
        if (!this.running) {
            //Log.error('cannot abort. the verification is not running.');
            return;
        }
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

    //uri helper Methods
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