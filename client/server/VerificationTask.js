'use strict';
var vscode_languageserver_1 = require('vscode-languageserver');
var Log_1 = require('./Log');
var Statement_1 = require('./Statement');
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
var VerificationState;
(function (VerificationState) {
    VerificationState[VerificationState["Initialization"] = 0] = "Initialization";
    VerificationState[VerificationState["Verifying"] = 1] = "Verifying";
    VerificationState[VerificationState["Reporting"] = 2] = "Reporting";
    VerificationState[VerificationState["PrintingHelp"] = 3] = "PrintingHelp";
})(VerificationState || (VerificationState = {}));
var VerificationTask = (function () {
    function VerificationTask(fileUri, nailgunService, connection, backend) {
        this.wrongFormat = false;
        this.running = false;
        this.time = 0;
        this.state = VerificationState.Initialization;
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
        this.state = VerificationState.Initialization;
        //Initialization
        this.resetDiagnostics();
        this.wrongFormat = false;
        this.steps = [];
        Log_1.Log.log(backend.name + ' verification startet');
        VerificationTask.connection.sendNotification(Log_1.Log.verificationStart);
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
        VerificationTask.connection.sendNotification(Log_1.Log.verificationEnd, this.diagnostics.length == 0 && code == 0);
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
                    case VerificationState.Initialization:
                        if (part.startsWith("Command-line interface:")) {
                            Log_1.Log.error('Could not start verification -> fix format');
                            this.state = VerificationState.PrintingHelp;
                        }
                        if (part.startsWith("(c) Copyright ETH")) {
                            this.state = VerificationState.Verifying;
                        }
                        break;
                    case VerificationState.Verifying:
                        if (part.startsWith('Silicon finished in') || part.startsWith('carbon finished in')) {
                            this.state = VerificationState.Reporting;
                            this.time = Number.parseFloat(/.*?(\d*\.\d*).*/.exec(part)[1]);
                        }
                        else if (part.startsWith("{") && part.endsWith("}")) {
                            try {
                                var progress = new TotalProgress(JSON.parse(part));
                                Log_1.Log.log("Progress: " + progress.toPercent());
                                VerificationTask.connection.sendNotification(Log_1.Log.verificationProgress, progress.toPercent());
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
                    case VerificationState.Reporting:
                        if (part == 'No errors found.') {
                            this.state = VerificationState.Reporting;
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
                    case VerificationState.PrintingHelp:
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
            VerificationTask.connection.sendRequest({ method: "UriToPath" }, uri).then(function (path) {
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
            VerificationTask.connection.sendRequest({ method: "PathToUri" }, path).then(function (uri) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmVyaWZpY2F0aW9uVGFzay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmVyaWZpY2F0aW9uVGFzay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFHYixzQ0FBNEQsdUJBQXVCLENBQUMsQ0FBQTtBQUVwRixvQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFFMUIsMEJBQXdCLGFBQWEsQ0FBQyxDQUFBO0FBT3RDO0lBS0ksdUJBQVksSUFBbUI7UUFDM0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDO1FBQ2xDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQztRQUM1QixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDcEMsQ0FBQztJQUVNLGlDQUFTLEdBQWhCO1FBQ0ksSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUM7UUFDOUUsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUM7UUFDdEYsTUFBTSxDQUFDLEdBQUcsR0FBRyxPQUFPLEdBQUcsS0FBSyxDQUFDO0lBQ2pDLENBQUM7SUFDTCxvQkFBQztBQUFELENBQUMsQUFoQkQsSUFnQkM7QUFFRCxJQUFLLGlCQUtKO0FBTEQsV0FBSyxpQkFBaUI7SUFDbEIsNkVBQWMsQ0FBQTtJQUNkLG1FQUFTLENBQUE7SUFDVCxtRUFBUyxDQUFBO0lBQ1QseUVBQVksQ0FBQTtBQUNoQixDQUFDLEVBTEksaUJBQWlCLEtBQWpCLGlCQUFpQixRQUtyQjtBQUVEO0lBY0ksMEJBQVksT0FBZSxFQUFFLGNB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