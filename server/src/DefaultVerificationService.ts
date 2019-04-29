/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
 
'use strict';
import { clearTimeout } from 'timers';

import child_process = require('child_process');
import { Log } from './Log'
import { Settings } from './Settings'
import { Common, Stage, Backend, VerificationState, LogLevel } from './ViperProtocol'
import { Server } from './ServerClass';
import { BackendService } from './BackendService';

export class DefaultVerificationService extends BackendService {

    private verifyProcess: child_process.ChildProcess;

    protected registerHandler(onData, onError, onClose) {
        this.verifyProcess.stdout.on('data', onData);
        this.verifyProcess.stderr.on('data', onError);
        this.verifyProcess.on('close', onClose);
    }

    public constructor() {
        super();
        this.isViperServerService = false;
        this.engine = "none";
    }

    public start(backend: Backend): Promise<boolean> {
        return new Promise((resolve, reject) => {
            resolve(true)
        });
    }

    public stop(): Promise<boolean> {
        return Promise.resolve(true);
    }

    public startVerifyProcess(command: string, file: string, onData, onError, onClose) {
        let verifyProcess = child_process.exec(command, { maxBuffer: 1024 * Settings.settings.advancedFeatures.verificationBufferSize, cwd: Server.backendOutputDirectory });
        Log.log("Verifier Process PID: " + verifyProcess.pid, LogLevel.Debug);
        this.isSessionRunning = true;
    }

    private killNgClient(): Promise<boolean> {
        return new Promise((res, rej) => {
            this.verifyProcess.on('exit', (code, signal) => {
                Log.log(`Child process exited with code ${code} and signal ${signal}`, LogLevel.Debug);
                this.isSessionRunning = false
                res(true);
            })
        });
    }

    public stopVerification(secondTry: boolean = false): Promise<boolean> {
        return new Promise((resolve, reject) => {

            // Stage i: remove all listerners from data streams.
            this.verifyProcess.removeAllListeners('close');
            this.verifyProcess.stdout.removeAllListeners('data');
            this.verifyProcess.stderr.removeAllListeners('data');

            // Stage ii: kill the Nailgun client corresponding to current verification process by PID.
            //           This code is platform-specific! 
            let ngPid = this.verifyProcess.pid;
            if (Settings.isWin) {
                let killProcess = Common.spawner('wmic', ["process", "where", '"ProcessId=' + ngPid + ' or ParentProcessId=' + ngPid + '"', "call", "terminate"]);
                killProcess.on('exit', (code) => {
                    // Stage iii: 
                    resolve(this.killNgClient());
                });
            } else {
                let killProcess = Common.spawner('pkill', ["-P", "" + ngPid]);
                killProcess.on('exit', (code) => {
                    killProcess = Common.spawner('kill', ["" + ngPid]);
                    killProcess.on('exit', (code) => {
                        // Stage iii: 
                        resolve(this.killNgClient());
                    });
                });
            }
        });
    }
}