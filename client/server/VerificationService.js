'use strict';
var child_process = require('child_process');
var Log_1 = require('./Log');
var VerificationService = (function () {
    function VerificationService() {
        this.nailgunReady = false;
        this.nailgunPort = "7654";
        this.verificationRunning = false;
    }
    VerificationService.prototype.changeSettings = function (settings) {
        this.settings = settings;
    };
    VerificationService.prototype.nailgunStarted = function () {
        return (this.nailgunProcess != null);
    };
    VerificationService.prototype.startNailgunServer = function () {
        var _this = this;
        if (!this.nailgunStarted()) {
            var killOldNailgunProcess = child_process.exec('ng --nailgun-port ' + this.nailgunPort + ' ng-stop');
            killOldNailgunProcess.on('exit', function (code, signal) {
                Log_1.Log.log('starting nailgun server');
                //start the nailgun server for both silicon and carbon
                var backendJars = "";
                _this.settings.verificationBackends.forEach(function (backend) {
                    backendJars = backendJars + ";" + backend.path; //TODO: for unix it is : instead of ;
                });
                var command = 'java -cp ' + _this.settings.nailgunServerJar + backendJars + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + _this.nailgunPort;
                Log_1.Log.log(command);
                _this.nailgunProcess = child_process.exec(command);
                _this.nailgunProcess.stdout.on('data', function (data) {
                    Log_1.Log.logWithOrigin('NS', data);
                });
            });
            this.verify("", false, false, this.settings.verificationBackends[0], function () { }, function () { }, function () { }, function (code, signal) {
                _this.nailgunReady = true;
            });
        }
        else {
            Log_1.Log.log('nailgun server already running');
        }
        return this.nailgunProcess;
    };
    VerificationService.prototype.stopNailgunServer = function () {
        if (this.nailgunProcess) {
            Log_1.Log.log('shutting down nailgun server');
            this.nailgunProcess.kill('SIGINT');
        }
    };
    VerificationService.prototype.verify = function (fileToVerify, ideMode, onlyTypeCheck, backend, stdOutHadler, stdErrHadler, verificationCompletionHandler, onExit) {
        if (stdOutHadler === void 0) { stdOutHadler = function (data) { }; }
        if (stdErrHadler === void 0) { stdErrHadler = function (data) { }; }
        if (verificationCompletionHandler === void 0) { verificationCompletionHandler = function (code) { }; }
        if (onExit === void 0) { onExit = function (code, signal) { }; }
        this.verifierProcess = child_process.exec('ng --nailgun-port ' + this.nailgunPort + ' ' + backend.mainMethod + ' --ideMode ' + fileToVerify); // to set current working directory use, { cwd: verifierHome } as an additional parameter
        //subscribe handlers
        this.verifierProcess.stdout.on('data', stdOutHadler);
        this.verifierProcess.stderr.on('data', stdErrHadler);
        this.verifierProcess.on('close', verificationCompletionHandler);
        this.verifierProcess.on('exit', onExit);
    };
    VerificationService.prototype.verifyWithContent = function (fileToVerify, fileContent, ideMode, onlyTypeCheck, backend) {
        fileContent = encodeURIComponent(fileContent);
        var command = 'ng --nailgun-port ' + this.nailgunPort + ' ' + backend.mainMethod + ' --ideMode --fileContent "' + fileContent + '" ' + fileToVerify;
        Log_1.Log.log(command);
        return child_process.exec(command); // to set current working directory use, { cwd: verifierHome } as an additional parameter
    };
    VerificationService.prototype.abortVerification = function () {
        Log_1.Log.log('abort running verification');
        if (!this.verificationRunning) {
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
        this.verificationRunning = false;
    };
    VerificationService.prototype.startNailgunIfNotRunning = function () {
        //startNailgun if it is not already running:
        if (!this.nailgunStarted()) {
            this.verifierProcess = this.startNailgunServer();
        }
    };
    return VerificationService;
}());
exports.VerificationService = VerificationService;
//# sourceMappingURL=VerificationService.js.map