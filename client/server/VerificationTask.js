'use strict';
var vscode_languageserver_1 = require('vscode-languageserver');
var Log_1 = require('./Log');
var Statement_1 = require('./Statement');
var ViperProtocol_1 = require('./ViperProtocol');
var TotalProgress = (function () {
    function TotalProgress(json) {
        this.predicates = json.predicates;
        this.methods = json.methods;
        this.functions = json.functions;
    }
    TotalProgress.prototype.toPercent = function () {
        var total = this.predicates.total + this.methods.total + this.functions.total;
        var current = this.predicates.current + this.methods.current + this.functions.current;
        return 100 * current / total;
    };
    return TotalProgress;
}());
// enum VerificationState {
//     Initialization,
//     Verifying,
//     Reporting,
//     PrintingHelp
// }
var VerificationTask = (function () {
    function VerificationTask(fileUri, nailgunService, connection, backend) {
        this.wrongFormat = false;
        this.running = false;
        this.time = 0;
        this.state = ViperProtocol_1.VerificationState.Stopped;
        this.lines = [];
        this.fileUri = fileUri;
        this.nailgunService = nailgunService;
        this.backend = backend;
        VerificationTask.connection = connection;
    }
    VerificationTask.prototype.verify = function (backend, onlyTypeCheck) {
        var _this = this;
        this.backend = backend;
        this.running = true;
        this.state = ViperProtocol_1.VerificationState.Stopped;
        //Initialization
        this.resetDiagnostics();
        this.wrongFormat = false;
        this.steps = [];
        Log_1.Log.log(backend.name + ' verification startet');
        VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.VerificationRunning, success: false, firstTime: false });
        VerificationTask.uriToPath(this.fileUri).then(function (path) {
            //start verification of current file
            var currfile = '"' + path + '"';
            _this.verifierProcess = _this.nailgunService.startVerificationProcess(currfile, true, onlyTypeCheck, backend);
            //subscribe handlers
            _this.verifierProcess.stdout.on('data', _this.stdOutHadler.bind(_this));
            _this.verifierProcess.stderr.on('data', _this.stdErrHadler.bind(_this));
            _this.verifierProcess.on('close', _this.verificationCompletionHandler.bind(_this));
        });
    };
    VerificationTask.prototype.resetDiagnostics = function () {
        this.diagnostics = [];
        VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
    };
    VerificationTask.prototype.verificationCompletionHandler = function (code) {
        Log_1.Log.log("Child process exited with code " + code);
        if (code != 0 && code != 1 && code != 899) {
            Log_1.Log.hint("Verification Backend Terminated Abnormaly: with code " + code);
        }
        // Send the computed diagnostics to VSCode.
        VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
        VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.Ready, success: this.diagnostics.length == 0 && code == 0 });
        this.running = false;
        Log_1.Log.log("Number of Steps: " + this.steps.length);
        //show last state
        //Log.log(this.steps[this.steps.length - 1].pretty());
    };
    VerificationTask.prototype.stdErrHadler = function (data) {
        Log_1.Log.error("stderr: " + data);
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
    };
    VerificationTask.prototype.stdOutHadler = function (data) {
        //Log.log('stdout: ' + data);
        var stringData = data;
        var parts = stringData.split(/\r?\n/g);
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
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
                        if (part.startsWith('Silicon finished in') || part.startsWith('carbon finished in')) {
                            this.state = ViperProtocol_1.VerificationState.VerificationReporting;
                            this.time = Number.parseFloat(/.*?(\d*\.\d*).*/.exec(part)[1]);
                        }
                        else if (part.startsWith("{") && part.endsWith("}")) {
                            try {
                                var progress = new TotalProgress(JSON.parse(part));
                                Log_1.Log.log("Progress: " + progress.toPercent());
                                VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.VerificationRunning, progress: progress.toPercent() });
                            }
                            catch (e) {
                                Log_1.Log.error(e);
                            }
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
                            var pos = /\s*(\d*):(\d*):\s(.*)/.exec(part);
                            if (pos.length != 4) {
                                Log_1.Log.error('could not parse error description: "' + part + '"');
                                return;
                            }
                            var lineNr = +pos[1] - 1;
                            var charNr = +pos[2] - 1;
                            var message = pos[3].trim();
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
    };
    VerificationTask.prototype.abortVerification = function () {
        Log_1.Log.log('abort running verification');
        if (!this.running) {
            Log_1.Log.error('cannot abort, verification is not running.');
            return;
        }
        //remove impact of child_process to kill
        this.verifierProcess.removeAllListeners('close');
        this.verifierProcess.stdout.removeAllListeners('data');
        this.verifierProcess.stderr.removeAllListeners('data');
        //log the exit of the child_process to kill
        this.verifierProcess.on('exit', function (code, signal) {
            Log_1.Log.log("Child process exited with code " + code + " and signal " + signal);
        });
        this.verifierProcess.kill('SIGINT');
        var l = this.verifierProcess.listeners;
        this.running = false;
    };
    VerificationTask.prototype.getStepsOnLine = function (line) {
        var result = [];
        this.steps.forEach(function (step) {
            if (step.position.line == line) {
                result.push(step);
            }
        });
        return result;
    };
    //uri helper Methods
    VerificationTask.uriToPath = function (uri) {
        return new Promise(function (resolve, reject) {
            //input check
            if (!uri.startsWith("file:")) {
                Log_1.Log.error("cannot convert uri to filepath, uri: " + uri);
                return resolve(uri);
            }
            VerificationTask.connection.sendRequest(ViperProtocol_1.Commands.UriToPath, uri).then(function (path) {
                return resolve(path);
            });
        });
        /*
        //version 2
        let path = uri.replace(/\%3A/g, ":");
        //"replace" only replaces the first occurence of a string, /:/g replaces all
        path = path.replace("file:\/\/\/", "");
        path = path.replace(/\%20/g, " ");
        path = path.replace(/\//g, "\\");

        if (platformIndependentPath != path) {
            Log.error("UriToPath: path:\t\t" + path + "\nplatformIndependentPath: " + platformIndependentPath);
        }
        return platformIndependentPath;
        */
    };
    VerificationTask.pathToUri = function (path) {
        return new Promise(function (resolve, reject) {
            //input check
            if (path.startsWith("file")) {
                Log_1.Log.error("cannot convert path to uri, path: " + path);
                return resolve(path);
            }
            VerificationTask.connection.sendRequest(ViperProtocol_1.Commands.PathToUri, path).then(function (uri) {
                return resolve(uri);
            });
        });
        /*
        //version 2
        let uri = path.replace(/:/g, "\%3A");
        uri = uri.replace(/ /g, "\%20");
        uri = uri.replace(/\\/g, "/");
        uri = "file:///" + uri;
        
        if(platformIndependentUri != uri){
            Log.error("UriToPath: uri:\t\t"+uri + "\nplatformIndependentPath: "+ platformIndependentUri);
        }
        return platformIndependentUri;
        */
    };
    return VerificationTask;
}());
exports.VerificationTask = VerificationTask;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmVyaWZpY2F0aW9uVGFzay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmVyaWZpY2F0aW9uVGFzay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFHYixzQ0FBNEQsdUJBQXVCLENBQUMsQ0FBQTtBQUVwRixvQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFFMUIsMEJBQXdCLGFBQWEsQ0FBQyxDQUFBO0FBQ3RDLDhCQUF5QyxpQkFFekMsQ0FBQyxDQUZ5RDtBQU8xRDtJQUtJLHVCQUFZLElBQW1CO1FBQzNCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQztRQUNsQyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUM7UUFDNUIsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDO0lBQ3BDLENBQUM7SUFFTSxpQ0FBUyxHQUFoQjtRQUNJLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDO1FBQzlFLElBQUksT0FBTyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDO1FBQ3RGLE1BQU0sQ0FBQyxHQUFHLEdBQUcsT0FBTyxHQUFHLEtBQUssQ0FBQztJQUNqQyxDQUFDO0lBQ0wsb0JBQUM7QUFBRCxDQUFDLEFBaEJELElBZ0JDO0FBRUQsMkJBQTJCO0FBQzNCLHNCQUFzQjtBQUN0QixpQkFBaUI7QUFDakIsaUJBQWlCO0FBQ2pCLG1CQUFtQjtBQUNuQixJQUFJO0FBRUo7SUFjSSwwQkFBWSxPQUFlLEVBQUUsY0FBOEIsRUFBRSxVQUF1QixFQUFFLE9BQWdCO1FBVnRHLGdC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