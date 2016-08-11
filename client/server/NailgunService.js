'use strict';
const child_process = require('child_process');
const Log_1 = require('./Log');
const Settings_1 = require('./Settings');
const ViperProtocol_1 = require('./ViperProtocol');
class NailgunService {
    constructor() {
        this.ready = false;
        this.maxNumberOfRetries = 20;
    }
    changeSettings(settings) {
        this.settings = settings;
    }
    nailgunStarted() {
        return (this.nailgunProcess != null);
    }
    //NailgunService.startingOrRestarting must be set to true before calling this method
    startNailgunServer(connection, backend) {
        this.isJreInstalled().then((jreInstalled) => {
            if (!jreInstalled) {
                Log_1.Log.hint("Java 8 (64bit) Runtime Environment is not installed. Please install it.");
                return;
            }
            connection.sendNotification(ViperProtocol_1.Commands.BackendChange, backend.name);
            if (!this.nailgunStarted()) {
                Log_1.Log.log("close nailgun server on port: " + this.settings.nailgunPort, ViperProtocol_1.LogLevel.Info);
                let killOldNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ng-stop');
                Log_1.Log.logOutput(killOldNailgunProcess, "NG killer");
                killOldNailgunProcess.on('exit', (code, signal) => {
                    Log_1.Log.log('starting nailgun server', ViperProtocol_1.LogLevel.Info);
                    //start the nailgun server for both silicon and carbon
                    let backendJars = Settings_1.Settings.backendJars(backend);
                    //Log.log("Backend Jars: " + backendJars,LogLevel.Debug);
                    let command = 'java -Xmx2048m -Xss16m -cp ' + this.settings.nailgunServerJar + backendJars + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + this.settings.nailgunPort;
                    Log_1.Log.log(command, ViperProtocol_1.LogLevel.Debug);
                    this.nailgunProcess = child_process.exec(command);
                    this.nailgunProcess.stdout.on('data', (data) => {
                        Log_1.Log.logWithOrigin('NS', data, ViperProtocol_1.LogLevel.LowLevelDebug);
                        let dataS = data;
                        if (dataS.indexOf("started") > 0) {
                            this.waitForNailgunToStart(this.maxNumberOfRetries, connection);
                        }
                    });
                    Log_1.Log.logOutput(killOldNailgunProcess, "NS stopper");
                });
            }
            else {
                Log_1.Log.log('nailgun server already running', ViperProtocol_1.LogLevel.Info);
            }
            ;
        });
        NailgunService.startingOrRestarting = false;
    }
    waitForNailgunToStart(retriesLeft, connection) {
        if (retriesLeft <= 0) {
            Log_1.Log.log("A problem with nailgun was detected, Nailgun cannot be started.", ViperProtocol_1.LogLevel.Default);
            return;
        }
        this.isNailgunServerReallyRunning().then(running => {
            if (!running) {
                Log_1.Log.log("Nailgun server should be running, however, it is not running yet. -> retry after 100ms", ViperProtocol_1.LogLevel.Info);
                setTimeout(() => {
                    this.waitForNailgunToStart(retriesLeft - 1, connection);
                }, 100);
            }
            else {
                //the nailgun server is confirmed to be running
                this.ready = true;
                Log_1.Log.log("Nailgun started", ViperProtocol_1.LogLevel.Info);
                connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.Ready, verificationCompleted: false, verificationNeeded: true });
            }
        });
    }
    stopNailgunServer() {
        this.ready = false;
        if (this.nailgunProcess) {
            Log_1.Log.log('gracefully shutting down nailgun server', ViperProtocol_1.LogLevel.Info);
            let shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ng-stop');
            shutDownNailgunProcess.on('exit', (code, signal) => {
                Log_1.Log.log("nailgun server is stopped", ViperProtocol_1.LogLevel.Info);
            });
            Log_1.Log.logOutput(shutDownNailgunProcess, "NG stopper");
        }
        this.nailgunProcess = null;
    }
    killNgDeamon() {
        this.ready = false;
        Log_1.Log.log("Killing ng deamon", ViperProtocol_1.LogLevel.Info);
        let ngKiller = child_process.exec("taskkill /F /im ng.exe");
        ngKiller.on("exit", (data) => {
            Log_1.Log.log("kill ng.exe: " + data, ViperProtocol_1.LogLevel.Debug);
        });
        Log_1.Log.logOutput(ngKiller, "kill ng.exe");
        //TODO: set nailgun to stopped in state
    }
    restartNailgunServer(connection, backend) {
        if (NailgunService.startingOrRestarting) {
            Log_1.Log.log("Server is already starting or restarting, don't restart", ViperProtocol_1.LogLevel.Debug);
            return;
        }
        NailgunService.startingOrRestarting = true;
        this.ready = false;
        connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.Starting, backendName: backend.name });
        if (this.nailgunProcess) {
            Log_1.Log.log('gracefully shutting down nailgun server', ViperProtocol_1.LogLevel.Info);
            let shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ng-stop');
            this.nailgunProcess = null;
            shutDownNailgunProcess.on('exit', (code, signal) => {
                Log_1.Log.log("nailgun server is stopped", ViperProtocol_1.LogLevel.Info);
                //restart
                this.startNailgunServer(connection, backend);
            });
            Log_1.Log.logOutput(shutDownNailgunProcess, "Nailgun stopper2");
        }
        else {
            //first -> only start
            this.startNailgunServer(connection, backend);
        }
    }
    killNailgunServer() {
        Log_1.Log.log('killing nailgun server, this may leave its sub processes running', ViperProtocol_1.LogLevel.Debug);
        //this.nailgunProcess.kill('SIGINT');
        process.kill(this.nailgunProcess.pid);
    }
    startVerificationProcess(fileToVerify, ideMode, onlyTypeCheck, backend) {
        let command = this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ' + backend.mainMethod + ' --ideMode' + ' --z3Exe "' + this.settings.z3Executable + '" ' + (backend.getTrace ? '--logLevel trace ' : '') + (backend.customArguments ? backend.customArguments : "") + ' "' + fileToVerify + '"';
        Log_1.Log.log(command, ViperProtocol_1.LogLevel.Debug);
        return child_process.exec(command, { cwd: Settings_1.Settings.workspace }); // to set current working directory use, { cwd: verifierHome } as an additional parameter
    }
    startNailgunIfNotRunning(connection, backend) {
        if (NailgunService.startingOrRestarting) {
            Log_1.Log.log("Server is already starting or restarting, don't start", ViperProtocol_1.LogLevel.Debug);
            return;
        }
        NailgunService.startingOrRestarting = true;
        //startNailgun if it is not already running:
        if (!this.nailgunStarted()) {
            this.startNailgunServer(connection, backend);
        }
    }
    isNailgunServerReallyRunning() {
        return new Promise((resolve, reject) => {
            if (!this.nailgunProcess) {
                return resolve(false);
            }
            let command = this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + " NOT_USED_CLASS_NAME";
            Log_1.Log.log(command, ViperProtocol_1.LogLevel.Debug);
            let nailgunServerTester = child_process.exec(command);
            nailgunServerTester.stderr.on('data', data => {
                if (data.startsWith("connect: ")) {
                    return resolve(false);
                }
                else if (data.startsWith("java.lang.ClassNotFoundException:")) {
                    return resolve(true);
                }
            });
        });
    }
    isJreInstalled() {
        Log_1.Log.log("Check if Jre is installed", ViperProtocol_1.LogLevel.Info);
        return new Promise((resolve, reject) => {
            let jreTester = child_process.exec("java -version");
            jreTester.stdout.on('data', (data) => {
                Log_1.Log.toLogFile("[Java checker]: " + data, ViperProtocol_1.LogLevel.LowLevelDebug);
                if (data.startsWith('java version')) {
                    return resolve(true);
                }
                else {
                    return resolve(false);
                }
            });
            jreTester.stderr.on('data', (data) => {
                Log_1.Log.toLogFile("[Java checker stderr]: " + data, ViperProtocol_1.LogLevel.LowLevelDebug);
                if (data.startsWith('java version')) {
                    return resolve(true);
                }
                else {
                    return resolve(false);
                }
            });
            jreTester.on('exit', () => {
                Log_1.Log.toLogFile("[Java checker done]", ViperProtocol_1.LogLevel.LowLevelDebug);
                return resolve(false);
            });
        });
    }
}
NailgunService.startingOrRestarting = false;
exports.NailgunService = NailgunService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFpbGd1blNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL05haWxndW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sYUFBYSxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBRWhELHNCQUFrQixPQUNsQixDQUFDLENBRHdCO0FBQ3pCLDJCQUF1QixZQUN2QixDQUFDLENBRGtDO0FBQ25DLGdDQUE0RSxpQkFFNUUsQ0FBQyxDQUY0RjtBQUU3RjtJQUFBO1FBRUksVUFBSyxHQUFZLEtBQUssQ0FBQztRQUV2Qix1QkFBa0IsR0FBRyxFQUFFLENBQUM7SUE0TDVCLENBQUM7SUF4TEcsY0FBYyxDQUFDLFFBQXVCO1FBQ2xDLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO0lBQzdCLENBQUM7SUFFTSxjQUFjO1FBQ2pCLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLElBQUksSUFBSSxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUVELG9GQUFvRjtJQUM1RSxrQkFBa0IsQ0FBQyxVQUFVLEVBQUUsT0FBZ0I7UUFDbkQsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLFlBQVk7WUFDcEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO2dCQUNoQixTQUFHLENBQUMsSUFBSSxDQUFDLHlFQUF5RSxDQUFDLENBQUM7Z0JBQ3BGLE1BQU0sQ0FBQztZQUNYLENBQUM7WUFDRCxVQUFVLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxhQUFhLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDekIsU0FBRyxDQUFDLEdBQUcsQ0FBQyxnQ0FBZ0MsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFdB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