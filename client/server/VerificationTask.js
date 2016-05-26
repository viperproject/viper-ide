'use strict';
var vscode_languageserver_1 = require('vscode-languageserver');
var Log_1 = require('./Log');
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
var VerificationTask = (function () {
    function VerificationTask(fileUri, nailgunService, connection, backend) {
        this.wrongFormat = false;
        this.running = false;
        this.time = 0;
        this.fileUri = fileUri;
        this.nailgunService = nailgunService;
        this.backend = backend;
        this.connection = connection;
    }
    VerificationTask.prototype.verify = function (backend, onlyTypeCheck) {
        this.backend = backend;
        this.running = true;
        //Initialization
        this.resetDiagnostics();
        this.wrongFormat = false;
        Log_1.Log.log(backend.name + ' verification startet');
        this.connection.sendNotification({ method: "VerificationStart" });
        var path = this.uriToPath(this.fileUri);
        //start verification of current file
        var currfile = '"' + path + '"';
        this.verifierProcess = this.nailgunService.startVerificationProcess(currfile, true, onlyTypeCheck, backend);
        //subscribe handlers
        this.verifierProcess.stdout.on('data', this.stdOutHadler.bind(this));
        this.verifierProcess.stderr.on('data', this.stdErrHadler.bind(this));
        this.verifierProcess.on('close', this.verificationCompletionHandler.bind(this));
    };
    VerificationTask.prototype.resetDiagnostics = function () {
        this.diagnostics = [];
        this.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
    };
    VerificationTask.prototype.uriToPath = function (uri) {
        if (!uri.startsWith("file:")) {
            Log_1.Log.error("cannot convert uri to filepath, uri: " + uri);
        }
        uri = uri.replace("\%3A", ":");
        uri = uri.replace("file:\/\/\/", "");
        uri = uri.replace("\%20", " ");
        return uri;
    };
    VerificationTask.prototype.verificationCompletionHandler = function (code) {
        Log_1.Log.log("Child process exited with code " + code);
        // Send the computed diagnostics to VSCode.
        this.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
        this.connection.sendNotification({ method: "VerificationEnd" }, this.diagnostics.length == 0);
        this.running = false;
    };
    VerificationTask.prototype.stdErrHadler = function (data) {
        Log_1.Log.error("stderr: " + data);
        if (data.startsWith("connect: No error")) {
            this.connection.sendNotification({ method: "Hint" }, "No Nailgun server is running on port " + this.nailgunService.nailgunPort);
        }
        if (data.startsWith("java.lang.ClassNotFoundException:")) {
            this.connection.sendNotification({ method: "Hint" }, "Class " + this.backend.mainMethod + " is unknown to Nailgun");
        }
    };
    VerificationTask.prototype.stdOutHadler = function (data) {
        Log_1.Log.log('stdout: ' + data);
        if (this.wrongFormat) {
            return;
        }
        var stringData = data;
        var parts = stringData.split(/\r?\n/g);
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            if (part.startsWith("Command-line interface:")) {
                Log_1.Log.error('Could not start verification -> fix format');
                this.wrongFormat = true;
            }
            if (part.startsWith('Silicon finished in') || part.startsWith('carbon finished in')) {
                this.time = Number.parseFloat(/.*?(\d*\.\d*).*/.exec(part)[1]);
            }
            else if (part == 'No errors found.') {
                Log_1.Log.log('Successfully verified with ' + this.backend.name + ' in ' + this.time + ' seconds.');
                this.time = 0;
            }
            else if (part.startsWith("{") && part.endsWith("}")) {
                try {
                    var progress = new TotalProgress(JSON.parse(part));
                    Log_1.Log.log("Progress: " + progress.toPercent());
                    this.connection.sendNotification({ method: "VerificationProgress" }, progress.toPercent());
                }
                catch (e) {
                    Log_1.Log.error(e);
                }
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
    return VerificationTask;
}());
exports.VerificationTask = VerificationTask;
//# sourceMappingURL=VerificationTask.js.map