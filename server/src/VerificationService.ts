'use strict';

import child_process = require('child_process');

import {Backend} from "./Settings"
import {Log} from './Log'
import {IveSettings} from './Settings'

export class VerificationService {
    nailgunProcess: child_process.ChildProcess;
    nailgunReady: boolean = false;
    nailgunPort = "7654";
    settings: IveSettings
    verifierProcess: child_process.ChildProcess;
    verificationRunning: boolean = false;

    changeSettings(settings: IveSettings) {
        this.settings = settings;
    }

    public nailgunStarted(): boolean {
        return (this.nailgunProcess != null);
    }

    public startNailgunServer(): child_process.ChildProcess {
        if (!this.nailgunStarted()) {

            let killOldNailgunProcess = child_process.exec('ng --nailgun-port ' + this.nailgunPort + ' ng-stop');

            killOldNailgunProcess.on('exit', (code, signal) => {
                Log.log('starting nailgun server');
                //start the nailgun server for both silicon and carbon

                let backendJars = "";
                this.settings.verificationBackends.forEach(backend => {
                    backendJars = backendJars + ";" + backend.path; //TODO: for unix it is : instead of ;
                });

                let command = 'java -cp ' + this.settings.nailgunServerJar + backendJars + " -server com.martiansoftware.nailgun.NGServer 127.0.0.1:" + this.nailgunPort;
                Log.log(command)
                this.nailgunProcess = child_process.exec(command);
                this.nailgunProcess.stdout.on('data', (data) => {
                    Log.logWithOrigin('NS', data);
                });
            });
            this.verify("", false, false, this.settings.verificationBackends[0], () => { }, () => { }, () => { }, (code, signal) => {
                this.nailgunReady = true;
            });
        } else {
            Log.log('nailgun server already running');
        }
        return this.nailgunProcess;
    }

    public stopNailgunServer() {
        if (this.nailgunProcess) {
            Log.log('shutting down nailgun server');
            this.nailgunProcess.kill('SIGINT');
        }
    }

    public verify(fileToVerify: string, ideMode: boolean, onlyTypeCheck: boolean, backend: Backend, stdOutHadler = (data) => { }, stdErrHadler = (data) => { }, verificationCompletionHandler = (code) => { }, onExit = (code, signal) => { }) {
        this.verifierProcess = child_process.exec('ng --nailgun-port ' + this.nailgunPort + ' ' + backend.mainMethod + ' --ideMode ' + fileToVerify); // to set current working directory use, { cwd: verifierHome } as an additional parameter
        //subscribe handlers
        this.verifierProcess.stdout.on('data', stdOutHadler);
        this.verifierProcess.stderr.on('data', stdErrHadler);
        this.verifierProcess.on('close', verificationCompletionHandler);
        this.verifierProcess.on('exit', onExit);
    }

    public verifyWithContent(fileToVerify: string, fileContent: string, ideMode: boolean, onlyTypeCheck: boolean, backend: Backend): child_process.ChildProcess {
        fileContent = encodeURIComponent(fileContent);
        let command = 'ng --nailgun-port ' + this.nailgunPort + ' ' + backend.mainMethod + ' --ideMode --fileContent "' + fileContent + '" ' + fileToVerify;
        Log.log(command);
        return child_process.exec(command); // to set current working directory use, { cwd: verifierHome } as an additional parameter
    }

    public abortVerification() {
        Log.log('abort running verification');
        if (!this.verificationRunning) {
            Log.error('cannot abort, verification is not running.');
            return;
        }
        //remove impact of child_process to kill
        this.verifierProcess.removeAllListeners('close');
        this.verifierProcess.stdout.removeAllListeners('data');
        this.verifierProcess.stderr.removeAllListeners('data');
        //log the exit of the child_process to kill
        this.verifierProcess.on('exit', (code, signal) => {
            Log.log(`Child process exited with code ${code} and signal ${signal}`);
        })
        this.verifierProcess.kill('SIGINT');
        let l = this.verifierProcess.listeners;
        this.verificationRunning = false;
    }

    startNailgunIfNotRunning() {
        //startNailgun if it is not already running:
        if (!this.nailgunStarted()) {
            this.verifierProcess = this.startNailgunServer();
        }
    }
}