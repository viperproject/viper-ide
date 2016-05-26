'use strict';

import child_process = require('child_process');
import {IConnection, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import {Backend, IveSettings} from "./Settings"
import {Log} from './Log'
import {NailgunService} from './NailgunService'

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
    fileUri: string;
    nailgunService: NailgunService;
    connection: IConnection;
    wrongFormat: boolean = false;
    diagnostics: Diagnostic[];
    backend: Backend;
    running: boolean = false;
    verifierProcess: child_process.ChildProcess;
    time: number = 0;

    constructor(fileUri: string, nailgunService: NailgunService, connection: IConnection, backend: Backend) {
        this.fileUri = fileUri;
        this.nailgunService = nailgunService;
        this.backend = backend;
        this.connection = connection;
    }

    verify(backend: Backend, onlyTypeCheck: boolean): void {

        this.backend = backend;
        this.running = true;

        //Initialization
        this.resetDiagnostics();
        this.wrongFormat = false;

        Log.log(backend.name + ' verification startet');

        this.connection.sendNotification({ method: "VerificationStart" });

        let path = this.uriToPath(this.fileUri);

        //start verification of current file
        let currfile = '"' + path + '"';

        this.verifierProcess = this.nailgunService.startVerificationProcess(currfile, true, onlyTypeCheck, backend);
        //subscribe handlers
        this.verifierProcess.stdout.on('data', this.stdOutHadler.bind(this));
        this.verifierProcess.stderr.on('data', this.stdErrHadler.bind(this));
        this.verifierProcess.on('close', this.verificationCompletionHandler.bind(this));
    }

    resetDiagnostics() {
        this.diagnostics = [];
        this.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
    }

    uriToPath(uri: string): string {
        if (!uri.startsWith("file:")) {
            Log.error("cannot convert uri to filepath, uri: " + uri);
        }
        uri = uri.replace("\%3A", ":");
        uri = uri.replace("file:\/\/\/", "");
        uri = uri.replace("\%20", " ");
        return uri;
    }

    private verificationCompletionHandler(code) {
        Log.log(`Child process exited with code ${code}`);
        // Send the computed diagnostics to VSCode.
        this.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
        this.connection.sendNotification({ method: "VerificationEnd" }, this.diagnostics.length == 0);
        this.running = false;
    }

    private stdErrHadler(data) {
        Log.error(`stderr: ${data}`);
        if (data.startsWith("connect: No error")) {
            this.connection.sendNotification({ method: "Hint" }, "No Nailgun server is running on port " + this.nailgunService.nailgunPort);
        }
        if (data.startsWith("java.lang.ClassNotFoundException:")) {
            this.connection.sendNotification({ method: "Hint" }, "Class " + this.backend.mainMethod + " is unknown to Nailgun");
        }
    }

    private stdOutHadler(data) {
        Log.log('stdout: ' + data);

        if (this.wrongFormat) {
            return;
        }
        let stringData: string = data;
        let parts = stringData.split(/\r?\n/g);

        for (var i = 0; i < parts.length; i++) {
            let part = parts[i];
            if (part.startsWith("Command-line interface:")) {
                Log.error('Could not start verification -> fix format');
                this.wrongFormat = true;
            }
            if (part.startsWith('Silicon finished in') || part.startsWith('carbon finished in')) {
                this.time = Number.parseFloat(/.*?(\d*\.\d*).*/.exec(part)[1]);
            }
            else if (part == 'No errors found.') {
                Log.log('Successfully verified with ' + this.backend.name + ' in ' + this.time + ' seconds.');
                this.time = 0;
            }
            else if (part.startsWith("{") && part.endsWith("}")) {
                try {
                    let progress = new TotalProgress(JSON.parse(part));
                    Log.log("Progress: " + progress.toPercent());
                    this.connection.sendNotification({ method: "VerificationProgress" }, progress.toPercent())
                } catch (e) {
                    Log.error(e);
                }
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
        }
    }
    public abortVerification() {
        Log.log('abort running verification');
        if (!this.running) {
            Log.error('cannot abort, verification is not running.');
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
}