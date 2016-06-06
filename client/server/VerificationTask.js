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
        // Send the computed diagnostics to VSCode.
        VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
        VerificationTask.connection.sendNotification(Log_1.Log.verificationEnd, this.diagnostics.length == 0 && code == 0);
        this.running = false;
        Log_1.Log.log("Number of Steps: " + this.steps.length);
        //Log.log(this.steps[this.steps.length - 1].pretty());
    };
    VerificationTask.prototype.stdErrHadler = function (data) {
        Log_1.Log.error("stderr: " + data);
        if (data.startsWith("connect: No error")) {
            Log_1.Log.hint("No Nailgun server is running on port " + this.nailgunService.nailgunPort);
        }
        if (data.startsWith("java.lang.ClassNotFoundException:")) {
            Log_1.Log.hint("Class " + this.backend.mainMethod + " is unknown to Nailgun");
        }
        else {
            //this can lead to many error messages
            Log_1.Log.error("cannot start nailgun, is ng in PATH? " + data);
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