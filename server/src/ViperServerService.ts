'use strict';
import { clearTimeout } from 'timers';

import child_process = require('child_process');
import { Log } from './Log'
import { Settings } from './Settings'
import { BackendOutputType, Common, Stage, Backend, VerificationState, LogLevel } from './ViperProtocol'
import { Server } from './ServerClass';
import { VerificationTask } from './VerificationTask'
import { BackendService } from './BackendService';

export class ViperServerService extends BackendService {

    public constructor() {
        super();
        this.isViperServerService = true;
        this.engine = "ViperServer";
    }

    public start(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            let command = this.getViperServerStartCommand();
            Log.log(command, LogLevel.Debug)

            Server.startingOrRestarting = true;
            this.startTimeout(++this.instanceCount);
            this.backendProcess = child_process.exec(command, { maxBuffer: 1024 * Settings.settings.advancedFeatures.verificationBufferSize, cwd: Server.backendOutputDirectory });
            this.backendProcess.stdout.on('data', (data: string) => {
                Log.logWithOrigin("VS", data, LogLevel.LowLevelDebug);
                if (data.startsWith("This is the Viper Server.")) {
                    this.removeAllListeners();
                    resolve(true);
                }
            });
        })
    }

    public stop(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            try {
                if (this.backendProcess) {
                    clearTimeout(this.timeout);
                    this.setStopping();
                    Log.log("gracefully shutting down viper server", LogLevel.Info);

                    this.backendProcess.removeAllListeners();

                    //register handler
                    this.backendProcess.on('exit', (code, signal) => {
                        Log.log("viper server is stopped", LogLevel.Info);
                        this.setStopped();
                        return resolve(true);
                    });

                    //request exit
                    Log.log("Request exit from ViperServer", LogLevel.Debug);
                    this.emit('exit');//TODO:check if communication works
                    this.backendProcess = null;
                } else {
                    this.setStopped();
                    return resolve(true);
                }
            } catch (e) {
                Log.error("Error stopping viper server: " + e);
                resolve(false);
            }
        });
    }

    public stopVerification(ngPid?: number, secondTry: boolean = false): Promise<boolean> {
        return new Promise((resolve, reject) => {

            this.removeAllListeners();

            this.backendProcess.stdout.on('data', (data: string) => {
                data = data.trim();
                if (data.startsWith("{\"") && data.endsWith("}")) {
                    Log.logWithOrigin("VS", data, LogLevel.LowLevelDebug);
                    let json = VerificationTask.parseJsonMessage(data);
                    if (json && json.type == BackendOutputType.Stopped) {
                        resolve(true);
                    }
                }
            });

            //request verification stop
            this.emit('stop');
            Log.log("Request verification stop from ViperServer", LogLevel.Debug);
        });
    }

    public swapBackend(newBackend: Backend) {
        this.setReady(newBackend);
    }

    private removeAllListeners() {
        this.backendProcess.removeAllListeners();
        this.backendProcess.stdout.removeAllListeners();
        this.backendProcess.stderr.removeAllListeners();
    }

    private getViperServerStartCommand(): string {
        let command = 'java ' + Settings.settings.javaSettings.customArguments + " " + Settings.settings.viperServerSettings.customArguments;
        let jarDependencies = Settings.buildDependencyString(<string[]>Settings.settings.viperServerSettings.serverJars)
        command = command.replace(/\$backendPaths\$/g, jarDependencies);
        command = command.replace(/\$backendSpecificCache\$/g, (Settings.settings.viperServerSettings.backendSpecificCache === true ? "--backendSpecificCache" : ""));
        command = command.replace(/\$mainMethod\$/g, "viper.server.ViperServerRunner");
        return command;
    }

    protected startVerifyProcess(command: string): child_process.ChildProcess {
        this.emit(command);
        this.isSessionRunning = true;
        return null;
    }

    protected registerHandler(onData, onError, onClose) {
        this.removeAllListeners();
        this.backendProcess.stdout.on('data', onData);
        this.backendProcess.stderr.on('data', onError);
    }

    private emit(msg: string) {
        this.backendProcess.stdin.write(msg + '\n');
    }

    public flushCache(filePath?: string) {
        Log.log("Request flushing cache from ViperServer", LogLevel.Debug);
        let command = 'flushCache ' + (filePath ? '"' + filePath + '"' : "")
        Log.log("Emit to ViperServer: " + command, LogLevel.LowLevelDebug)
        this.emit(command)
    }

    public static isSupportedType(type: string) {
        if (!type) return false;
        return type.toLowerCase() == 'carbon' || type.toLowerCase() == 'silicon';
    }

    public static supportedTypes = '"carbon" and "silicon"';
}