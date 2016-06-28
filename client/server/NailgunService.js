'use strict';
const child_process = require('child_process');
const Log_1 = require('./Log');
const Settings_1 = require('./Settings');
const ViperProtocol_1 = require('./ViperProtocol');
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
    startNailgunServer(connection, backend) {
        if (!this.nailgunStarted()) {
            Log_1.Log.log("close nailgun server on port: " + this.nailgunPort);
            let killOldNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ng-stop');
            killOldNailgunProcess.on('exit', (code, signal) => {
                Log_1.Log.log('starting nailgun server');
                //start the nailgun server for both silicon and carbon
                let backendJars = Settings_1.Settings.backendJars(backend);
                //Log.log("Backend Jars: " + backendJars);
                let command = 'java -cp ' + this.settings.nailgunServerJar + backendJars + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + this.nailgunPort;
                Log_1.Log.log(command);
                this.nailgunProcess = child_process.exec(command);
                this.nailgunProcess.stdout.on('data', (data) => {
                    //Log.logWithOrigin('NS', data);
                    let dataS = data;
                    if (dataS.indexOf("started") > 0) {
                        //Comment in to perstart JVM
                        //let tempProcess = this.startVerificationProcess("", false, false, this.settings.verificationBackends[0],false);
                        //tempProcess.on('exit', (code, signal) => {
                        this.ready = true;
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
    }
    stopNailgunServer() {
        this.ready = false;
        if (this.nailgunProcess) {
            Log_1.Log.log('gracefully shutting down nailgun server');
            let shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ng-stop');
            shutDownNailgunProcess.on('exit', (code, signal) => {
                Log_1.Log.log("nailgun server is stopped");
            });
        }
        this.nailgunProcess = null;
    }
    killNgDeamon() {
        Log_1.Log.log("Killing ng deamon");
        let ngKiller = child_process.exec("taskkill /F /im ng.exe");
        ngKiller.on("exit", (data) => {
            Log_1.Log.log("Kill ng.exe: " + data);
        });
        this.ready = false;
        //TODO: set nailgun to stopped in state
    }
    restartNailgunServer(connection, backend) {
        this.ready = false;
        connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.Starting });
        if (this.nailgunProcess) {
            Log_1.Log.log('gracefully shutting down nailgun server');
            let shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ng-stop');
            this.nailgunProcess = null;
            shutDownNailgunProcess.on('exit', (code, signal) => {
                Log_1.Log.log("nailgun server is stopped");
                //restart
                this.startNailgunServer(connection, backend);
            });
        }
        else {
            //first -> only start
            this.startNailgunServer(connection, backend);
        }
    }
    killNailgunServer() {
        Log_1.Log.log('killing nailgun server, this may leave its sub processes running');
        //this.nailgunProcess.kill('SIGINT');
        process.kill(this.nailgunProcess.pid);
    }
    startVerificationProcess(fileToVerify, ideMode, onlyTypeCheck, backend) {
        let command = this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ' + backend.mainMethod + ' --ideMode ' + (backend.getTrace ? '--logLevel trace ' : '') + fileToVerify;
        Log_1.Log.log(command);
        return child_process.exec(command); // to set current working directory use, { cwd: verifierHome } as an additional parameter
    }
    startNailgunIfNotRunning(connection, backend) {
        //startNailgun if it is not already running:
        if (!this.nailgunStarted()) {
            this.startNailgunServer(connection, backend);
        }
    }
}
exports.NailgunService = NailgunService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFpbGd1blNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL05haWxndW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sYUFBYSxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBR2hELHNCQUFrQixPQUNsQixDQUFDLENBRHdCO0FBQ3pCLDJCQUFzQyxZQUN0QyxDQUFDLENBRGlEO0FBQ2xELGdDQUEwQyxpQkFFMUMsQ0FBQyxDQUYwRDtBQUUzRDtJQUFBO1FBRUksVUFBSyxHQUFZLEtBQUssQ0FBQztRQUN2QixnQkFBVyxHQUFHLE1BQU0sQ0FBQztJQXVHekIsQ0FBQztJQXBHRyxjQUFjLENBQUMsUUFBdUI7UUFDbEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7SUFDN0IsQ0FBQztJQUVNLGNBQWM7UUFDakIsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsSUFBSSxJQUFJLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRU8sa0JBQWtCLENBQUMsVUFBVSxFQUFFLE9BQWdCO1FBQ25ELEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN6QixTQUFHLENBQUMsR0FBRyxDQUFDLGdDQUFnQyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQTtZQUM1RCxJQUFJLHFCQUFxQixHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLEdBQUcsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLFdBQVcsR0FBRyxVQUFVLENBQUMsQ0FBQztZQUVqSSxxQkFBcUIsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxFQUFFLE1BQU07Z0JBQzFDLFNBQUcsQ0FBQyxHQUFHLENBQUMseUJBQXlCLENBQUMsQ0FBQztnQkFDbkMsc0RBQXNEO2dCQUV0RCxJQUFJLFdBQVcs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