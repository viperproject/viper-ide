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

            let killOldNailgunProcess = child_process.exec('ng --nailgun-port ' + this.nailgunPort + ' ng-stop');

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
        if (this.nailgunProcess) {
            Log.log('shutting down nailgun server');
            this.nailgunProcess.kill('SIGINT');
        }
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