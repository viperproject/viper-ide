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
        this.setStopping(VerificationTask_1.VerificationTask.connection);
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
    killNailgunServer() {
        Log_1.Log.log('killing nailgun server, this may leave its sub processes running', ViperProtocol_1.LogLevel.Debug);
        //this.nailgunProcess.kill('SIGINT');
        process.kill(this.nailgunProcess.pid);
    }
    completeArguments(stage, fileToVerify) {
        let args = stage.customArguments;
        if (!args || args.length == 0)
            return "";
        args = args.replace(/\$z3Exe\$/g, '"' + this.settings.z3Executable + '"');
        args = args.replace(/\$mainMethod\$/g, stage.mainMethod);
        args = args.replace(/\$nailgunPort\$/g, this.settings.nailgunPort);
        args = args.replace(/\$fileToVerify\$/g, '"' + fileToVerify + '"');
        return args;
    }
    startStageProcess(fileToVerify, stage, onData, onError, onClose) {
        let command = this.settings.nailgunClient + ' ' + this.completeArguments(stage, fileToVerify);
        Log_1.Log.log(command, ViperProtocol_1.LogLevel.Debug);
        let verifyProcess = child_process.exec(command, { cwd: Settings_1.Settings.workspace });
        verifyProcess.stdout.on('data', onData);
        verifyProcess.stderr.on('data', onError);
        verifyProcess.on('close', onClose);
        return verifyProcess;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFpbGd1blNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL05haWxndW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sYUFBYSxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBRWhELHNCQUFrQixPQUNsQixDQUFDLENBRHdCO0FBQ3pCLDJCQUF1QixZQUN2QixDQUFDLENBRGtDO0FBQ25DLGdDQUFtRixpQkFDbkYsQ0FBQyxDQURtRztBQUNwRyw4QkFBcUIsZUFBZSxDQUFDLENBQUE7QUFDckMsbUNBQStCLG9CQUUvQixDQUFDLENBRmtEO0FBRW5EO0lBQUE7UUFHWSxXQUFNLEdBQVksS0FBSyxDQUFDO1FBSWhDLHVCQUFrQixHQUFHLEVBQUUsQ0FBQztJQTZONUIsQ0FBQztJQXhORyxjQUFjLENBQUMsUUFBdUI7UUFDbEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7SUFDN0IsQ0FBQztJQUVNLGNBQWM7UUFDakIsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsSUFBSSxJQUFJLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRU0sT0FBTztRQUNWLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3ZCLENBQUM7SUFFTSxRQUFRLENBQUMsVUFBVSxFQUFDLE9BQWdCO1FBQ3ZDLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1FBQ25CLFNBQUcsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRU0sV0FBVyxDQUFDLFVBQVU7UUFDekIsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFDcEIsVUFBVSxDQUFDLGdCQUFnQixDQUFDLHdCQUFRLENBQUMsV0FBVyxFQUFFLEVBQUUsUUFBUSxFQUFFLGlDQUFpQixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7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