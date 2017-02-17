'use strict';
const child_process = require('child_process');
const Log_1 = require('./Log');
const Settings_1 = require('./Settings');
const ViperProtocol_1 = require('./ViperProtocol');
const ServerClass_1 = require('./ServerClass');
const VerificationTask_1 = require('./VerificationTask');
var tree_kill = require('tree-kill');
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
        if (Settings_1.Settings.isWin) {
            this.getNailgunServerPid().then(pid => {
                this.nailgunServerPid = pid;
                Log_1.Log.log("The nailgun server pid is " + pid);
            });
        }
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
    startOrRestartNailgunServer(backend, reverifyWhenBackendReady) {
        try {
            this.reverifyWhenBackendReady = reverifyWhenBackendReady;
            if (NailgunService.startingOrRestarting) {
                Log_1.Log.log("Server is already starting or restarting, don't restart", ViperProtocol_1.LogLevel.Debug);
                return;
            }
            //Stop all running verificationTasks before restarting backend
            VerificationTask_1.VerificationTask.stopAllRunningVerifications().then(done => {
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
                        let command = 'java ' + Settings_1.Settings.settings.javaSettings.customArguments + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + Settings_1.Settings.settings.nailgunSettings.port;
                        let backendJars = Settings_1.Settings.backendJars(backend);
                        command = command.replace(/\$backendPaths\$/g, '"' + Settings_1.Settings.settings.nailgunSettings.serverJar + '"' + backendJars);
                        Log_1.Log.log(command, ViperProtocol_1.LogLevel.Debug);
                        this.instanceCount++;
                        this.startNailgunTimeout(this.instanceCount);
                        this.nailgunProcess = child_process.exec(command, { cwd: ServerClass_1.Server.backendOutputDirectory });
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
    killNGAndZ3(ngPid) {
        //return this.killNgAndZ3Deamon();
        // return new Promise((resolve, reject) => {
        //     tree_kill(pid, 'SIGKILL', (err) => {
        //         Log.log("tree-killer done: " + err);
        //         resolve(true);
        //     });
        // });
        if (Settings_1.Settings.isWin) {
            //the backend related processes (e.g z3) are child processes of the nailgun server, 
            //therefore, killing all childs of the nailgun server stops the right processes
            return new Promise((resolve, reject) => {
                if (ServerClass_1.Server.nailgunService.nailgunServerPid) {
                    //let wmic = this.executer('wmic process where "ParentProcessId=' + Server.nailgunService.nailgunServerPid + (ngPid ? ' or ParentProcessId=' + ngPid : "") + '" call terminate');
                    let wmic = this.spawner('wmic', ["process", "where", 'ParentProcessId=' + ServerClass_1.Server.nailgunService.nailgunServerPid + (ngPid ? ' or ParentProcessId=' + ngPid : ""), "call", "terminate"]);
                    wmic.on('stop', (code) => {
                        resolve(true);
                    });
                }
                else {
                    this.getNailgunServerPid().then(serverPid => {
                        ServerClass_1.Server.nailgunService.nailgunServerPid = serverPid;
                        return this.killNGAndZ3(ngPid);
                    });
                }
            });
        }
        else if (Settings_1.Settings.isLinux) {
            return this.killAllNgAndZ3Processes();
        }
        else {
            return this.killAllNgAndZ3Processes();
        }
    }
    getNailgunServerPid() {
        return new Promise((resolve, reject) => {
            if (Settings_1.Settings.isWin) {
                //the backend related processes (e.g z3) are child processes of the nailgun server, 
                //therefore, killing all childs of the nailgun server stops the right processes
                child_process.exec('wmic process where "parentprocessId=' + this.nailgunProcess.pid + ' and name=\'java.exe\'" get ProcessId', (strerr, stdout, stderr) => {
                    let regex = /.*?(\d+).*/.exec(stdout);
                    if (regex[1]) {
                        resolve(regex[1]);
                    }
                    else {
                        Log_1.Log.log("error getting Nilgun Pid");
                        reject();
                    }
                });
            }
            else if (Settings_1.Settings.isLinux) {
                Log_1.Log.error("unsupported");
                reject();
            }
            else {
                Log_1.Log.error("unsupported");
                reject();
            }
        });
    }
    executer(command) {
        Log_1.Log.log("executer: " + command);
        try {
            let child = child_process.exec(command, function (error, stdout, stderr) {
                Log_1.Log.log('stdout: ' + stdout);
                Log_1.Log.log('stderr: ' + stderr);
                if (error !== null) {
                    Log_1.Log.log('exec error: ' + error);
                }
            });
            return child;
        }
        catch (e) {
            Log_1.Log.error("Error executing " + command + ": " + e);
        }
    }
    spawner(command, args) {
        Log_1.Log.log("spawner: " + command + " " + args.join(" "));
        try {
            let child = child_process.spawn(command, args, { detached: true });
            child.on('stdout', data => {
                Log_1.Log.log('spawner stdout: ' + data);
            });
            child.on('stderr', data => {
                Log_1.Log.log('spawner stderr: ' + data);
            });
            child.on('exit', data => {
                Log_1.Log.log('spawner done: ' + data);
            });
            return child;
        }
        catch (e) {
            Log_1.Log.error("Error spawning command: " + e);
        }
    }
    killAllNgAndZ3Processes() {
        // TODO: it would be much better to kill the processes by process group,
        // unfortunaltey that did not work.
        // Moreover, the nailgun client is not listening to the SIGINT signal, 
        // thus, this mechanism cannot be used to gracefully shut down nailgun and its child processes.
        // using the pID to kill the processes is also not an option, as we do not know the pID of z3
        Log_1.Log.log("kill all ng and z3 processes");
        return new Promise((resolve, reject) => {
            let killCommand;
            if (Settings_1.Settings.isWin) {
                killCommand = "taskkill /F /T /im ng.exe & taskkill /F /T /im z3.exe";
            }
            else if (Settings_1.Settings.isLinux) {
                killCommand = "pkill -c ng; pkill -c z3";
            }
            else {
                killCommand = "pkill ng; pkill z3";
            }
            Log_1.Log.log("Command: " + killCommand, ViperProtocol_1.LogLevel.Debug);
            let killer = child_process.exec(killCommand);
            killer.on("exit", (data) => {
                Log_1.Log.log("ng client and z3 killer: " + data, ViperProtocol_1.LogLevel.Debug);
                return resolve(true);
            });
            Log_1.Log.logOutput(killer, "kill ng.exe");
        });
    }
    killNailgunServer() {
        // Log.log('killing nailgun server, this may leave its sub processes running', LogLevel.Debug);
        // process.kill(this.nailgunProcess.pid, 'SIGTERM')
        Log_1.Log.log('recursively killing nailgun server', ViperProtocol_1.LogLevel.Debug);
        this.killRecursive(this.nailgunProcess.pid);
        if (Settings_1.Settings.isWin) {
            let wmic = this.spawner('wmic', ["process", "where", 'ParentProcessId=' + this.nailgunProcess.pid + ' or ProcessId=' + this.nailgunProcess.pid, "call", "terminate"]);
        }
        //this.nailgunProcess.kill('SIGINT');
        this.nailgunProcess = null;
    }
    killRecursive(pid) {
        return new Promise((resolve, reject) => {
            tree_kill(pid, 'SIGKILL', (err) => {
                Log_1.Log.log("tree-killer done: " + err);
                resolve(true);
            });
        });
    }
    // public startStageProcessUsingSpawn(fileToVerify: string, stage: Stage, onData, onError, onClose): child_process.ChildProcess {
    //     let command = "";
    //     if (this.activeBackend.useNailgun) {
    //         //command = '"' + Settings.settings.nailgunSettings.clientExecutable + '"';
    //         command = Settings.settings.nailgunSettings.clientExecutable.toString();
    //     } else {
    //         command = 'java';
    //     }
    //     let args: string[] = Settings.splitArguments(Settings.settings.javaSettings.customArguments); //TODO: what if the argument contains spaces?
    //     args = Settings.expandCustomArgumentsForSpawn(args, stage, fileToVerify, this.activeBackend);
    //     Log.log(command + ' ' + args.join(' '), LogLevel.Debug);
    //     let verifyProcess = child_process.spawn(command, args, { cwd: Server.backendOutputDirectory });
    //     verifyProcess.stdout.on('data', onData);
    //     verifyProcess.stderr.on('data', onError);
    //     verifyProcess.on('close', onClose);
    //     return verifyProcess;
    // }
    startStageProcess(fileToVerify, stage, onData, onError, onClose) {
        let program = this.activeBackend.useNailgun ? ('"' + Settings_1.Settings.settings.nailgunSettings.clientExecutable + '"') : ('java ' + Settings_1.Settings.settings.javaSettings.customArguments);
        let command = Settings_1.Settings.expandCustomArguments(program, stage, fileToVerify, this.activeBackend);
        Log_1.Log.log(command, ViperProtocol_1.LogLevel.Debug);
        let verifyProcess = child_process.exec(command, { maxBuffer: 1024 * Settings_1.Settings.settings.advancedFeatures.verificationBufferSize, cwd: ServerClass_1.Server.backendOutputDirectory });
        verifyProcess.stdout.on('data', onData);
        verifyProcess.stderr.on('data', onError);
        verifyProcess.on('close', onClose);
        return verifyProcess;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFpbGd1blNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL05haWxndW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sYUFBYSxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBQ2hELHNCQUFvQixPQUNwQixDQUFDLENBRDBCO0FBQzNCLDJCQUF5QixZQUN6QixDQUFDLENBRG9DO0FBQ3JDLGdDQUE0RCxpQkFDNUQsQ0FBQyxDQUQ0RTtBQUM3RSw4QkFBdUIsZUFBZSxDQUFDLENBQUE7QUFDdkMsbUNBQWlDLG9CQUNqQyxDQUFDLENBRG9EO0FBQ3JELElBQUksU0FBUyxHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUVyQztJQUFBO1FBR0ksa0JBQWEsR0FBVyxDQUFDLENBQUM7UUFFbEIsV0FBTSxHQUFZLEtBQUssQ0FBQztRQUdoQyw2QkFBd0IsR0FBWSxJQUFJLENBQUM7UUFFekMsdUJBQWtCLEdBQUcsRUFBRSxDQUFDO0lBMlo1QixDQUFDO0lBdFpVLE9BQU87UUFDVixNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUN2QixDQUFDO0lBRU0sUUFBUSxDQUFDLE9BQWdCO1FBQzVCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1FBQ25CLGNBQWMsQ0FBQyxvQkFBb0IsR0FBRyxLQUFLLENBQUM7UUFDNUMsU0FBRyxDQUFDLEdBQUcsQ0FBQyx1Q0FBdUMsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hFLG9CQUFNLENBQUMsNEJBQTRCLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxDQUFDLENBQUM7UUFFakgsRUFBRSxDQUFDLENBQUMsbUJBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2pCLElBQUks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