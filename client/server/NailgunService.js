'use strict';
const child_process = require('child_process');
const Log_1 = require('./Log');
const Settings_1 = require('./Settings');
const ViperProtocol_1 = require('./ViperProtocol');
const ServerClass_1 = require('./ServerClass');
class NailgunService {
    constructor() {
        this._ready = false;
        this.reverifyWhenBackendReady = true;
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
        ServerClass_1.Server.sendBackendReadyNotification({ name: this.activeBackend.name, restarted: this.reverifyWhenBackendReady });
    }
    setStopping() {
        this._ready = false;
        ServerClass_1.Server.sendStateChangeNotification({ newState: ViperProtocol_1.VerificationState.Stopping });
    }
    startOrRestartNailgunServer(backend, reverifyWhenBackendReady) {
        try {
            this.reverifyWhenBackendReady = reverifyWhenBackendReady;
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
        catch (e) {
            Log_1.Log.error("Error starting or restarting nailgun server");
        }
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
            this.startOrRestartNailgunServer(backend, true);
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
            let is64bit = false;
            let resolved = false;
            jreTester.stdout.on('data', (data) => {
                Log_1.Log.toLogFile("[Java checker]: " + data, ViperProtocol_1.LogLevel.LowLevelDebug);
                is64bit = is64bit || data.indexOf("64") >= 0;
                if (!resolved && this.findAppropriateVersion(data)) {
                    resolved = true;
                    resolve(true);
                }
            });
            jreTester.stderr.on('data', (data) => {
                Log_1.Log.toLogFile("[Java checker stderr]: " + data, ViperProtocol_1.LogLevel.LowLevelDebug);
                is64bit = is64bit || data.indexOf("64") >= 0;
                if (!resolved && this.findAppropriateVersion(data)) {
                    resolved = true;
                    resolve(true);
                }
            });
            jreTester.on('exit', () => {
                Log_1.Log.toLogFile("[Java checker done]", ViperProtocol_1.LogLevel.LowLevelDebug);
                if (!is64bit) {
                    Log_1.Log.error("Your java version is not 64-bit. The nailgun server will possibly not work");
                }
                if (!resolved)
                    resolve(false);
            });
        });
    }
    findAppropriateVersion(s) {
        try {
            let match = /([1-9]\d*)\.(\d+)\.(\d+)/.exec(s);
            if (match && match[1] && match[2] && match[3]) {
                let major = Number.parseInt(match[1]);
                let minor = Number.parseInt(match[2]);
                return major > 1 || (major === 1 && minor >= NailgunService.REQUIRED_JAVA_VERSION);
            }
        }
        catch (e) {
            Log_1.Log.error("Error checking for the right java version: " + e);
        }
    }
}
NailgunService.REQUIRED_JAVA_VERSION = 8;
NailgunService.startingOrRestarting = false;
exports.NailgunService = NailgunService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFpbGd1blNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL05haWxndW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sYUFBYSxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBRWhELHNCQUFrQixPQUNsQixDQUFDLENBRHdCO0FBQ3pCLDJCQUF1QixZQUN2QixDQUFDLENBRGtDO0FBQ25DLGdDQUFtRixpQkFDbkYsQ0FBQyxDQURtRztBQUNwRyw4QkFBcUIsZUFBZSxDQUFDLENBQUE7QUFHckM7SUFBQTtRQUdZLFdBQU0sR0FBWSxLQUFLLENBQUM7UUFJaEMsNkJBQXdCLEdBQVksSUFBSSxDQUFDO1FBRXpDLHVCQUFrQixHQUFHLEVBQUUsQ0FBQztJQXFONUIsQ0FBQztJQWhOVSxjQUFjLENBQUMsUUFBdUI7UUFDekMsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7SUFDN0IsQ0FBQztJQUVNLE9BQU87UUFDVixNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUN2QixDQUFDO0lBRU0sUUFBUSxDQUFDLE9BQWdCO1FBQzVCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1FBQ25CLFNBQUcsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxQyxvQkFBTSxDQUFDLDRCQUE0QixDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO0lBQ3JILENBQUM7SUFFTSxXQUFXO1FBQ2QsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFDcEIsb0JBQU0sQ0FBQywyQkFBMkIsQ0FBQyxFQUFFLFFBQVEsRUFBRSxpQ0FBaUIsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ2pG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