'use strict';
import { clearTimeout } from 'timers';
import * as fs from 'fs';
import rp = require('request-promise-native');
import request = require('request');
import stream = require('stream');

import child_process = require('child_process');
import { Log } from './Log'
import { Settings } from './Settings'
import { BackendOutputType, Common, Stage, Backend, VerificationState, LogLevel } from './ViperProtocol'
import { Server } from './ServerClass';
import { VerificationTask } from './VerificationTask'
import { BackendService } from './BackendService';

export class ViperServerService extends BackendService {

    private _port: number;
    private _url: string; 
    private _stream = new stream.Writable();
    
    // the JID that ViperServer assigned to the current verification job.
    private _job_id: number; 

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
            
            let errorReason = "";
            this.backendProcess = child_process.exec(command, { 
                maxBuffer: 1024 * Settings.settings.advancedFeatures.verificationBufferSize, 
                cwd: Server.backendOutputDirectory 
            });
            let expected_msg = new RegExp(/ViperServer online at ([/a-zA-Z0-9:.\-_]+):(\d+).*/);
            this.backendProcess.stdout.on('data', (data: string) => {
                Log.logWithOrigin("VS", data, LogLevel.LowLevelDebug);
                let res = expected_msg.exec(data);
                if ( res.length === 3 ) {
                    this._url = res[1];
                    this._port = parseInt(res[2]);
                    this.removeAllListeners();
                    resolve(true);
                } 
            });
            this.backendProcess.stderr.on('data',(data:string) =>{
                 errorReason = errorReason += "\n" + data;
            })
            this.backendProcess.on('exit', code => {
                Log.log("ViperServer is stopped.", LogLevel.Info);
                this.setStopped();
            })
         })
    }

    public stop(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (this.backendProcess) {
                Log.log(`Sending exit request to ViperServer...`, LogLevel.Debug)
                //clearTimeout(this.timeout)
                this.setStopping()
                this.backendProcess.removeAllListeners()
                this.sendStopRequest().then(() => {
                    this.setStopped()
                    this.backendProcess = null;
                    this.isSessionRunning = false;
                    resolve(true)
                }).catch((e) => {
                    reject(e)
                })

            } else {
                Log.log(`ViperServer has already stopped.`, LogLevel.Debug)
                this.setStopped()
                return resolve(true)
            }
        })
    }

    public stopVerification(secondTry: boolean = false): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.sendJobDiscardRequest(this._job_id).then(() => {
                this.isSessionRunning = false
                resolve(true)
            }).catch((e) => {
                reject(e)
            })
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
        command = command.replace(/\$backendPaths\$/g, Settings.viperServerJars());
        command = command.replace(/\$backendSpecificCache\$/g, (Settings.settings.viperServerSettings.backendSpecificCache === true ? "--backendSpecificCache" : ""));
        command = command.replace(/\$mainMethod\$/g, "viper.server.ViperServerRunner");
        return command;
    }

    protected startVerifyProcess(command: string, file: string, onData, onError, onClose) {

        this._stream.writable = true
        this._stream.write = (data) => { 
            // Workaround for converting the newly proposed Viper protocol to classical Viper protocol. 
            
            if ( data.toString() === '\n' ) return true
            
            let message = JSON.parse(data.toString())
            Log.log('recieved message: ' + JSON.stringify(message, null, 2), LogLevel.Debug)
            if ( message.hasOwnProperty('msg_type') ) {

                if ( message.msg_type === 'statistics' ) {
                    return onData(JSON.stringify({
                        type: "VerificationStart", 
                        nofPredicates: parseInt(message.msg_body.predicates), 
                        nofMethods: parseInt(message.msg_body.methods), 
                        nofFunctions: parseInt(message.msg_body.functions)
                    }))
                }

                //if ( message.msg_type === 'program_outline' ) {

                //}

                if ( message.msg_type === 'verification_result' ) {

                    if ( message.hasOwnProperty('msg_body') && 
                         message.msg_body.hasOwnProperty('status') ) {

                            if ( message.msg_body.status === 'failure') {

                                let first_error_tag = message.msg_body.details.result.errors[0].tag
                                let global_failure = 
                                    first_error_tag === 'parser.error' || 
                                    first_error_tag === 'parser.warning' ||
                                    first_error_tag === 'consistency.error' ||
                                    first_error_tag === 'typechecker.error' ||
                                    first_error_tag === 'clioption.error' ||
                                    first_error_tag === 'dependencynotfound.error' ||
                                    first_error_tag === 'timeout.error' ||
                                    first_error_tag === 'exceptional.error' 

                                if ( message.msg_body.kind === 'for_entity' || global_failure ) {
                                        
                                    onData(JSON.stringify({ 
                                        type: "Error",
                                        file: file,
                                        errors: message.msg_body.details.result.errors.map((e) => {
                                            return {
                                                tag: e.tag,
                                                start: e.position.start,
                                                end: e.position.end,
                                                message: e.text,
                                                cached: e.cached
                                            }
                                        })
                                    }))
                                }

                            } else if ( message.msg_body.status === 'success' && 
                                        message.msg_body.kind === 'for_entity') {
                                    
                                return onData(JSON.stringify({
                                    type: (message.msg_body.details.entity.type === 'method' ? 'MethodVerified' 
                                        : (message.msg_body.details.entity.type === 'function' ? 'FunctionVerified' 
                                        :  message.msg_body.details.entity.type === 'predicate' ? 'PredicateVerified' : ''/*bad stuff*/ ) ) ,
                                    name: message.msg_body.details.entity.name
                                }))

                            } 
                            
                            if ( message.msg_body.kind === 'overall') {
                                onData(JSON.stringify({
                                    type: "End", 
                                    time: (message.msg_body.details.time * 0.001) + 's'
                                }))
                                return onData(JSON.stringify({ type: "Success" }))
                            }

                    } else {
                        throw `property 'msg_body' not found in message=${message}`
                    }
                } 
            } else {
                throw `property 'msg_type' not found in message=${message}`
            }
            //onData(data.toString()); 
            //Log.log(data.toString(), LogLevel.Debug);
            return true; 
        };
        this._stream.end = () => { 
            //onClose();
        };

        this.startVerifyStream(command, onData, onError, onClose);
        this.isSessionRunning = true;
    }

    private startVerifyStream(command: string, onData, onError, onClose) {
        Log.log('Sending verification request to ViperServer...', LogLevel.Debug); 

        let jid_promise = this.postStartRequest({
            arg: command
        })

        jid_promise.then((jid) => {
            this._job_id = jid
            
            onData(JSON.stringify({type: "Start", backendType: "Silicon"}))

            Log.log(`Requesting ViperServer to stream results of verification job #${jid}...`, LogLevel.LowLevelDebug)
            let url = this._url + ':' + this._port + '/verify/' + jid
            request.get(url).on('error', (err) => {
                Log.log(`error while requesting results from ViperServer.` +
                        ` Request URL: ${url}\n` +
                        ` Error message: ${err}`, LogLevel.Default);
            }).pipe(this._stream)

        }).catch((err) => {
            Log.log('unfortunately, we did not get a job ID from ViperServer: ' + err, LogLevel.LowLevelDebug);
        })
    }

    //@deprecated
    private emit(msg: string) {
        this.backendProcess.stdin.write(msg + '\n');
    }

    //@deprecated
    public flushCache(filePath?: string) {
        Log.log("Request flushing cache from ViperServer", LogLevel.Debug);
        let command = 'flushCache ' + (filePath ? '"' + filePath + '"' : "")
        Log.log("Emit to ViperServer: " + command, LogLevel.LowLevelDebug)
        this.emit(command)
    }

    private postStartRequest(request_body): Promise<number> {
        return new Promise((resolve, reject) => {
            Log.log(`Requesting ViperServer to start new job...`, LogLevel.Debug);
            let options = {
                url: this._url + ':' + this._port + '/verify', 
                headers: {'content-type': 'application/json'},
                body: JSON.stringify(request_body)
            }
            request.post(options, (error, response, body) => { 
                let json_body = JSON.parse(body);
        
                // This callback processes the initial response from ViperServer. 
                // ViperServer confirms that the verification task has been accepted and 
                //  returns a job ID (which is unique for this session).
                if (error) {
                    Log.log(`Got error from POST request to ViperServer: ` + 
                            JSON.stringify(error, undefined, 2), LogLevel.Debug);
                    reject(error)
                }
                if (response.statusCode !== 200) {
                    Log.log(`Bad response on POST request to ViperServer: ` + 
                            JSON.stringify(response, undefined, 2), LogLevel.Debug);
                    reject(`bad response code: ${response.statusCode}`)
                }
                if (typeof json_body.msg !== 'undefined') {
                    Log.log(`ViperServer had trouble accepting the POST request: ` + 
                            JSON.stringify(body.msg, undefined, 2), LogLevel.Debug);
                    reject(`ViperServer: ${json_body.msg}`)
                }
                if (typeof json_body.id === 'undefined') {
                    Log.log(`It seems that ViperServer\'s REST API has been changed.` + 
                            ` Body of response: ` + JSON.stringify(json_body, undefined, 2),
                            LogLevel.Debug)
                    reject(`ViperServer did not provide a job ID: ${json_body}`)
                } 
                Log.log(`ViperServer started new job with ID ${json_body.id}`,
                        LogLevel.Debug)
                resolve(json_body.id)
            })

        })
    }

    private sendStopRequest(): Promise<boolean> {
        return new Promise((resolve, reject) => { 
            Log.log(`Requesting ViperServer to exit...`, LogLevel.Debug);
            let url = this._url + ':' + this._port + '/exit'
            request.get(url).on('error', (err) => {
                Log.log(`error while requesting ViperServer to stop.` +
                        ` Request URL: ${url}\n` +
                        ` Error message: ${err}`, LogLevel.Default);
                reject(err)
            }).on('data', (data) => {
                let response = JSON.parse(data.toString())
                if ( !response.msg ) {
                    Log.log(`ViperServer did not complain about the way we requested it to exit.` + 
                            ` However, it also did not provide the expected bye-bye message.` + 
                            ` It said: ${data.toString}`, LogLevel.Debug)
                    resolve(true)
                } else if ( response.msg !== 'shutting down...' ) {
                    Log.log(`ViperServer responded with an unexpected bye-bye message: ${response.msg}`, 
                            LogLevel.Debug)
                    resolve(true)
                } else {
                    Log.log(`ViperServer has exited properly.`, LogLevel.Debug)
                    resolve(true)
                }
            })    
        })
    }

    private sendJobDiscardRequest(jid: number): Promise<boolean> {
        return new Promise((resolve, reject) => {
            Log.log(`Requesting ViperServer to discard verification job #${jid}...`, LogLevel.Debug);
            let url = this._url + ':' + this._port + '/discard/' + jid
            request.get(url).on('error', (err) => {
                Log.log(`error while requesting ViperServer to discard a job.` +
                        ` Request URL: ${url}\n` +
                        ` Error message: ${err}`, LogLevel.Default);
                reject(err)
            }).on('data', (data) => {
                let response = JSON.parse(data.toString())
                if ( !response.msg ) {
                    Log.log(`ViperServer did not complain about the way we requested it to discard a job.` + 
                            ` However, it also did not provide the expected confirmation message.` + 
                            ` It said: ${data.toString}`, LogLevel.Debug)
                    resolve(true)
                } else { 
                    Log.log(`ViperServer: ${response.msg}`, LogLevel.Debug)
                    resolve(true)
                }
            })
        })
    }



    public static isSupportedType(type: string) {
        if (!type) return false;
        return type.toLowerCase() == 'carbon' || type.toLowerCase() == 'silicon';
    }

    public static supportedTypes = '"carbon" and "silicon"';
}