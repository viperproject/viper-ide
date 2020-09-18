/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const child_process = require("child_process");
const Log_1 = require("./Log");
const Settings_1 = require("./Settings");
const ViperProtocol_1 = require("./ViperProtocol");
const ServerClass_1 = require("./ServerClass");
const BackendService_1 = require("./BackendService");
class DefaultVerificationService extends BackendService_1.BackendService {
    registerHandler(onData, onError, onClose) {
        this.verifyProcess.stdout.on('data', onData);
        this.verifyProcess.stderr.on('data', onError);
        this.verifyProcess.on('close', onClose);
    }
    constructor() {
        super();
        this.isViperServerService = false;
        this.engine = "none";
    }
    start(backend) {
        return new Promise((resolve, reject) => {
            resolve(true);
        });
    }
    stop() {
        return Promise.resolve(true);
    }
    startVerifyProcess(command, file, onData, onError, onClose) {
        let verifyProcess = child_process.exec(command, { maxBuffer: 1024 * Settings_1.Settings.settings.advancedFeatures.verificationBufferSize, cwd: ServerClass_1.Server.backendOutputDirectory });
        Log_1.Log.log("Verifier Process PID: " + verifyProcess.pid, ViperProtocol_1.LogLevel.Debug);
        this.isSessionRunning = true;
    }
    killNgClient() {
        return new Promise((res, rej) => {
            this.verifyProcess.on('exit', (code, signal) => {
                Log_1.Log.log(`Child process exited with code ${code} and signal ${signal}`, ViperProtocol_1.LogLevel.Debug);
                this.isSessionRunning = false;
                res(true);
            });
        });
    }
    stopVerification(secondTry = false) {
        return new Promise((resolve, reject) => {
            // Stage i: remove all listerners from data streams.
            this.verifyProcess.removeAllListeners('close');
            this.verifyProcess.stdout.removeAllListeners('data');
            this.verifyProcess.stderr.removeAllListeners('data');
            // Stage ii: kill the Nailgun client corresponding to current verification process by PID.
            //           This code is platform-specific! 
            let ngPid = this.verifyProcess.pid;
            if (Settings_1.Settings.isWin) {
                let killProcess = ViperProtocol_1.Common.spawner('wmic', ["process", "where", '"ProcessId=' + ngPid + ' or ParentProcessId=' + ngPid + '"', "call", "terminate"]);
                killProcess.on('exit', (code) => {
                    // Stage iii: 
                    resolve(this.killNgClient());
                });
            }
            else {
                let killProcess = ViperProtocol_1.Common.spawner('pkill', ["-P", "" + ngPid]);
                killProcess.on('exit', (code) => {
                    killProcess = ViperProtocol_1.Common.spawner('kill', ["" + ngPid]);
                    killProcess.on('exit', (code) => {
                        // Stage iii: 
                        resolve(this.killNgClient());
                    });
                });
            }
        });
    }
}
exports.DefaultVerificationService = DefaultVerificationService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGVmYXVsdFZlcmlmaWNhdGlvblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0RlZmF1bHRWZXJpZmljYXRpb25TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7SUFNSTtBQUVKLFlBQVksQ0FBQzs7QUFHYiwrQ0FBZ0Q7QUFDaEQsK0JBQTJCO0FBQzNCLHlDQUFxQztBQUNyQyxtREFBcUY7QUFDckYsK0NBQXVDO0FBQ3ZDLHFEQUFrRDtBQUVsRCxNQUFhLDBCQUEyQixTQUFRLCtCQUFjO0lBSWhELGVBQWUsQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLE9BQU87UUFDOUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM3QyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzlDLElBQUksQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRUQ7UUFDSSxLQUFLLEVBQUUsQ0FBQztRQUNSLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxLQUFLLENBQUM7UUFDbEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7SUFDekIsQ0FBQztJQUVNLEtBQUssQ0FBQyxPQUFnQjtRQUN6QixPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ25DLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUNqQixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTSxJQUFJO1FBQ1AsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFFTSxrQkFBa0IsQ0FBQyxPQUFlLEVBQUUsSUFBWSxFQUFFLE1BQU0s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