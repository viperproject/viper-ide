'use strict';
import { clearTimeout } from 'timers';

import child_process = require('child_process');
import { Log } from './Log'
import { Settings } from './Settings'
import { Common, Stage, Backend, VerificationState, LogLevel } from './ViperProtocol'
import { Server } from './ServerClass';
import { VerificationTask } from './VerificationTask';
import { BackendService } from './BackendService';

export class DefaultVerificationService extends BackendService {

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

    public stopVerification(ngPid?: number, secondTry: boolean = false): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (ngPid) {
                if (Settings.isWin) {
                    let killProcess = Common.spawner('wmic', ["process", "where", '"ProcessId=' + ngPid + ' or ParentProcessId=' + ngPid + '"', "call", "terminate"]);
                    killProcess.on('exit', (code) => {
                        resolve(true);
                    });
                } else {
                    let killProcess = Common.spawner('pkill', ["-P", "" + ngPid]);
                    killProcess.on('exit', (code) => {
                        killProcess = Common.spawner('kill', ["" + ngPid]);
                        killProcess.on('exit', (code) => {
                            resolve(true);
                        });
                    });
                }
            } else {
                if (this.verifyProcess) {
                    this.stopVerification(this.verifyProcess.pid).then(ok => {
                        resolve(ok)
                    });
                } else {
                    resolve(true);
                }
            }
        });
    }
}