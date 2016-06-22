'use strict';
const vscode_languageserver_1 = require('vscode-languageserver');
const Log_1 = require('./Log');
const Statement_1 = require('./Statement');
const ViperProtocol_1 = require('./ViperProtocol');
const Model_1 = require('./Model');
class TotalProgress {
    constructor(json) {
        this.predicates = json.predicates;
        this.methods = json.methods;
        this.functions = json.functions;
    }
    toPercent() {
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
class VerificationTask {
    constructor(fileUri, nailgunService, connection, backend) {
        this.wrongFormat = false;
        this.running = false;
        this.time = 0;
        this.model = new Model_1.Model();
        this.state = ViperProtocol_1.VerificationState.Stopped;
        this.lines = [];
        this.fileUri = fileUri;
        this.nailgunService = nailgunService;
        this.backend = backend;
        VerificationTask.connection = connection;
    }
    verify(backend, onlyTypeCheck, getTrace) {
        this.backend = backend;
        this.running = true;
        this.state = ViperProtocol_1.VerificationState.Stopped;
        //Initialization
        this.resetDiagnostics();
        this.wrongFormat = false;
        this.steps = [];
        this.model = new Model_1.Model();
        Log_1.Log.log(backend.name + ' verification startet');
        VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.VerificationRunning, success: false, firstTime: false });
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
    verificationCompletionHandler(code) {
        Log_1.Log.log(`Child process exited with code ${code}`);
        if (code != 0 && code != 1 && code != 899) {
            Log_1.Log.hint("Verification Backend Terminated Abnormaly: with code " + code);
        }
        // Send the computed diagnostics to VSCode.
        VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
        VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.Ready, success: this.diagnostics.length == 0 && code == 0 });
        this.running = false;
        Log_1.Log.log("Number of Steps: " + this.steps.length);
        //show last state
        this.steps.forEach((step) => {
            Log_1.Log.toLogFile(step.pretty());
        });
        Log_1.Log.toLogFile("Model: " + this.model.pretty());
    }
    stdErrHadler(data) {
        Log_1.Log.error(`stderr: ${data}`);
        if (data.startsWith("connect: No error")) {
            Log_1.Log.hint("No Nailgun server is running on port " + this.nailgunService.nailgunPort);
        }
        else if (data.startsWith("java.lang.ClassNotFoundException:")) {
            Log_1.Log.hint("Class " + this.backend.mainMethod + " is unknown to Nailgun");
        }
        else if (data.startsWith("java.lang.StackOverflowError")) {
            Log_1.Log.hint("StackOverflowError in Verification Backend");
        }
        else {
            //this can lead to many error messages
            Log_1.Log.error(data);
        }
    }
    stdOutHandler(data) {
        //Log.log('stdout: ' + data);
        let stringData = data;
        let parts = stringData.split(/\r?\n/g);
        for (var i = 0; i < parts.length; i++) {
            let part = parts[i];
            //skip empty lines
            if (part.trim().length > 0) {
                switch (this.state) {
                    case ViperProtocol_1.VerificationState.Stopped:
                        if (part.startsWith("Command-line interface:")) {
                            Log_1.Log.error('Could not start verification -> fix format');
                            this.state = ViperProtocol_1.VerificationState.VerificationPrintingHelp;
                        }
                        if (part.startsWith("(c) Copyright ETH")) {
                            this.state = ViperProtocol_1.VerificationState.VerificationRunning;
                        }
                        break;
                    case ViperProtocol_1.VerificationState.VerificationRunning:
                        part = part.trim();
                        if (part.startsWith('Silicon finished in') || part.startsWith('carbon finished in')) {
                            this.state = ViperProtocol_1.VerificationState.VerificationReporting;
                            this.time = Number.parseFloat(/.*?(\d*\.\d*).*/.exec(part)[1]);
                        }
                        else if (part.startsWith("{\"") && part.endsWith("}")) {
                            try {
                                let progress = new TotalProgress(JSON.parse(part));
                                Log_1.Log.log("Progress: " + progress.toPercent());
                                VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.VerificationRunning, progress: progress.toPercent() });
                            }
                            catch (e) {
                                Log_1.Log.error(e);
                            }
                        }
                        else if (part.startsWith("\"") && part.endsWith("\"")) {
                            this.model.extendModel(part);
                        }
                        else if (part.startsWith("----")) {
                            //TODO: handle method mention if needed
                            return;
                        }
                        else if (part.startsWith("h = ")) {
                            //TODO: handle if needed
                            return;
                        }
                        else if (part.startsWith('PRODUCE') || part.startsWith('CONSUME') || part.startsWith('EVAL') || part.startsWith('EXECUTE')) {
                            if (this.lines.length > 0) {
                                Log_1.Log.log("Warning: Ignore " + this.lines.length + " line(s): First ignored line: " + this.lines[0]);
                            }
                            this.lines = [];
                            this.lines.push(part);
                        }
                        else {
                            if (part.trim() == ')') {
                                if (this.lines.length != 6) {
                                    Log_1.Log.error("error reading verification trace. Unexpected format.");
                                }
                                else {
                                    this.steps.push(new Statement_1.Statement(this.lines[0], this.lines[2], this.lines[3], this.lines[4], this.lines[5]));
                                    this.lines = [];
                                }
                            }
                            else {
                                this.lines.push(part);
                            }
                        }
                        break;
                    case ViperProtocol_1.VerificationState.VerificationReporting:
                        if (part == 'No errors found.') {
                            this.state = ViperProtocol_1.VerificationState.VerificationReporting;
                            Log_1.Log.log('Successfully verified with ' + this.backend.name + ' in ' + this.time + ' seconds.');
                            this.time = 0;
                        }
                        else if (part.startsWith('The following errors were found')) {
                            Log_1.Log.log(this.backend.name + ': Verification failed after ' + this.time + ' seconds.');
                            this.time = 0;
                        }
                        else if (part.startsWith('  ')) {
                            let pos = /\s*(\d*):(\d*):\s(.*)/.exec(part);
                            if (pos.length != 4) {
                                Log_1.Log.error('could not parse error description: "' + part + '"');
                                return;
                            }
                            let lineNr = +pos[1] - 1;
                            let charNr = +pos[2] - 1;
                            let message = pos[3].trim();
                            this.diagnostics.push({
                                range: {
                                    start: { line: lineNr, character: charNr },
                                    end: { line: lineNr, character: 10000 } //Number.max does not work -> 10000 is an arbitrary large number that does the job
                                },
                                source: this.backend.name,
                                severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                                message: message
                            });
                        }
                        break;
                    case ViperProtocol_1.VerificationState.VerificationPrintingHelp:
                        return;
                }
            }
        }
    }
    abortVerification() {
        Log_1.Log.log('abort running verification');
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
            Log_1.Log.log(`Child process exited with code ${code} and signal ${signal}`);
        });
        this.verifierProcess.kill('SIGINT');
        let l = this.verifierProcess.listeners;
        this.running = false;
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
    //uri helper Methods
    static uriToPath(uri) {
        return new Promise((resolve, reject) => {
            //input check
            if (!uri.startsWith("file:")) {
                Log_1.Log.error("cannot convert uri to filepath, uri: " + uri);
                return resolve(uri);
            }
            VerificationTask.connection.sendRequest(ViperProtocol_1.Commands.UriToPath, uri).then((path) => {
                return resolve(path);
            });
        });
    }
    static pathToUri(path) {
        return new Promise((resolve, reject) => {
            //input check
            if (path.startsWith("file")) {
                Log_1.Log.error("cannot convert path to uri, path: " + path);
                return resolve(path);
            }
            VerificationTask.connection.sendRequest(ViperProtocol_1.Commands.PathToUri, path).then((uri) => {
                return resolve(uri);
            });
        });
    }
}
exports.VerificationTask = VerificationTask;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmVyaWZpY2F0aW9uVGFzay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmVyaWZpY2F0aW9uVGFzay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFHYix3Q0FBNEQsdUJBQXVCLENBQUMsQ0FBQTtBQUVwRixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFFMUIsNEJBQXdCLGFBQWEsQ0FBQyxDQUFBO0FBQ3RDLGdDQUEwQyxpQkFBaUIsQ0FBQyxDQUFBO0FBQzVELHdCQUFvQixTQUFTLENBQUMsQ0FBQTtBQU85QjtJQUtJLFlBQVksSUFBbUI7UUFDM0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDO1FBQ2xDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQztRQUM1QixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDcEMsQ0FBQztJQUVNLFNBQVM7UUFDWixJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQztRQUM5RSxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQztRQUN0RixNQUFNLENBQUMsR0FBRyxHQUFHLE9BQU8sR0FBRyxLQUFLLENBQUM7SUFDakMsQ0FBQztBQUNMLENBQUM7QUFFRCwyQkFBMkI7QUFDM0Isc0JBQXNCO0FBQ3RCLGlCQUFpQjtBQUNqQixpQkFBaUI7QUFDakIsbUJBQW1CO0FBQ25CLElBQUk7QUFFSjtJQWVJLFlBQVksT0FBZSxFQUFFLGNBQThCLEVBQUUsVUFBdUIsRUFBRSxPQUFnQjtRQVh0RyxnQkFBVyxH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