'use strict';

import child_process = require('child_process');

import {Log} from './Log'
import {Settings} from './Settings'
import {Backend, ViperSettings, Commands, VerificationState,LogLevel} from './ViperProtocol'

export class NailgunService {
    nailgunProcess: child_process.ChildProcess;
    ready: boolean = false;
    settings: ViperSettings;

    changeSettings(settings: ViperSettings) {
        this.settings = settings;
    }

    public nailgunStarted(): boolean {
        return (this.nailgunProcess != null);
    }

    private startNailgunServer(connection, backend: Backend) {
        this.isJreInstalled().then((jreInstalled) => {
            if (!jreInstalled) {
                Log.hint("Jre is not installed. Please intall it.");
                return;
            }
            if (!this.nailgunStarted()) {
                Log.log("close nailgun server on port: " + this.settings.nailgunPort,LogLevel.Info)
                let killOldNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ng-stop');

                killOldNailgunProcess.on('exit', (code, signal) => {
                    Log.log('starting nailgun server',LogLevel.Info);
                    //start the nailgun server for both silicon and carbon

                    let backendJars = Settings.backendJars(backend);
                    //Log.log("Backend Jars: " + backendJars,LogLevel.Debug);
                    let command = 'java -cp ' + this.settings.nailgunServerJar + backendJars + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + this.settings.nailgunPort;
                    Log.log(command,LogLevel.Debug)

                    this.nailgunProcess = child_process.exec(command);
                    this.nailgunProcess.stdout.on('data', (data) => {
                        Log.logWithOrigin('NS', data,LogLevel.LowLevelDebug);

                        let dataS: string = data;
                        if (dataS.indexOf("started") > 0) {
                            //Comment in to perstart JVM
                            //let tempProcess = this.startVerificationProcess("", false, false, this.settings.verificationBackends[0],false);
                            //tempProcess.on('exit', (code, signal) => {
                            this.ready = true;
                            Log.log("Nailgun started",LogLevel.Info);
                            connection.sendNotification(Commands.StateChange, { newState: VerificationState.Ready, firstTime: true });
                            //});
                        }
                    });
                    this.nailgunProcess.stderr.on('data', (data) => {
                        Log.logWithOrigin('NS Error', data,LogLevel.LowLevelDebug);
                    });
                });
            } else {
                Log.log('nailgun server already running',LogLevel.Info);
            };
        });
    }

    public stopNailgunServer() {
        this.ready = false;
        if (this.nailgunProcess) {
            Log.log('gracefully shutting down nailgun server',LogLevel.Info);
            let shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ng-stop');
            shutDownNailgunProcess.on('exit', (code, signal) => {
                Log.log("nailgun server is stopped",LogLevel.Info);
            });
        }
        this.nailgunProcess = null;
    }

    public killNgDeamon() {
        Log.log("Killing ng deamon",LogLevel.Info);
        let ngKiller = child_process.exec("taskkill /F /im ng.exe")
        ngKiller.on("exit", (data) => {
            Log.log("Kill ng.exe: " + data,LogLevel.Debug);
        })
        this.ready = false;
        //TODO: set nailgun to stopped in state
    }

    public restartNailgunServer(connection, backend: Backend) {
        this.ready = false;
        connection.sendNotification(Commands.StateChange, { newState: VerificationState.Starting, backendName:backend.name });
        if (this.nailgunProcess) {
            Log.log('gracefully shutting down nailgun server',LogLevel.Info);
            let shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ng-stop');
            this.nailgunProcess = null;
            shutDownNailgunProcess.on('exit', (code, signal) => {
                Log.log("nailgun server is stopped",LogLevel.Info);
                //restart
                this.startNailgunServer(connection, backend);
            });
        } else {
            //first -> only start
            this.startNailgunServer(connection, backend);
        }
    }

    private killNailgunServer() {
        Log.log('killing nailgun server, this may leave its sub processes running',LogLevel.Debug);
        //this.nailgunProcess.kill('SIGINT');
        process.kill(this.nailgunProcess.pid);
    }

    public startVerificationProcess(fileToVerify: string, ideMode: boolean, onlyTypeCheck: boolean, backend: Backend): child_process.ChildProcess {
        let command = this.settings.nailgunClient + ' --nailgun-port ' + this.settings.nailgunPort + ' ' + backend.mainMethod + ' --ideMode' + ' --z3Exe "' + this.settings.z3Executable + '" ' + (backend.getTrace ? '--logLevel trace ' : '') + '"' + fileToVerify + '"';
        Log.log(command,LogLevel.Debug);
        return child_process.exec(command); // to set current working directory use, { cwd: verifierHome } as an additional parameter
    }

    public startNailgunIfNotRunning(connection, backend: Backend) {
        //startNailgun if it is not already running:
        if (!this.nailgunStarted()) {
            this.startNailgunServer(connection, backend);
        }
    }

    public isJreInstalled(): Thenable<boolean> {
        Log.log("Check if Jre is installed",LogLevel.Info);
        return new Promise((resolve, reject) => {
            let jreTester = child_process.exec("java -version");
            jreTester.stderr.on('data', (data: string) => {
                if (data.startsWith('java version')) {
                    return resolve(true);
                } else {
                    return resolve(false);
                }
            });
        });
    }
}