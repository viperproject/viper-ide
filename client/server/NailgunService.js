'use strict';
const child_process = require('child_process');
const Log_1 = require('./Log');
const Settings_1 = require('./Settings');
const ViperProtocol_1 = require('./ViperProtocol');
const ServerClass_1 = require('./ServerClass');
const VerificationTask_1 = require('./VerificationTask');
class NailgunService {
    constructor() {
        this._ready = false;
        this.maxNumberOfRetries = 20;
    }
    changeSettings(settings) {
        this.settings = settings;
    }
    nailgunStarted() {
        return (this.nailgunProcess != null);
    }
    isReady() {
        return this._ready;
    }
    setReady(connection, backend) {
        this._ready = true;
        Log_1.Log.log("Nailgun started", ViperProtocol_1.LogLevel.Info);
    }
    setStopping(connection) {
        this._ready = false;
        connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.Stopping });
    }
    //NailgunService.startingOrRestarting must be set to true before calling this method
    startNailgunServer(connection, backend) {
        this.isJreInstalled().then(jreInstalled => {
            if (!jreInstalled) {
                Log_1.Log.hint("No compatible Java 8 (64bit) Runtime Environment is installed. Please install it.");
                connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.Stopped });
                return;
            }
            connection.sendNotification(ViperProtocol_1.Commands.BackendChange, backend.name);
            this.activeBackend = backend;
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
                        if (data.indexOf("started") > 0) {
                            this.waitForNailgunToStart(this.maxNumberOfRetries, connection);
                        }
                    });
                    Log_1.Log.logOutput(killOldNailgunProcess, "NS stopper");
                });
            }
            else {
                Log_1.Log.log('nailgun server is already starting or running', ViperProtocol_1.LogLevel.Info);
            }
            ;
        });
    }
    waitForNailgunToStart(retriesLeft, connection) {
        if (retriesLeft <= 0) {
            Log_1.Log.log("A problem with nailgun was detected, Nailgun cannot be started.", ViperProtocol_1.LogLevel.Default);
            NailgunService.startingOrRestarting = false;
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
                NailgunService.startingOrRestarting = false;
                this.setReady(this.activeBackend, connection);
                connection.sendNotification(ViperProtocol_1.Commands.BackendStarted, this.activeBackend.name);
            }
        });
    }
    stopNailgunServer() {
        this.setStopping(VerificationTask_1.VerificationTask.connection);
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
        return new Promise((resolve, reject) => {
            this.setStopping(VerificationTask_1.VerificationTask.connection);
            Log_1.Log.log("Killing ng deamon", ViperProtocol_1.LogLevel.Info);
            let ngKiller = child_process.exec("taskkill /F /im ng.exe");
            ngKiller.on("exit", (data) => {
                Log_1.Log.log("kill ng.exe: " + data, ViperProtocol_1.LogLevel.Debug);
                return resolve(false);
            });
            Log_1.Log.logOutput(ngKiller, "kill ng.exe");
        });
    }
    restartNailgunServer(connection, backend) {
        if (NailgunService.startingOrRestarting) {
            Log_1.Log.log("Server is already starting or restarting, don't restart", ViperProtocol_1.LogLevel.Debug);
            return;
        }
        NailgunService.startingOrRestarting = true;
        //Stop all running verificationTasks before restarting backend
        Log_1.Log.log("Stop all running verificationTasks before restarting backend", ViperProtocol_1.LogLevel.Debug);
        ServerClass_1.Server.verificationTasks.forEach(task => { task.abortVerification(); });
        this.setStopping(connection);
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
    // public startNailgunIfNotRunning(connection, backend: Backend) {
    //     if (NailgunService.startingOrRestarting) {
    //         Log.log("Server is already starting or restarting, don't start", LogLevel.Debug);
    //         return;
    //     }
    //     NailgunService.startingOrRestarting = true;
    //     //startNailgun if it is not already running:
    //     if (!this.nailgunStarted()) {
    //         this.startNailgunServer(connection, backend);
    //     }
    // }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFpbGd1blNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL05haWxndW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sYUFBYSxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBRWhELHNCQUFrQixPQUNsQixDQUFDLENBRHdCO0FBQ3pCLDJCQUF1QixZQUN2QixDQUFDLENBRGtDO0FBQ25DLGdDQUFtRixpQkFDbkYsQ0FBQyxDQURtRztBQUNwRyw4QkFBcUIsZUFBZSxDQUFDLENBQUE7QUFDckMsbUNBQStCLG9CQUUvQixDQUFDLENBRmtEO0FBRW5EO0lBQUE7UUFHWSxXQUFNLEdBQVksS0FBSyxDQUFDO1FBSWhDLHVCQUFrQixHQUFHLEVBQUUsQ0FBQztJQXVONUIsQ0FBQztJQWxORyxjQUFjLENBQUMsUUFBdUI7UUFDbEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7SUFDN0IsQ0FBQztJQUVNLGNBQWM7UUFDakIsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsSUFBSSxJQUFJLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRU0sT0FBTztRQUNWLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3ZCLENBQUM7SUFFTSxRQUFRLENBQUMsVUFBVSxFQUFFLE9BQWdCO1FBQ3hDLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1FBQ25CLFNBQUcsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRU0sV0FBVyxDQUFDLFVBQVU7UUFDekIsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFDcEIsVUFBVSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsV0FBVyxFQUFFLEVBQUUsUUFBUSxFQUFFLGlDQUFpQixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7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