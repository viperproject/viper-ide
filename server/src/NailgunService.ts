'use strict';

import child_process = require('child_process');

import {Backend} from "./Settings"
import {Log} from './Log'
import {ViperSettings, Settings} from './Settings'
import {Commands, VerificationState} from './ViperProtocol'

export class NailgunService {
    nailgunProcess: child_process.ChildProcess;
    ready: boolean = false;
    nailgunPort = "7654";
    settings: ViperSettings;

    changeSettings(settings: ViperSettings) {
        this.settings = settings;
    }

    public nailgunStarted(): boolean {
        return (this.nailgunProcess != null);
    }

    private startNailgunServer(connection, backend: Backend) {
        if (!this.nailgunStarted()) {
            Log.log("close nailgun server on port: " + this.nailgunPort)
            let killOldNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ng-stop');

            killOldNailgunProcess.on('exit', (code, signal) => {
                Log.log('starting nailgun server');
                //start the nailgun server for both silicon and carbon

                let backendJars = Settings.backendJars(backend);
                //Log.log("Backend Jars: " + backendJars);
                let command = 'java -cp ' + this.settings.nailgunServerJar + backendJars + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + this.nailgunPort;
                Log.log(command)

                this.nailgunProcess = child_process.exec(command);
                this.nailgunProcess.stdout.on('data', (data) => {
                    //Log.logWithOrigin('NS', data);
                    let dataS: string = data;
                    if (dataS.indexOf("started") > 0) {
                        //Comment in to perstart JVM
                        //let tempProcess = this.startVerificationProcess("", false, false, this.settings.verificationBackends[0],false);
                        //tempProcess.on('exit', (code, signal) => {
                        this.ready = true;
                        Log.log("Nailgun started");
                        connection.sendNotification(Commands.StateChange, { newState: VerificationState.Ready, firstTime: true });
                        //});
                    }
                });
            });
        } else {
            Log.log('nailgun server already running');
        };
    }

    public stopNailgunServer() {
        this.ready = false;
        if (this.nailgunProcess) {
            Log.log('gracefully shutting down nailgun server');
            let shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ng-stop');
            shutDownNailgunProcess.on('exit', (code, signal) => {
                Log.log("nailgun server is stopped");
            });
        }
        this.nailgunProcess = null;
    }

    public killNgDeamon() {
        Log.log("Killing ng deamon");
        let ngKiller = child_process.exec("taskkill /F /im ng.exe")
        ngKiller.on("exit", (data) => {
            Log.log("Kill ng.exe: " + data);
        })
        this.ready = false;
        //TODO: set nailgun to stopped in state
    }

    public restartNailgunServer(connection, backend: Backend) {
        this.ready = false;
        connection.sendNotification(Commands.StateChange, { newState: VerificationState.Starting });
        if (this.nailgunProcess) {
            Log.log('gracefully shutting down nailgun server');
            let shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ng-stop');
            this.nailgunProcess = null;
            shutDownNailgunProcess.on('exit', (code, signal) => {
                Log.log("nailgun server is stopped");
                //restart
                this.startNailgunServer(connection, backend);
            });
        } else {
            //first -> only start
            this.startNailgunServer(connection, backend);
        }
    }

    private killNailgunServer() {
        Log.log('killing nailgun server, this may leave its sub processes running');
        //this.nailgunProcess.kill('SIGINT');
        process.kill(this.nailgunProcess.pid);
    }

    public startVerificationProcess(fileToVerify: string, ideMode: boolean, onlyTypeCheck: boolean, backend: Backend): child_process.ChildProcess {
        let command = this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ' + backend.mainMethod + ' --ideMode ' + (backend.getTrace ? '--logLevel trace ' : '') + fileToVerify;
        Log.log(command);
        return child_process.exec(command); // to set current working directory use, { cwd: verifierHome } as an additional parameter
    }

    public startNailgunIfNotRunning(connection, backend: Backend) {
        //startNailgun if it is not already running:
        if (!this.nailgunStarted()) {
            this.startNailgunServer(connection, backend);
        }
    }
}