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
        this.isJreInstalled().then((jreInstalled) => {
            if (!jreInstalled) {
                Log_1.Log.hint("Jre is not installed. Please intall it.");
                return;
            }
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
                        if (this.settings.lowLevelDebug) {
                            Log_1.Log.logWithOrigin('NS', data);
                        }
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
        });
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
        let command = this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ' + backend.mainMethod + ' --ideMode' + ' --z3Exe "' + this.settings.z3Executable + '" ' + (backend.getTrace ? '--logLevel trace ' : '') + '"' + fileToVerify + '"';
        Log_1.Log.log(command);
        return child_process.exec(command); // to set current working directory use, { cwd: verifierHome } as an additional parameter
    }
    startNailgunIfNotRunning(connection, backend) {
        //startNailgun if it is not already running:
        if (!this.nailgunStarted()) {
            this.startNailgunServer(connection, backend);
        }
    }
    isJreInstalled() {
        Log_1.Log.log("Check if Jre is installed");
        return new Promise((resolve, reject) => {
            let jreTester = child_process.exec("java -version");
            jreTester.stderr.on('data', (data) => {
                if (data.startsWith('java version')) {
                    return resolve(true);
                }
                else {
                    return resolve(false);
                }
            });
        });
    }
}
exports.NailgunService = NailgunService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFpbGd1blNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL05haWxndW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sYUFBYSxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBRWhELHNCQUFrQixPQUNsQixDQUFDLENBRHdCO0FBQ3pCLDJCQUF1QixZQUN2QixDQUFDLENBRGtDO0FBQ25DLGdDQUFnRSxpQkFFaEUsQ0FBQyxDQUZnRjtBQUVqRjtJQUFBO1FBRUksVUFBSyxHQUFZLEtBQUssQ0FBQztRQUN2QixnQkFBVyxHQUFHLE1BQU0sQ0FBQztJQStIekIsQ0FBQztJQTVIRyxjQUFjLENBQUMsUUFBdUI7UUFDbEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7SUFDN0IsQ0FBQztJQUVNLGNBQWM7UUFDakIsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsSUFBSSxJQUFJLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRU8sa0JBQWtCLENBQUMsVUFBVSxFQUFFLE9BQWdCO1FBQ25ELElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxZQUFZO1lBQ3BDLEVBQUUsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztnQkFDaEIsU0FBRyxDQUFDLElBQUksQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO2dCQUNwRCxNQUFNLENBQUM7WUFDWCxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN6QixTQUFHLENBQUMsR0FBRyxDQUFDLGdDQUFnQyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQTtnQkFDNUQsSUFBSSxxQkFBcUIsR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxHQUFHLGtCQUFrQixHQUFH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