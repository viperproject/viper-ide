'use strict';
var child_process = require('child_process');
var Log_1 = require('./Log');
var Settings_1 = require('./Settings');
var ViperProtocol_1 = require('./ViperProtocol');
var NailgunService = (function () {
    function NailgunService() {
        this.ready = false;
        this.nailgunPort = "7654";
    }
    NailgunService.prototype.changeSettings = function (settings) {
        this.settings = settings;
    };
    NailgunService.prototype.nailgunStarted = function () {
        return (this.nailgunProcess != null);
    };
    NailgunService.prototype.startNailgunServer = function (connection, backend) {
        var _this = this;
        if (!this.nailgunStarted()) {
            Log_1.Log.log("close nailgun server on port: " + this.nailgunPort);
            var killOldNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ng-stop');
            killOldNailgunProcess.on('exit', function (code, signal) {
                Log_1.Log.log('starting nailgun server');
                //start the nailgun server for both silicon and carbon
                var backendJars = Settings_1.Settings.backendJars(backend);
                //Log.log("Backend Jars: " + backendJars);
                var command = 'java -cp ' + _this.settings.nailgunServerJar + backendJars + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + _this.nailgunPort;
                //Log.log(command)
                _this.nailgunProcess = child_process.exec(command);
                _this.nailgunProcess.stdout.on('data', function (data) {
                    //Log.logWithOrigin('NS', data);
                    var dataS = data;
                    if (dataS.indexOf("started") > 0) {
                        //Comment in to perstart JVM
                        //let tempProcess = this.startVerificationProcess("", false, false, this.settings.verificationBackends[0],false);
                        //tempProcess.on('exit', (code, signal) => {
                        _this.ready = true;
                        Log_1.Log.log("Nailgun started");
                        connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.Ready, firstTime: true });
                    }
                });
            });
        }
        else {
            Log_1.Log.log('nailgun server already running');
        }
        ;
    };
    NailgunService.prototype.stopNailgunServer = function () {
        this.ready = false;
        if (this.nailgunProcess) {
            Log_1.Log.log('gracefully shutting down nailgun server');
            var shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ng-stop');
            shutDownNailgunProcess.on('exit', function (code, signal) {
                Log_1.Log.log("nailgun server is stopped");
            });
        }
        this.nailgunProcess = null;
    };
    NailgunService.prototype.restartNailgunServer = function (connection, backend) {
        var _this = this;
        this.ready = false;
        connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.Starting });
        if (this.nailgunProcess) {
            Log_1.Log.log('gracefully shutting down nailgun server');
            var shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ng-stop');
            this.nailgunProcess = null;
            shutDownNailgunProcess.on('exit', function (code, signal) {
                Log_1.Log.log("nailgun server is stopped");
                //restart
                _this.startNailgunServer(connection, backend);
            });
        }
        else {
            //first -> only start
            this.startNailgunServer(connection, backend);
        }
    };
    NailgunService.prototype.killNailgunServer = function () {
        Log_1.Log.log('killing nailgun server, this may leave its sub processes running');
        //this.nailgunProcess.kill('SIGINT');
        process.kill(this.nailgunProcess.pid);
    };
    NailgunService.prototype.startVerificationProcess = function (fileToVerify, ideMode, onlyTypeCheck, backend, getTrace) {
        var command = this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ' + backend.mainMethod + ' --ideMode ' + (getTrace ? '--logLevel trace ' : '') + fileToVerify;
        Log_1.Log.log(command);
        return child_process.exec(command); // to set current working directory use, { cwd: verifierHome } as an additional parameter
    };
    NailgunService.prototype.startNailgunIfNotRunning = function (connection, backend) {
        //startNailgun if it is not already running:
        if (!this.nailgunStarted()) {
            this.startNailgunServer(connection, backend);
        }
    };
    return NailgunService;
}());
exports.NailgunService = NailgunService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFpbGd1blNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL05haWxndW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLElBQU8sYUFBYSxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBR2hELG9CQUFrQixPQUNsQixDQUFDLENBRHdCO0FBQ3pCLHlCQUFvQyxZQUNwQyxDQUFDLENBRCtDO0FBQ2hELDhCQUF5QyxpQkFFekMsQ0FBQyxDQUZ5RDtBQUUxRDtJQUFBO1FBRUksVUFBSyxHQUFZLEtBQUssQ0FBQztRQUN2QixnQkFBVyxHQUFHLE1BQU0sQ0FBQztJQTZGekIsQ0FBQztJQTFGRyx1Q0FBYyxHQUFkLFVBQWUsUUFBcUI7UUFDaEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7SUFDN0IsQ0FBQztJQUVNLHVDQUFjLEdBQXJCO1FBQ0ksTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsSUFBSSxJQUFJLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRU8sMkNBQWtCLEdBQTFCLFVBQTJCLFVBQVUsRUFBRSxPQUFnQjtRQUF2RCxpQkFnQ0M7UUEvQkcsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3pCLFNBQUcsQ0FBQyxHQUFHLENBQUMsZ0NBQWdDLEdBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFBO1lBQzNELElBQUkscUJBQXFCLEdBQUcsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsR0FBRyxrQkFBa0IsR0FBRyxJQUFJLENBQUMsV0FBVyxHQUFHLFVBQVUsQ0FBQyxDQUFDO1lBRWpJLHFCQUFxQixDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsVUFBQyxJQUFJLEVBQUUsTUFBTTtnQkFDMUMsU0FBRyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFD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