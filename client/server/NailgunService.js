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
                        //store the port of the running nailgun server
                        ServerClass_1.Server.usedNailgunPort = Settings_1.Settings.settings.nailgunSettings.port;
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
                Log_1.Log.log("gracefully shutting down nailgun server on port: " + ServerClass_1.Server.usedNailgunPort, ViperProtocol_1.LogLevel.Info);
                let shutDownNailgunProcess = child_process.exec('"' + Settings_1.Settings.settings.nailgunSettings.clientExecutable + '" --nailgun-port ' + ServerClass_1.Server.usedNailgunPort + ' ng-stop');
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
                    wmic.on('exit', (code) => {
                        resolve(true);
                    });
                }
                else {
                    this.getNailgunServerPid().then(serverPid => {
                        ServerClass_1.Server.nailgunService.nailgunServerPid = serverPid;
                        this.killNGAndZ3(ngPid).then(() => {
                            resolve(true);
                        });
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
            let command = '"' + Settings_1.Settings.settings.nailgunSettings.clientExecutable + '" --nailgun-port ' + ServerClass_1.Server.usedNailgunPort + " NOT_USED_CLASS_NAME";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFpbGd1blNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL05haWxndW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sYUFBYSxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBQ2hELHNCQUFvQixPQUNwQixDQUFDLENBRDBCO0FBQzNCLDJCQUF5QixZQUN6QixDQUFDLENBRG9DO0FBQ3JDLGdDQUE0RCxpQkFDNUQsQ0FBQyxDQUQ0RTtBQUM3RSw4QkFBdUIsZUFBZSxDQUFDLENBQUE7QUFDdkMsbUNBQWlDLG9CQUNqQyxDQUFDLENBRG9EO0FBQ3JELElBQUksU0FBUyxHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUVyQztJQUFBO1FBR0ksa0JBQWEsR0FBVyxDQUFDLENBQUM7UUFFbEIsV0FBTSxHQUFZLEtBQUssQ0FBQztRQUdoQyw2QkFBd0IsR0FBWSxJQUFJLENBQUM7UUFFekMsdUJBQWtCLEdBQUcsRUFBRSxDQUFDO0lBK1o1QixDQUFDO0lBMVpVLE9BQU87UUFDVixNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUN2QixDQUFDO0lBRU0sUUFBUSxDQUFDLE9BQWdCO1FBQzVCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1FBQ25CLGNBQWMsQ0FBQyxvQkFBb0IsR0FBRyxLQUFLLENBQUM7UUFDNUMsU0FBRyxDQUFDLEdBQUcsQ0FBQyx1Q0FBdUMsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hFLG9CQUFNLENBQUMsNEJBQTRCLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxDQUFDLENBQUM7UUFFakgsRUFBRSxDQUFDLENBQUMsbUJBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2pCLElBQUks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