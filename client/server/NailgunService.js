'use strict';
const child_process = require('child_process');
const Log_1 = require('./Log');
const Settings_1 = require('./Settings');
class NailgunService {
    constructor() {
        this.ready = false;
        this.nailgunPort = "7654";
    }
    changeSettings(settings) {
        this.settings = settings;
    }
    nailgunStarted() {
        return (this.nailgunProcess != null);
    }
    startNailgunServer(connection) {
        if (!this.nailgunStarted()) {
            let killOldNailgunProcess = child_process.exec('ng --nailgun-port ' + this.nailgunPort + ' ng-stop');
            killOldNailgunProcess.on('exit', (code, signal) => {
                Log_1.Log.log('starting nailgun server');
                //start the nailgun server for both silicon and carbon
                let backendJars = Settings_1.Settings.backendJars(this.settings);
                let command = 'java -cp ' + this.settings.nailgunServerJar + backendJars + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + this.nailgunPort;
                Log_1.Log.log(command);
                this.nailgunProcess = child_process.exec(command);
                this.nailgunProcess.stdout.on('data', (data) => {
                    //Log.logWithOrigin('NS', data);
                    let dataS = data;
                    if (dataS.indexOf("started") > 0) {
                        let tempProcess = this.startVerificationProcess("", false, false, this.settings.verificationBackends[0]);
                        tempProcess.on('exit', (code, signal) => {
                            this.ready = true;
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
    }
    stopNailgunServer() {
        if (this.nailgunProcess) {
            Log_1.Log.log('shutting down nailgun server');
            this.nailgunProcess.kill('SIGINT');
        }
    }
    startVerificationProcess(fileToVerify, ideMode, onlyTypeCheck, backend) {
        let command = this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ' + backend.mainMethod + ' --ideMode --logLevel trace ' + fileToVerify;
        Log_1.Log.log(command);
        return child_process.exec(command); // to set current working directory use, { cwd: verifierHome } as an additional parameter
    }
    startNailgunIfNotRunning(connection) {
        //startNailgun if it is not already running:
        if (!this.nailgunStarted()) {
            this.startNailgunServer(connection);
        }
    }
}
exports.NailgunService = NailgunService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFpbGd1blNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL05haWxndW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sYUFBYSxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBR2hELHNCQUFrQixPQUNsQixDQUFDLENBRHdCO0FBQ3pCLDJCQUFvQyxZQUVwQyxDQUFDLENBRitDO0FBRWhEO0lBQUE7UUFFSSxVQUFLLEdBQVksS0FBSyxDQUFDO1FBQ3ZCLGdCQUFXLEdBQUcsTUFBTSxDQUFDO0lBOER6QixDQUFDO0lBM0RHLGNBQWMsQ0FBQyxRQUFxQjtRQUNoQyxJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztJQUM3QixDQUFDO0lBRU0sY0FBYztRQUNqQixNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxJQUFJLElBQUksQ0FBQyxDQUFDO0lBQ3pDLENBQUM7SUFFTyxrQkFBa0IsQ0FBQyxVQUFVO1FBQ2pDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUV6QixJQUFJLHFCQUFxQixHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDLFdBQVcsR0FBRyxVQUFVLENBQUMsQ0FBQztZQUVyRyxxQkFBcUIsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxFQUFFLE1BQU07Z0JBQzFDLFNBQUcsQ0FBQyxHQUFHLENBQUMseUJBQXlCLENBQUMsQ0FBQztnQkFDbkMsc0RBQXNEO2dCQUV0RCxJQUFJLFdBQVcsR0FBRyxtQkFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBRXRELElBQUksT0FBTyxHQUFHLFdBQVcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixHQUFHLFdBQVcsR0FBRywwREFBMEQsR0FB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