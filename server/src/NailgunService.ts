'use strict';

import child_process = require('child_process');

import {Log} from './Log'
import {Settings} from './Settings'
import {Backend, ViperSettings, Commands, VerificationState, LogLevel} from './ViperProtocol'

export class NailgunService {
    nailgunProcess: child_process.ChildProcess;
    ready: boolean = false;
    settings: ViperSettings;
    maxNumberOfRetries = 20;

    static startingOrRestarting = false;

    changeSettings(settings: ViperSettings) {
        this.settings = settings;
    }

    public nailgunStarted(): boolean {
        return (this.nailgunProcess != null);
    }

    //NailgunService.startingOrRestarting must be set to true before calling this method
    private startNailgunServer(connection, backend: Backend) {
        this.isJreInstalled().then((jreInstalled) => {
            if (!jreInstalled) {
                Log.hint("Java 8 (64bit) Runtime Environment is not installed. Please install it.");
                return;
            }
            connection.sendNotification(Commands.BackendChange, backend.name);
            if (!this.nailgunStarted()) {
                Log.log("close nailgun server on port: " + this.settings.nailgunPort, LogLevel.Info)
                let killOldNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ng-stop');

                Log.logOutput(killOldNailgunProcess, "NG killer");
                killOldNailgunProcess.on('exit', (code, signal) => {
                    Log.log('starting nailgun server', LogLevel.Info);
                    //start the nailgun server for both silicon and carbon

                    let backendJars = Settings.backendJars(backend);
                    //Log.log("Backend Jars: " + backendJars,LogLevel.Debug);
                    let command = 'java -Xmx2048m -Xss16m -cp ' + this.settings.nailgunServerJar + backendJars + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + this.settings.nailgunPort;
                    Log.log(command, LogLevel.Debug)

                    this.nailgunProcess = child_process.exec(command);
                    this.nailgunProcess.stdout.on('data', (data) => {
                        Log.logWithOrigin('NS', data, LogLevel.LowLevelDebug);

                        let dataS: string = data;
                        if (dataS.indexOf("started") > 0) {
                            this.waitForNailgunToStart(this.maxNumberOfRetries, connection);
                        }
                    });
                    Log.logOutput(killOldNailgunProcess, "NS stopper");
                });
            } else {
                Log.log('nailgun server already running', LogLevel.Info);
            };
        });
        NailgunService.startingOrRestarting = false;
    }

    private waitForNailgunToStart(retriesLeft: number, connection) {
        if (retriesLeft <= 0) {
            Log.log("A problem with nailgun was detected, Nailgun cannot be started.", LogLevel.Default)
            return;
        }
        this.isNailgunServerReallyRunning().then(running => {
            if (!running) {
                Log.log("Nailgun server should be running, however, it is not running yet. -> retry after 100ms", LogLevel.Info);
                setTimeout(() => {
                    this.waitForNailgunToStart(retriesLeft - 1, connection);
                }, 100);
            } else {
                //the nailgun server is confirmed to be runnings
                this.ready = true;
                Log.log("Nailgun started", LogLevel.Info);
                connection.sendNotification(Commands.StateChange, { newState: VerificationState.Ready, firstTime: true, verificationNeeded: true });
            }
        });
    }

    public stopNailgunServer() {
        this.ready = false;
        if (this.nailgunProcess) {
            Log.log('gracefully shutting down nailgun server', LogLevel.Info);
            let shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ng-stop');
            shutDownNailgunProcess.on('exit', (code, signal) => {
                Log.log("nailgun server is stopped", LogLevel.Info);
            });
            Log.logOutput(shutDownNailgunProcess, "NG stopper");
        }
        this.nailgunProcess = null;
    }

    public killNgDeamon() {
        this.ready = false;
        Log.log("Killing ng deamon", LogLevel.Info);
        let ngKiller = child_process.exec("taskkill /F /im ng.exe")
        ngKiller.on("exit", (data) => {
            Log.log("kill ng.exe: " + data, LogLevel.Debug);
        })
        Log.logOutput(ngKiller, "kill ng.exe");
        //TODO: set nailgun to stopped in state
    }

    public restartNailgunServer(connection, backend: Backend) {
        if (NailgunService.startingOrRestarting) {
            Log.log("Server is already starting or restarting, don't restart", LogLevel.Debug);
            return;
        }
        NailgunService.startingOrRestarting = true;
        this.ready = false;
        connection.sendNotification(Commands.StateChange, { newState: VerificationState.Starting, backendName: backend.name });
        if (this.nailgunProcess) {
            Log.log('gracefully shutting down nailgun server', LogLevel.Info);
            let shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ng-stop');
            this.nailgunProcess = null;
            shutDownNailgunProcess.on('exit', (code, signal) => {
                Log.log("nailgun server is stopped", LogLevel.Info);
                //restart
                this.startNailgunServer(connection, backend);
            });
            Log.logOutput(shutDownNailgunProcess, "Nailgun stopper2");
        } else {
            //first -> only start
            this.startNailgunServer(connection, backend);
        }
    }

    private killNailgunServer() {
        Log.log('killing nailgun server, this may leave its sub processes running', LogLevel.Debug);
        //this.nailgunProcess.kill('SIGINT');
        process.kill(this.nailgunProcess.pid);
    }

    public startVerificationProcess(fileToVerify: string, ideMode: boolean, onlyTypeCheck: boolean, backend: Backend): child_process.ChildProcess {
        let command = this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ' + backend.mainMethod + ' --ideMode' + ' --z3Exe "' + this.settings.z3Executable + '" ' + (backend.getTrace ? '--logLevel trace ' : '') + (backend.customArguments ? backend.customArguments : "") + ' "' + fileToVerify + '"';
        Log.log(command, LogLevel.Debug);
        return child_process.exec(command, { cwd: Settings.workspace }); // to set current working directory use, { cwd: verifierHome } as an additional parameter
    }

    public startNailgunIfNotRunning(connection, backend: Backend) {
        if (NailgunService.startingOrRestarting) {
            Log.log("Server is already starting or restarting, don't start", LogLevel.Debug);
            return;
        }
        NailgunService.startingOrRestarting = true;
        //startNailgun if it is not already running:
        if (!this.nailgunStarted()) {
            this.startNailgunServer(connection, backend);
        }
    }

    public isNailgunServerReallyRunning(): Thenable<boolean> {
        return new Promise((resolve, reject) => {
            if (!this.nailgunProcess) {
                return resolve(false);
            }
            let command = this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + " NOT_USED_CLASS_NAME";
            Log.log(command, LogLevel.Debug);
            let nailgunServerTester = child_process.exec(command);
            nailgunServerTester.stderr.on('data', data => {
                if (data.startsWith("connect: ")) {
                    return resolve(false);
                } else if (data.startsWith("java.lang.ClassNotFoundException:")) {
                    return resolve(true);
                }
            });
        });
    }

    public isJreInstalled(): Thenable<boolean> {
        Log.log("Check if Jre is installed", LogLevel.Info);
        return new Promise((resolve, reject) => {
            let jreTester = child_process.exec("java -version");
            jreTester.stdout.on('data', (data: string) => {
                Log.logWithOrigin("Java checker", data, LogLevel.LowLevelDebug);
                if (data.startsWith('java version')) {
                    return resolve(true);
                } else {
                    return resolve(false);
                }
            });
            jreTester.stderr.on('data', (data: string) => {
                Log.logWithOrigin("Java checker error", data, LogLevel.LowLevelDebug);
                if (data.startsWith('java version')) {
                    return resolve(true);
                } else {
                    return resolve(false);
                }
            });
            jreTester.on('exit', () => {
                Log.logWithOrigin("Java checker", "exit", LogLevel.LowLevelDebug);
                return resolve(false);
            });
        });
    }
}