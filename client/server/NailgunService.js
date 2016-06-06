'use strict';
var child_process = require('child_process');
var Log_1 = require('./Log');
var Settings_1 = require('./Settings');
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
    NailgunService.prototype.startNailgunServer = function (connection) {
        var _this = this;
        if (!this.nailgunStarted()) {
            var killOldNailgunProcess = child_process.exec('ng --nailgun-port ' + this.nailgunPort + ' ng-stop');
            killOldNailgunProcess.on('exit', function (code, signal) {
                Log_1.Log.log('starting nailgun server');
                //start the nailgun server for both silicon and carbon
                var backendJars = Settings_1.Settings.backendJars(_this.settings);
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
                            connection.sendNotification({ method: "NailgunReady" });
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
        if (this.nailgunProcess) {
            Log_1.Log.log('shutting down nailgun server');
            this.nailgunProcess.kill('SIGINT');
        }
    };
    NailgunService.prototype.startVerificationProcess = function (fileToVerify, ideMode, onlyTypeCheck, backend) {
        var command = this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ' + backend.mainMethod + ' --ideMode --logLevel trace ' + fileToVerify;
        Log_1.Log.log(command);
        return child_process.exec(command); // to set current working directory use, { cwd: verifierHome } as an additional parameter
    };
    NailgunService.prototype.startNailgunIfNotRunning = function (connection) {
        //startNailgun if it is not already running:
        if (!this.nailgunStarted()) {
            this.startNailgunServer(connection);
        }
    };
    return NailgunService;
}());
exports.NailgunService = NailgunService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFpbGd1blNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL05haWxndW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLElBQU8sYUFBYSxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBR2hELG9CQUFrQixPQUNsQixDQUFDLENBRHdCO0FBQ3pCLHlCQUFvQyxZQUVwQyxDQUFDLENBRitDO0FBRWhEO0lBQUE7UUFFSSxVQUFLLEdBQVksS0FBSyxDQUFDO1FBQ3ZCLGdCQUFXLEdBQUcsTUFBTSxDQUFDO0lBOER6QixDQUFDO0lBM0RHLHVDQUFjLEdBQWQsVUFBZSxRQUFxQjtRQUNoQyxJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztJQUM3QixDQUFDO0lBRU0sdUNBQWMsR0FBckI7UUFDSSxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxJQUFJLElBQUksQ0FBQyxDQUFDO0lBQ3pDLENBQUM7SUFFTywyQ0FBa0IsR0FBMUIsVUFBMkIsVUFBVTtRQUFyQyxpQkE4QkM7UUE3QkcsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRXpCLElBQUkscUJBQXFCLEdBQUcsYUFBYSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUMsV0FBVyxHQUFHLFVBQVUsQ0FBQyxDQUFDO1lBRXJHLHFCQUFxQixDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsVUFBQyxJQUFJLEVBQUUsTUFBTTtnQkFDMUMsU0FBRyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO2dCQUNuQyxzREFBc0Q7Z0JBRXRELElBQUksV0FBVyxHQUFHLG1CQUFRLENBQUMsV0FBVyxDQUFDLEtBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFFdEQsSUFBSSxPQUFPLEdBQUcsV0FBVyxHQUFHLEtBQUksQ0FBQyxRQUFRLENBQUMs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