'use strict';

import child_process = require('child_process');
import {IConnection, Diagnostic, DiagnosticSeverity, } from 'vscode-languageserver';
import {Backend, IveSettings} from "./Settings";
import {Log} from './Log';
import {NailgunService} from './NailgunService';
import {Statement} from './Statement';
import {Commands, VerificationState} from './ViperProtocol';
import {Model} from './Model';

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

// enum VerificationState {
//     Initialization,
//     Verifying,
//     Reporting,
//     PrintingHelp
// }

export class VerificationTask {
    fileUri: string;
    nailgunService: NailgunService;
    static connection: IConnection;
    wrongFormat: boolean = false;
    diagnostics: Diagnostic[];
    backend: Backend;
    running: boolean = false;
    verifierProcess: child_process.ChildProcess;
    time: number = 0;
    steps: Statement[];
    model:Model = new Model();

    state: VerificationState = VerificationState.Stopped;

    constructor(fileUri: string, nailgunService: NailgunService, connection: IConnection, backend: Backend) {
        this.fileUri = fileUri;
        this.nailgunService = nailgunService;
        this.backend = backend;
        VerificationTask.connection = connection;
    }

    verify(backend: Backend, onlyTypeCheck: boolean, getTrace: boolean): void {

        this.backend = backend;
        this.running = true;

        this.state = VerificationState.Stopped;

        //Initialization
        this.resetDiagnostics();
        this.wrongFormat = false;
        this.steps = [];
        this.model = new Model();

        Log.log(backend.name + ' verification startet');

        VerificationTask.connection.sendNotification(Commands.StateChange, { newState: VerificationState.VerificationRunning, success: false, firstTime: false });

        VerificationTask.uriToPath(this.fileUri).then((path) => {
            //start verification of current file
            let currfile = '"' + path + '"';

            this.verifierProcess = this.nailgunService.startVerificationProcess(currfile, true, onlyTypeCheck, backend, getTrace);
            //subscribe handlers
            this.verifierProcess.stdout.on('data', this.stdOutHandler.bind(this));
            this.verifierProcess.stderr.on('data', this.stdErrHadler.bind(this));
            this.verifierProcess.on('close', this.verificationCompletionHandler.bind(this));
        });
    }

    resetDiagnostics() {
        this.diagnostics = [];
        VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
    }

    private verificationCompletionHandler(code) {
        Log.log(`Child process exited with code ${code}`);

        if (code != 0 && code != 1 && code != 899) {
            Log.hint("Verification Backend Terminated Abnormaly: with code " + code);
        }

        // Send the computed diagnostics to VSCode.
        VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
        VerificationTask.connection.sendNotification(Commands.StateChange, { newState: VerificationState.Ready, success: this.diagnostics.length == 0 && code == 0 });
        this.running = false;

        Log.log("Number of Steps: " + this.steps.length);
        //show last state
        
        this.steps.forEach((step)=>{
             Log.toLogFile(step.pretty());
        });
        Log.toLogFile("Model: " + this.model.pretty());
    }

    private stdErrHadler(data) {
        Log.error(`stderr: ${data}`);
        if (data.startsWith("connect: No error")) {
            Log.hint("No Nailgun server is running on port " + this.nailgunService.nailgunPort);
        }
        else if (data.startsWith("java.lang.ClassNotFoundException:")) {
            Log.hint("Class " + this.backend.mainMethod + " is unknown to Nailgun");
        }
        else if (data.startsWith("java.lang.StackOverflowError")) {
            Log.hint("StackOverflowError in Verification Backend");
        }
        else {
            //this can lead to many error messages
            Log.error(data);
        }
    }
    lines: string[] = [];
    private stdOutHandler(data) {
        //Log.log('stdout: ' + data);

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
                        if (part.startsWith("(c) Copyright ETH")) {
                            this.state = VerificationState.VerificationRunning;
                        }
                        break;
                    case VerificationState.VerificationRunning:
                        part = part.trim();
                        if (part.startsWith('Silicon finished in') || part.startsWith('carbon finished in')) {
                            this.state = VerificationState.VerificationReporting;
                            this.time = Number.parseFloat(/.*?(\d*\.\d*).*/.exec(part)[1]);
                        }
                        else if (part.startsWith("{\"") && part.endsWith("}")) {
                            try {
                                let progress = new TotalProgress(JSON.parse(part));
                                Log.log("Progress: " + progress.toPercent());
                                VerificationTask.connection.sendNotification(Commands.StateChange, { newState: VerificationState.VerificationRunning, progress: progress.toPercent() })
                            } catch (e) {
                                Log.error(e);
                            }
                        }
                        else if (part.startsWith("\"") && part.endsWith("\"")) {
                            this.model.extendModel(part);
                            //Log.toLogFile("Model: " + part);
                        } else if (part.startsWith("----")) {
                            //TODO: handle method mention if needed
                            return;
                        }
                        else if (part.startsWith("h = ")) {
                            //TODO: handle if needed
                            return;
                        }
                        else if (part.startsWith('PRODUCE') || part.startsWith('CONSUME') || part.startsWith('EVAL') || part.startsWith('EXECUTE')) {
                            if (this.lines.length > 0) {
                                Log.log("Warning: Ignore " + this.lines.length + " line(s): First ignored line: " + this.lines[0]);
                            }
                            this.lines = [];
                            this.lines.push(part);
                        }
                        else {
                            if (part.trim() == ')') {
                                if (this.lines.length != 6) {
                                    Log.error("error reading verification trace. Unexpected format.");
                                } else {
                                    this.steps.push(new Statement(this.lines[0], this.lines[2], this.lines[3], this.lines[4], this.lines[5]));
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
                            Log.log('Successfully verified with ' + this.backend.name + ' in ' + this.time + ' seconds.');
                            this.time = 0;
                        }
                        else if (part.startsWith('The following errors were found')) {
                            Log.log(this.backend.name + ': Verification failed after ' + this.time + ' seconds.');
                            this.time = 0;
                        }
                        else if (part.startsWith('  ')) {
                            let pos = /\s*(\d*):(\d*):\s(.*)/.exec(part);
                            if (pos.length != 4) {
                                Log.error('could not parse error description: "' + part + '"');
                                return;
                            }
                            let lineNr = +pos[1] - 1;
                            let charNr = +pos[2] - 1;
                            let message = pos[3].trim();

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

    public abortVerification() {
        Log.log('abort running verification');
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
            Log.log(`Child process exited with code ${code} and signal ${signal}`);
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