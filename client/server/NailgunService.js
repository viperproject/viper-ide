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
            var killOldNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ng-stop');
            killOldNailgunProcess.on('exit', function (code, signal) {
                Log_1.Log.log('starting nailgun server');
                //start the nailgun server for both silicon and carbon
                var backendJars = Settings_1.Settings.backendJars(backend);
                Log_1.Log.log("Backend Jars: " + backendJars);
                var command = 'java -cp ' + _this.settings.nailgunServerJar + backendJars + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + _this.nailgunPort;
                Log_1.Log.log(command);
                _this.nailgunProcess = child_process.exec(command);
                _this.nailgunProcess.stdout.on('data', function (data) {
                    //Log.logWithOrigin('NS', data);
                    var dataS = data;
                    if (dataS.indexOf("started") > 0) {
                        var tempProcess = _this.startVerificationProcess("", false, false, _this.settings.verificationBackends[0]);
                        tempProcess.on('exit', function (code, signal) {
                            _this.ready = true;
                            Log_1.Log.log("Nailgun started");
                            connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.Ready, firstTime: true });
                        });
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
    NailgunService.prototype.startVerificationProcess = function (fileToVerify, ideMode, onlyTypeCheck, backend) {
        var command = this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ' + backend.mainMethod + ' --ideMode --logLevel trace ' + fileToVerify;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFpbGd1blNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL05haWxndW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLElBQU8sYUFBYSxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBR2hELG9CQUFrQixPQUNsQixDQUFDLENBRHdCO0FBQ3pCLHlCQUFvQyxZQUNwQyxDQUFDLENBRCtDO0FBQ2hELDhCQUF5QyxpQkFFekMsQ0FBQyxDQUZ5RDtBQUUxRDtJQUFBO1FBRUksVUFBSyxHQUFZLEtBQUssQ0FBQztRQUN2QixnQkFBVyxHQUFHLE1BQU0sQ0FBQztJQTJGekIsQ0FBQztJQXhGRyx1Q0FBYyxHQUFkLFVBQWUsUUFBcUI7UUFDaEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7SUFDN0IsQ0FBQztJQUVNLHVDQUFjLEdBQXJCO1FBQ0ksTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsSUFBSSxJQUFJLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRU8sMkNBQWtCLEdBQTFCLFVBQTJCLFVBQVUsRUFBRSxPQUFnQjtRQUF2RCxpQkE4QkM7UUE3QkcsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRXpCLElBQUkscUJBQXFCLEdBQUcsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsR0FBRyxrQkFBa0IsR0FBRyxJQUFJLENBQUMsV0FBVyxHQUFHLFVBQVUsQ0FBQyxDQUFDO1lBRWpJLHFCQUFxQixDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsVUFBQyxJQUFJLEVBQUUsTUFBTTtnQkFDMUMsU0FBRyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO2dCQUNuQyxzREFBc0Q7Z0JBRXRELElBQUksV0FBVyxHQUFHLG1CQUFRLENBQUMsV0FBVyxDQUFDLE9BQU8s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