'use strict';
const child_process = require('child_process');
const Log_1 = require('./Log');
const Settings_1 = require('./Settings');
const ViperProtocol_1 = require('./ViperProtocol');
const ServerClass_1 = require('./ServerClass');
class NailgunService {
    constructor() {
        this.instanceCount = 0;
        this._ready = false;
        this.reverifyWhenBackendReady = true;
        this.maxNumberOfRetries = 20;
    }
    isReady() {
        return this._ready;
    }
    setReady(backend) {
        this._ready = true;
        NailgunService.startingOrRestarting = false;
        Log_1.Log.log("The backend is ready for verification", ViperProtocol_1.LogLevel.Info);
        ServerClass_1.Server.sendBackendReadyNotification({ name: this.activeBackend.name, restarted: this.reverifyWhenBackendReady });
    }
    setStopping() {
        this._ready = false;
        NailgunService.startingOrRestarting = false;
        ServerClass_1.Server.sendStateChangeNotification({ newState: ViperProtocol_1.VerificationState.Stopping });
    }
    setStopped() {
        Log_1.Log.log("Set Stopped ", ViperProtocol_1.LogLevel.Debug);
        this._ready = false;
        NailgunService.startingOrRestarting = false;
        ServerClass_1.Server.sendStateChangeNotification({ newState: ViperProtocol_1.VerificationState.Stopped });
    }
    //TODO: move to VerificationTask
    //TODO: resolve only after completion 
    static stopAllRunningVerifications() {
        return new Promise((resolve, reject) => {
            if (ServerClass_1.Server.verificationTasks && ServerClass_1.Server.verificationTasks.size > 0) {
                Log_1.Log.log("Stop all running verificationTasks before restarting backend", ViperProtocol_1.LogLevel.Debug);
                ServerClass_1.Server.verificationTasks.forEach(task => { task.abortVerification(); });
            }
            resolve(true);
        });
    }
    startOrRestartNailgunServer(backend, reverifyWhenBackendReady) {
        try {
            this.reverifyWhenBackendReady = reverifyWhenBackendReady;
            if (NailgunService.startingOrRestarting) {
                Log_1.Log.log("Server is already starting or restarting, don't restart", ViperProtocol_1.LogLevel.Debug);
                return;
            }
            //Stop all running verificationTasks before restarting backend
            NailgunService.stopAllRunningVerifications().then(done => {
                //check java version
                this.isJreInstalled().then(jreInstalled => {
                    if (!jreInstalled) {
                        Log_1.Log.hint("No compatible Java 8 (64bit) Runtime Environment is installed. Please install it.");
                        this.setStopped();
                        return;
                    }
                    this.activeBackend = backend;
                    if (!backend.useNailgun) {
                        //In nailgun is disabled, don't start it
                        this.setReady(this.activeBackend);
                        return;
                    }
                    this.stopNailgunServer().then(success => {
                        NailgunService.startingOrRestarting = true;
                        Log_1.Log.log('starting nailgun server', ViperProtocol_1.LogLevel.Info);
                        //notify client
                        ServerClass_1.Server.sendBackendChangeNotification(backend.name);
                        ServerClass_1.Server.sendStateChangeNotification({ newState: ViperProtocol_1.VerificationState.Starting, backendName: backend.name });
                        let backendJars = Settings_1.Settings.backendJars(backend);
                        let command = 'java -Xmx2048m -Xss16m -cp "' + Settings_1.Settings.settings.nailgunSettings.serverJar + '"' + backendJars + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + Settings_1.Settings.settings.nailgunSettings.port;
                        Log_1.Log.log(command, ViperProtocol_1.LogLevel.Debug);
                        this.instanceCount++;
                        this.startNailgunTimeout(this.instanceCount);
                        this.nailgunProcess = child_process.exec(command);
                        this.nailgunProcess.stdout.on('data', (data) => {
                            Log_1.Log.logWithOrigin('NS', data, ViperProtocol_1.LogLevel.LowLevelDebug);
                            if (data.indexOf("started") > 0) {
                                this.waitForNailgunToStart(this.maxNumberOfRetries).then(success => {
                                    if (success) {
                                        //the nailgun server is confirmed to be running
                                        this.setReady(this.activeBackend);
                                    }
                                    else {
                                        this.setStopped();
                                    }
                                }, reject => {
                                    Log_1.Log.error("waitForNailgunToStart was rejected");
                                    this.setStopped();
                                });
                            }
                        });
                    }, reject => {
                        Log_1.Log.error("stopNailgunServer was rejected");
                        this.setStopped();
                    });
                });
            }, reject => {
                Log_1.Log.error("stopAllRunningVerifications was rejected");
                this.setStopped();
            });
        }
        catch (e) {
            Log_1.Log.error("Error starting or restarting nailgun server");
            this.setStopped();
            return;
        }
    }
    startNailgunTimeout(instanceCount) {
        if (Settings_1.Settings.settings.nailgunSettings.timeout) {
            setTimeout(() => {
                //Log.log("check for nailgun timeout", LogLevel.Debug);
                if (!this.isReady() && this.instanceCount == instanceCount) {
                    Log_1.Log.hint("The nailgun server startup timed out after " + Settings_1.Settings.settings.nailgunSettings.timeout + "ms");
                    this.stopNailgunServer();
                }
            }, Settings_1.Settings.settings.nailgunSettings.timeout);
        }
    }
    waitForNailgunToStart(retriesLeft) {
        return new Promise((resolve, reject) => {
            try {
                if (!NailgunService.startingOrRestarting) {
                    //this can happen due to a timeout
                    Log_1.Log.log("WARNING: while waiting for nailgun server to start, the start is aborted, possibly due to a timeout.", ViperProtocol_1.LogLevel.Debug);
                    resolve(false);
                    return;
                }
                if (retriesLeft <= 0) {
                    Log_1.Log.log("A problem with nailgun was detected, Nailgun cannot be started.", ViperProtocol_1.LogLevel.Default);
                    resolve(false);
                    return;
                }
                this.isNailgunServerReallyRunning().then(running => {
                    if (running) {
                        resolve(true);
                    }
                    else {
                        Log_1.Log.log("Nailgun server should be running, however, it is not running yet. -> retry after 100ms", ViperProtocol_1.LogLevel.Info);
                        setTimeout(() => {
                            this.waitForNailgunToStart(retriesLeft - 1).then(success => {
                                resolve(success);
                            }, reject => {
                                resolve(false);
                            });
                        }, 100);
                    }
                });
            }
            catch (e) {
                Log_1.Log.error("Error waiting for nailgun to start " + e);
                resolve(false);
            }
        });
    }
    stopNailgunServer() {
        return new Promise((resolve, reject) => {
            try {
                this.setStopping();
                Log_1.Log.log("gracefully shutting down nailgun server on port: " + Settings_1.Settings.settings.nailgunSettings.port, ViperProtocol_1.LogLevel.Info);
                let shutDownNailgunProcess = child_process.exec('"' + Settings_1.Settings.settings.nailgunSettings.clientExecutable + '" --nailgun-port ' + Settings_1.Settings.settings.nailgunSettings.port + ' ng-stop');
                shutDownNailgunProcess.on('exit', (code, signal) => {
                    Log_1.Log.log("nailgun server is stopped", ViperProtocol_1.LogLevel.Info);
                    this.setStopped();
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
        let program = this.activeBackend.useNailgun ? Settings_1.Settings.settings.nailgunSettings.clientExecutable : "java";
        let command = '"' + program + '" ' + Settings_1.Settings.expandCustomArguments(stage, fileToVerify, this.activeBackend);
        Log_1.Log.log(command, ViperProtocol_1.LogLevel.Debug);
        let verifyProcess = child_process.exec(command, { maxBuffer: 1024 * Settings_1.Settings.settings.verificationBufferSize, cwd: Settings_1.Settings.workspace });
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
        Settings_1.Settings.checkSettings();
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
            let command = '"' + Settings_1.Settings.settings.nailgunSettings.clientExecutable + '" --nailgun-port ' + Settings_1.Settings.settings.nailgunSettings.port + " NOT_USED_CLASS_NAME";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFpbGd1blNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL05haWxndW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sYUFBYSxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBRWhELHNCQUFrQixPQUNsQixDQUFDLENBRHdCO0FBQ3pCLDJCQUF1QixZQUN2QixDQUFDLENBRGtDO0FBQ25DLGdDQUFtRixpQkFDbkYsQ0FBQyxDQURtRztBQUNwRyw4QkFBcUIsZUFBZSxDQUFDLENBQUE7QUFHckM7SUFBQTtRQUVJLGtCQUFhLEdBQVcsQ0FBQyxDQUFDO1FBRWxCLFdBQU0sR0FBWSxLQUFLLENBQUM7UUFHaEMsNkJBQXdCLEdBQVksSUFBSSxDQUFDO1FBRXpDLHVCQUFrQixHQUFHLEVBQUUsQ0FBQztJQXNSNUIsQ0FBQztJQWpSVSxPQUFPO1FBQ1YsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7SUFDdkIsQ0FBQztJQUVNLFFBQVEsQ0FBQyxPQUFnQjtRQUM1QixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztRQUNuQixjQUFjLENBQUMsb0JBQW9CLEdBQUcsS0FBSyxDQUFDO1FBQzVDLFNBQUcsQ0FBQyxHQUFHLENBQUMsdUNBQXVDLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoRSxvQkFBTSxDQUFDLDRCQUE0QixDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO0lBQ3JILENBQUM7SUFFTSxXQUFXO1FBQ2QsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFDcEIsY0FBYyxDQUFDLG9CQUFvQixHQUFHLEtBQUssQ0FBQztRQUM1QyxvQkFBTSxDQUFDLDJCQUEyQixDQUFDLEVBQUUsUUFBUSxFQUFFLGlD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