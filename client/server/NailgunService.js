'use strict';
const child_process = require('child_process');
const Log_1 = require('./Log');
const Settings_1 = require('./Settings');
const ViperProtocol_1 = require('./ViperProtocol');
const ServerClass_1 = require('./ServerClass');
class NailgunService {
    constructor() {
        this._ready = false;
        this.maxNumberOfRetries = 20;
    }
    changeSettings(settings) {
        this.settings = settings;
    }
    isReady() {
        return this._ready;
    }
    setReady(backend) {
        this._ready = true;
        Log_1.Log.log("Nailgun started", ViperProtocol_1.LogLevel.Info);
        ServerClass_1.Server.sendBackendStartedNotification({ name: this.activeBackend.name, reverify: true });
    }
    setStopping() {
        this._ready = false;
        ServerClass_1.Server.sendStateChangeNotification({ newState: ViperProtocol_1.VerificationState.Stopping });
    }
    startOrRestartNailgunServer(backend) {
        if (NailgunService.startingOrRestarting) {
            Log_1.Log.log("Server is already starting or restarting, don't restart", ViperProtocol_1.LogLevel.Debug);
            return;
        }
        NailgunService.startingOrRestarting = true;
        //Stop all running verificationTasks before restarting backend
        if (ServerClass_1.Server.verificationTasks && ServerClass_1.Server.verificationTasks.size > 0) {
            Log_1.Log.log("Stop all running verificationTasks before restarting backend", ViperProtocol_1.LogLevel.Debug);
            ServerClass_1.Server.verificationTasks.forEach(task => { task.abortVerification(); });
        }
        //check java version
        this.isJreInstalled().then(jreInstalled => {
            if (!jreInstalled) {
                Log_1.Log.hint("No compatible Java 8 (64bit) Runtime Environment is installed. Please install it.");
                ServerClass_1.Server.sendStateChangeNotification({ newState: ViperProtocol_1.VerificationState.Stopped });
                return;
            }
            this.activeBackend = backend;
            this.stopNailgunServer().then(resolve => {
                Log_1.Log.log('starting nailgun server', ViperProtocol_1.LogLevel.Info);
                //notify client
                ServerClass_1.Server.sendBackendChangeNotification(backend.name);
                ServerClass_1.Server.sendStateChangeNotification({ newState: ViperProtocol_1.VerificationState.Starting, backendName: backend.name });
                let backendJars = Settings_1.Settings.backendJars(backend);
                let command = 'java -Xmx2048m -Xss16m -cp ' + this.settings.nailgunServerJar + backendJars + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + this.settings.nailgunPort;
                Log_1.Log.log(command, ViperProtocol_1.LogLevel.Debug);
                this.nailgunProcess = child_process.exec(command);
                this.nailgunProcess.stdout.on('data', (data) => {
                    Log_1.Log.logWithOrigin('NS', data, ViperProtocol_1.LogLevel.LowLevelDebug);
                    if (data.indexOf("started") > 0) {
                        this.waitForNailgunToStart(this.maxNumberOfRetries);
                    }
                });
            });
        });
    }
    waitForNailgunToStart(retriesLeft) {
        if (retriesLeft <= 0) {
            Log_1.Log.log("A problem with nailgun was detected, Nailgun cannot be started.", ViperProtocol_1.LogLevel.Default);
            NailgunService.startingOrRestarting = false;
            return;
        }
        this.isNailgunServerReallyRunning().then(running => {
            if (!running) {
                Log_1.Log.log("Nailgun server should be running, however, it is not running yet. -> retry after 100ms", ViperProtocol_1.LogLevel.Info);
                setTimeout(() => {
                    this.waitForNailgunToStart(retriesLeft - 1);
                }, 100);
            }
            else {
                //the nailgun server is confirmed to be running
                NailgunService.startingOrRestarting = false;
                this.setReady(this.activeBackend);
            }
        });
    }
    stopNailgunServer() {
        return new Promise((resolve, reject) => {
            try {
                this.setStopping();
                Log_1.Log.log("gracefully shutting down nailgun server on port: " + this.settings.nailgunPort, ViperProtocol_1.LogLevel.Info);
                let shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ng-stop');
                shutDownNailgunProcess.on('exit', (code, signal) => {
                    Log_1.Log.log("nailgun server is stopped", ViperProtocol_1.LogLevel.Info);
                    return resolve(true);
                });
                this.nailgunProcess = null;
                Log_1.Log.logOutput(shutDownNailgunProcess, "NG stopper");
            }
            catch (e) {
                Log_1.Log.error("Error stopping nailgun server: " + e);
                resolve(false);
            }
        });
    }
    killNgDeamon() {
        return new Promise((resolve, reject) => {
            this.setStopping();
            Log_1.Log.log("Killing ng deamon", ViperProtocol_1.LogLevel.Info);
            let ngKiller = child_process.exec("taskkill /F /im ng.exe");
            ngKiller.on("exit", (data) => {
                Log_1.Log.log("kill ng.exe: " + data, ViperProtocol_1.LogLevel.Debug);
                return resolve(false);
            });
            Log_1.Log.logOutput(ngKiller, "kill ng.exe");
        });
    }
    //unused
    // private killNailgunServer() {
    //     Log.log('killing nailgun server, this may leave its sub processes running', LogLevel.Debug);
    //     //this.nailgunProcess.kill('SIGINT');
    //     process.kill(this.nailgunProcess.pid);
    //     this.nailgunProcess = null;
    // }
    startStageProcess(fileToVerify, stage, onData, onError, onClose) {
        let command = this.settings.nailgunClient + ' ' + Settings_1.Settings.completeNGArguments(stage, fileToVerify);
        Log_1.Log.log(command, ViperProtocol_1.LogLevel.Debug);
        let verifyProcess = child_process.exec(command, { cwd: Settings_1.Settings.workspace });
        verifyProcess.stdout.on('data', onData);
        verifyProcess.stderr.on('data', onError);
        verifyProcess.on('close', onClose);
        return verifyProcess;
    }
    //currently unused, the purpose of this method is to trigger a repeated settings check
    tryToStartNailgunServer(backend) {
        if (this._ready || NailgunService.startingOrRestarting || this.nailgunProcess)
            return;
        //repeat the settings check
        Settings_1.Settings.checkSettings(this.settings);
        if (Settings_1.Settings.valid()) {
            //since the nailgun server is not started, do that now
            this.startOrRestartNailgunServer(backend);
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
                if (data.startsWith("java.lang.ClassNotFoundException:")) {
                    return resolve(true);
                }
                else {
                    return resolve(false);
                }
            });
        });
    }
    isJreInstalled() {
        Log_1.Log.log("Check if Jre is installed", ViperProtocol_1.LogLevel.Verbose);
        return new Promise((resolve, reject) => {
            let jreTester = child_process.exec("java -version");
            jreTester.stdout.on('data', (data) => {
                Log_1.Log.toLogFile("[Java checker]: " + data, ViperProtocol_1.LogLevel.LowLevelDebug);
                if (this.findAppropriateVersion(data))
                    return resolve(true);
            });
            jreTester.stderr.on('data', (data) => {
                Log_1.Log.toLogFile("[Java checker stderr]: " + data, ViperProtocol_1.LogLevel.LowLevelDebug);
                if (this.findAppropriateVersion(data))
                    return resolve(true);
            });
            jreTester.on('exit', () => {
                Log_1.Log.toLogFile("[Java checker done]", ViperProtocol_1.LogLevel.LowLevelDebug);
                return resolve(false);
            });
        });
    }
    findAppropriateVersion(s) {
        let match = /([1-9]\d*)\.(\d+)\.(\d+)/.exec(s);
        if (match && match[1] && match[2] && match[3]) {
            return +match[1] > 1 || (+match[1] === 1 && +match[2] >= NailgunService.REQUIRED_JAVA_VERSION);
        }
    }
}
NailgunService.REQUIRED_JAVA_VERSION = 8;
NailgunService.startingOrRestarting = false;
exports.NailgunService = NailgunService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFpbGd1blNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL05haWxndW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sYUFBYSxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBRWhELHNCQUFrQixPQUNsQixDQUFDLENBRHdCO0FBQ3pCLDJCQUF1QixZQUN2QixDQUFDLENBRGtDO0FBQ25DLGdDQUF5RyxpQkFDekcsQ0FBQyxDQUR5SDtBQUMxSCw4QkFBcUIsZUFBZSxDQUFDLENBQUE7QUFHckM7SUFBQTtRQUdZLFdBQU0sR0FBWSxLQUFLLENBQUM7UUFJaEMsdUJBQWtCLEdBQUcsRUFBRSxDQUFDO0lBNkw1QixDQUFDO0lBeExVLGNBQWMsQ0FBQyxRQUF1QjtRQUN6QyxJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztJQUM3QixDQUFDO0lBRU0sT0FBTztRQUNWLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3ZCLENBQUM7SUFFTSxRQUFRLENBQUMsT0FBZ0I7UUFDNUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7UUFDbkIsU0FBRyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzFDLG9CQUFNLENBQUMsOEJBQThCLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFDN0YsQ0FBQztJQUVNLFdBQVc7UUFDZCxJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztRQUNwQixvQkFBTSxDQUFDLDJCQUEyQixDQUFDLEVBQUUsUUFBUSxFQUFFLGlDQUFpQixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDakYsQ0FBQztJQUVNLDJCQUEyQixDQUFDLE9BQWdCO1FBQy9DLEVBQUUs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