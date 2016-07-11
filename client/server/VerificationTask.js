'use strict';
const vscode_languageserver_1 = require('vscode-languageserver');
const Settings_1 = require('./Settings');
const ViperProtocol_1 = require('./ViperProtocol');
const Log_1 = require('./Log');
const Statement_1 = require('./Statement');
const Model_1 = require('./Model');
const pathHelper = require('path');
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
class VerificationTask {
    constructor(fileUri, nailgunService, connection, backend) {
        //state
        this.running = false;
        this.aborting = false;
        this.state = ViperProtocol_1.VerificationState.Stopped;
        //working variables
        this.lines = [];
        this.wrongFormat = false;
        this.isFromMethod = false;
        //verification results
        this.time = 0;
        this.model = new Model_1.Model();
        this.lastSuccess = ViperProtocol_1.Success.None;
        this.parsingCompleted = false;
        this.typeCheckingCompleted = false;
        this.fileUri = fileUri;
        this.nailgunService = nailgunService;
        this.backend = backend;
        VerificationTask.connection = connection;
    }
    verify(backend, onlyTypeCheck, manuallyTriggered) {
        if (!manuallyTriggered && this.lastSuccess == ViperProtocol_1.Success.Error) {
            Log_1.Log.log("After an internal error, reverification has to be triggered manually.", ViperProtocol_1.LogLevel.Info);
            return;
        }
        //Initialization
        this.manuallyTriggered = manuallyTriggered;
        this.backend = backend;
        this.running = true;
        this.aborting = false;
        this.state = ViperProtocol_1.VerificationState.Stopped;
        this.resetDiagnostics();
        this.wrongFormat = false;
        this.steps = [];
        this.lines = [];
        this.model = new Model_1.Model();
        this.parsingCompleted = true;
        this.typeCheckingCompleted = true;
        Log_1.Log.log(backend.name + ' verification started', ViperProtocol_1.LogLevel.Info);
        VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.VerificationRunning, firstTime: false });
        VerificationTask.uriToPath(this.fileUri).then((path) => {
            //start verification of current file
            this.path = path;
            this.filename = pathHelper.basename(path);
            this.verifierProcess = this.nailgunService.startVerificationProcess(path, true, onlyTypeCheck, backend);
            //subscribe handlers
            this.verifierProcess.stdout.on('data', this.stdOutHandler.bind(this));
            this.verifierProcess.stderr.on('data', this.stdErrHadler.bind(this));
            this.verifierProcess.on('close', this.verificationCompletionHandler.bind(this));
            this.verifierProcess.on('exit', (code, msg) => {
                Log_1.Log.log("verifierProcess onExit: " + code + " and " + msg, ViperProtocol_1.LogLevel.Debug);
            });
        });
    }
    resetDiagnostics() {
        this.diagnostics = [];
        VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
    }
    verificationCompletionHandler(code) {
        Log_1.Log.log(`Child process exited with code ${code}`, ViperProtocol_1.LogLevel.Debug);
        if (this.aborting)
            return;
        if (code != 0 && code != 1 && code != 899) {
            Log_1.Log.log("Verification Backend Terminated Abnormaly: with code " + code, ViperProtocol_1.LogLevel.Default);
            if (Settings_1.Settings.isWin && code == null) {
                this.nailgunService.killNgDeamon();
                this.nailgunService.restartNailgunServer(VerificationTask.connection, this.backend);
            }
        }
        // Send the computed diagnostics to VSCode.
        VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
        let success = ViperProtocol_1.Success.None;
        if (this.diagnostics.length == 0 && code == 0) {
            success = ViperProtocol_1.Success.Success;
        }
        else if (this.diagnostics.length > 0) {
            //use tag and backend trace as indicators for completed parsing
            if (!this.parsingCompleted && this.steps.length == 0) {
                success = ViperProtocol_1.Success.ParsingFailed;
            }
            else if (this.parsingCompleted && !this.typeCheckingCompleted) {
                success = ViperProtocol_1.Success.TypecheckingFailed;
            }
            else {
                success = ViperProtocol_1.Success.VerificationFailed;
            }
        }
        else {
            success = this.aborting ? ViperProtocol_1.Success.Aborted : ViperProtocol_1.Success.Error;
        }
        this.lastSuccess = success;
        VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, {
            newState: ViperProtocol_1.VerificationState.Ready,
            success: success,
            manuallyTriggered: this.manuallyTriggered,
            filename: this.filename,
            nofErrors: this.diagnostics.length,
            time: this.time,
            firstTime: false
        });
        this.time = 0;
        this.running = false;
        Log_1.Log.log("Number of Steps: " + this.steps.length, ViperProtocol_1.LogLevel.Info);
        //show last state
        this.steps.forEach((step) => {
            Log_1.Log.toLogFile(step.pretty(), ViperProtocol_1.LogLevel.LowLevelDebug);
        });
        Log_1.Log.toLogFile("Model: " + this.model.pretty(), ViperProtocol_1.LogLevel.LowLevelDebug);
    }
    stdErrHadler(data) {
        data = data.trim();
        if (data.length == 0)
            return;
        if (data.startsWith("at ")) {
            Log_1.Log.toLogFile(data, ViperProtocol_1.LogLevel.LowLevelDebug);
            return;
        }
        Log_1.Log.error(data, ViperProtocol_1.LogLevel.Debug);
        if (data.startsWith("connect: No error")) {
            Log_1.Log.hint("No Nailgun server is running on port " + this.nailgunService.settings.nailgunPort);
        }
        else if (data.startsWith("java.lang.NullPointerException")) {
            Log_1.Log.error("A nullpointer exception happened in the verification backend.", ViperProtocol_1.LogLevel.Default);
        }
        else if (data.startsWith("java.lang.ClassNotFoundException:")) {
            Log_1.Log.error("Class " + this.backend.mainMethod + " is unknown to Nailgun\nFix the backend settings for " + this.backend.name, ViperProtocol_1.LogLevel.Default);
        }
        else if (data.startsWith("java.io.IOException: Stream closed")) {
            Log_1.Log.error("A concurrency error occured, try again.", ViperProtocol_1.LogLevel.Default);
        }
        else if (data.startsWith("java.lang.StackOverflowError")) {
            Log_1.Log.error("StackOverflowError in verification backend", ViperProtocol_1.LogLevel.Default);
        }
        else if (data.startsWith("SLF4J: Class path contains multiple SLF4J bindings")) {
            Log_1.Log.error(this.backend.name + " is referencing two versions of the backend, fix its paths in the settings", ViperProtocol_1.LogLevel.Default);
        }
    }
    stdOutHandler(data) {
        if (data.trim().length == 0) {
            return;
        }
        Log_1.Log.toLogFile(`[${this.backend.name}: stdout]: ${data}`, ViperProtocol_1.LogLevel.LowLevelDebug);
        if (this.aborting)
            return;
        let stringData = data;
        let parts = stringData.split(/\r?\n/g);
        for (var i = 0; i < parts.length; i++) {
            let part = parts[i];
            //skip empty lines
            if (part.trim().length > 0) {
                switch (this.state) {
                    case ViperProtocol_1.VerificationState.Stopped:
                        if (part.startsWith("Command-line interface:")) {
                            Log_1.Log.error('Could not start verification -> fix customArguments for backend', ViperProtocol_1.LogLevel.Default);
                            this.state = ViperProtocol_1.VerificationState.VerificationPrintingHelp;
                        }
                        if (part.startsWith("(c) ") && part.indexOf("ETH") > 0) {
                            this.state = ViperProtocol_1.VerificationState.VerificationRunning;
                        }
                        break;
                    case ViperProtocol_1.VerificationState.VerificationRunning:
                        part = part.trim();
                        if (part.startsWith('Silicon finished in') || part.startsWith('carbon finished in')) {
                            this.state = ViperProtocol_1.VerificationState.VerificationReporting;
                            this.time = Number.parseFloat(/.*?(\d*\.\d*).*/.exec(part)[1]);
                        }
                        else if (part.startsWith('Silicon started') || part.startsWith('carbon started')) {
                        }
                        else if (part.startsWith("{\"") && part.endsWith("}")) {
                            try {
                                let progress = new TotalProgress(JSON.parse(part));
                                Log_1.Log.log("Progress: " + progress.toPercent(), ViperProtocol_1.LogLevel.Info);
                                VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.VerificationRunning, progress: progress.toPercent(), filename: this.filename });
                            }
                            catch (e) {
                                Log_1.Log.error("Error reading progress: " + e);
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
                        }
                        else if (part.startsWith("---------- METHOD ")) {
                            this.isFromMethod = true;
                            continue;
                        }
                        else if (part.startsWith("----")) {
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
                                Log_1.Log.error(msg);
                                Log_1.Log.log("Next line: " + part, ViperProtocol_1.LogLevel.Debug);
                            }
                            this.lines = [];
                            this.lines.push(part);
                        }
                        else {
                            if (part.trim() == ')') {
                                if (this.lines.length != 6) {
                                    Log_1.Log.error("error reading verification trace. Unexpected format.");
                                    let msg = "Warning: Ignore " + this.lines.length + " line(s):";
                                    this.lines.forEach((line) => {
                                        msg = msg + "\n\t" + line;
                                    });
                                    Log_1.Log.error(msg);
                                    this.lines = [];
                                }
                                else {
                                    this.steps.push(new Statement_1.Statement(this.lines[0], this.lines[2], this.lines[3], this.lines[4], this.lines[5], this.model));
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
                        }
                        else if (part.startsWith('The following errors were found')) {
                        }
                        else if (part.startsWith('  ')) {
                            let pos = /\s*(\d+):(\d+):\s(.*)/.exec(part);
                            if (pos.length != 4) {
                                Log_1.Log.error('could not parse error description: "' + part + '"');
                                continue;
                            }
                            let lineNr = +pos[1] - 1;
                            let charNr = +pos[2] - 1;
                            let message = pos[3].trim();
                            //for Marktoberdorf
                            let tag;
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
                            Log_1.Log.log(`Error: [${this.backend.name}] ${tag ? "[" + tag + "] " : ""}${lineNr + 1}:${charNr + 1} ${message}`, ViperProtocol_1.LogLevel.Default);
                            this.diagnostics.push({
                                range: {
                                    start: { line: lineNr, character: charNr },
                                    end: { line: lineNr, character: 10000 } //Number.max does not work -> 10000 is an arbitrary large number that does the job
                                },
                                source: null,
                                severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                                message: message
                            });
                        }
                        else {
                            Log_1.Log.error("Unexpected message during VerificationReporting: " + part);
                        }
                        break;
                    case ViperProtocol_1.VerificationState.VerificationPrintingHelp:
                        return;
                }
            }
        }
    }
    getNextLine(previousLine) {
        let next = Number.MAX_VALUE;
        this.steps.forEach(element => {
            let line = element.position.line;
            if (line > previousLine && line < next) {
                next = line;
            }
        });
        return next;
    }
    abortVerification() {
        if (!this.running)
            return;
        Log_1.Log.log('Abort running verification', ViperProtocol_1.LogLevel.Info);
        this.aborting = true;
        //remove impact of child_process to kill
        this.verifierProcess.removeAllListeners('close');
        this.verifierProcess.stdout.removeAllListeners('data');
        this.verifierProcess.stderr.removeAllListeners('data');
        //log the exit of the child_process to kill
        this.verifierProcess.on('exit', (code, signal) => {
            Log_1.Log.log(`Child process exited with code ${code} and signal ${signal}`, ViperProtocol_1.LogLevel.Debug);
        });
        this.verifierProcess.kill('SIGINT');
        let l = this.verifierProcess.listeners;
        this.running = false;
        this.lastSuccess = ViperProtocol_1.Success.Aborted;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmVyaWZpY2F0aW9uVGFzay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmVyaWZpY2F0aW9uVGFzay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFHYix3Q0FBNEQsdUJBQXVCLENBQUMsQ0FBQTtBQUNwRiwyQkFBdUIsWUFDdkIsQ0FBQyxDQURrQztBQUNuQyxnQ0FBcUYsaUJBQ3JGLENBQUMsQ0FEcUc7QUFDdEcsc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBRTFCLDRCQUF3QixhQUFhLENBQUMsQ0FBQTtBQUN0Qyx3QkFBb0IsU0FBUyxDQUFDLENBQUE7QUFDOUIsTUFBWSxVQUFVLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFPbkM7SUFLSSxZQUFZLElBQW1CO1FBQzNCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQztRQUNsQyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUM7UUFDNUIsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDO0lBQ3BDLENBQUM7SUFFTSxTQUFTO1FBQ1osSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUM7UUFDOUUsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUM7UUFDdEYsTUFBTSxDQUFDLEdBQUcsR0FBRyxPQUFPLEdBQUcsS0FBSyxDQUFDO0lBQ2pDLENBQUM7QUFDTCxDQUFDO0FBRUQ7SUE4QkksWUFBWSxPQUFlLEVBQUUsY0FBOEIsRUFBRSxVQUF1QixFQUFFLE9BQWdCO1FBN0J0RyxPQUFPO1FBQ1AsWUFB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