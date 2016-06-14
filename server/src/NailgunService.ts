'use strict';

import child_process = require('child_process');

import {Backend} from "./Settings"
import {Log} from './Log'
import {IveSettings, Settings} from './Settings'

export class NailgunService {
    nailgunProcess: child_process.ChildProcess;
    ready: boolean = false;
    nailgunPort = "7654";
    settings: IveSettings;

    changeSettings(settings: IveSettings) {
        this.settings = settings;
    }

    public nailgunStarted(): boolean {
        return (this.nailgunProcess != null);
    }

    private startNailgunServer(connection) {
        if (!this.nailgunStarted()) {

            let killOldNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ng-stop');

            killOldNailgunProcess.on('exit', (code, signal) => {
                Log.log('starting nailgun server');
                //start the nailgun server for both silicon and carbon

                let backendJars = Settings.backendJars(this.settings);

                let command = 'java -cp ' + this.settings.nailgunServerJar + backendJars + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + this.nailgunPort;
                Log.log(command)
                this.nailgunProcess = child_process.exec(command);
                this.nailgunProcess.stdout.on('data', (data) => {
                    //Log.logWithOrigin('NS', data);
                    let dataS: string = data;
                    if (dataS.indexOf("started") > 0) {
                        let tempProcess = this.startVerificationProcess("", false, false, this.settings.verificationBackends[0]);
                        tempProcess.on('exit', (code, signal) => {
                            this.ready = true;
                            Log.log("Nailgun started");
                            connection.sendNotification({ method: "NailgunReady" });
                        });
                    }
                });
            });
        } else {
            Log.log('nailgun server already running');
        };
    }

    public stopNailgunServer() {
        let stopped = false;
        if (this.nailgunProcess) {
            Log.log('gracefully shutting down nailgun server');
            let shutDownNailgunProcess = child_process.exec(this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ng-stop');
            shutDownNailgunProcess.on('exit', (code, signal) => {
                Log.log("nailgun server is stopped");
                stopped = true;
            });
            //this.killNailgunServer();
        }
        while(!stopped){}
    }
    
    private killNailgunServer(){
        Log.log('killing nailgun server, this may leave its sub processes running');
        //this.nailgunProcess.kill('SIGINT');
        process.kill(this.nailgunProcess.pid);
    }

    public startVerificationProcess(fileToVerify: string, ideMode: boolean, onlyTypeCheck: boolean, backend: Backend): child_process.ChildProcess {
        let command = this.settings.nailgunClient + ' --nailgun-port ' + this.nailgunPort + ' ' + backend.mainMethod + ' --ideMode --logLevel trace ' + fileToVerify;
        Log.log(command);
        return child_process.exec(command); // to set current working directory use, { cwd: verifierHome } as an additional parameter
    }

    public startNailgunIfNotRunning(connection) {
        //startNailgun if it is not already running:
        if (!this.nailgunStarted()) {
            this.startNailgunServer(connection);
        }
    }
}