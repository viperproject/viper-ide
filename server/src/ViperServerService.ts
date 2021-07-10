/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
 
'use strict'

import * as request from 'request'
import * as StreamValues from 'stream-json/streamers/StreamValues'
import * as child_process from 'child_process'
import * as tree_kill from 'tree-kill'
import * as path from 'path'
import * as SOUND from 'sound-play'
import * as os from 'os'
import { Log } from './Log'
import { Settings } from './Settings'
import { Common, Backend, LogLevel, Commands, VerificationState } from './ViperProtocol'
import { Server } from './ServerClass'
import { BackendService } from './BackendService'
import { DiagnosticSeverity } from 'vscode-languageserver'
import { assert } from 'console'

enum Sounds {
    MinorIssue = 1,
    MinorSuccess,
    MajorIssue,
    MajorSuccess,
}

export class ViperServerService extends BackendService {

    /** 
     * TODO: Each nullable variable should be replaced with a promise.
     * TODO: All clients that rely on such objects should be rewritten via the async pattern. ATG 2021
     **/
    private _server_logfile: string | undefined
    private _port: number | undefined
    private _url: string | undefined
    private _pipeline = null
    /** promise that resolved with the backend process' exit code */
    private _backendProcessExit: Promise<number> = null

    // the JID that ViperServer assigned to the current verification job.
    private _job_id: number

    // the list of PIDs that are to be killed after stopping the current job.
    // FIXME:this is needed because Carbon does not stop the corresponding Boogie process. 
    // FIXME:see https://bitbucket.org/viperproject/carbon/issues/225
    // FIXME:search keyword [FIXME:KILL_BOOGIE] for other parts of this workaround. 
    private _boogie_pids: number[] | undefined = null
    
    private _current_file: string
    public getUriOfCurrentFile(): string {
        return Common.pathToUri(this._current_file)
    }

    public constructor() {
        super()
        this.isViperServerService = true
        this.engine = "ViperServer"
    }

    private emitSound(sfx: Sounds) {
        if (!<Boolean>Settings.settings.preferences.enableSoundEffects) return 
        let sfx_prefix = <string>Settings.settings.paths.sfxPrefix
        if (!sfx_prefix) return
        if (sfx === Sounds.MinorIssue)   SOUND.play(path.join(sfx_prefix, 'falling-down.wav')) 
        if (sfx === Sounds.MinorSuccess) SOUND.play(path.join(sfx_prefix, 'bonus-pickup.wav')) 
        if (sfx === Sounds.MajorIssue)   SOUND.play(path.join(sfx_prefix, 'engine-dying.mp3')) 
        if (sfx === Sounds.MajorSuccess) SOUND.play(path.join(sfx_prefix, 'magic.mp3')) 
    }

    public async start(): Promise<boolean> {
        const policy = Settings.settings.viperServerSettings.viperServerPolicy;
        if (policy === 'attach') {
            this.backendProcess = null;
            this._url = Settings.settings.viperServerSettings.viperServerAddress;
            this._port = Settings.settings.viperServerSettings.viperServerPort;
            return true;
        } else if (policy === 'create') {
            const command = await this.getViperServerStartCommand()
            Log.log(command, LogLevel.Debug);

            Server.startingOrRestarting = true;
            this.startTimeout();

            this.backendProcess = child_process.exec(command, { 
                maxBuffer: 1024 * Settings.settings.advancedFeatures.verificationBufferSize, 
                cwd: Server.backendOutputDirectory 
            });
            const expected_url_msg = new RegExp(/ViperServer online at ([/a-zA-Z0-9:.\-_]+):(\d+).*/);
            const expected_log_msg = new RegExp(/Writing \[level:(\w+)\] logs into journal: (.*)/);
            const serverReady = new Promise((resolve:(success: boolean) => void, reject) => {
                this.backendProcess.stdout.on('data', (data: string) => {
                    Log.logWithOrigin("ViperServer", data.trim(), LogLevel.LowLevelDebug);
                    const res = expected_url_msg.exec(data);
                    const log = expected_log_msg.exec(data);
                    if (res != null && res.length === 3) {
                        //FIXME: disabling Wifi causes this language server to crash (blame request.post).
                        //this._url = res[1]
                        this._url = Settings.settings.viperServerSettings.viperServerAddress;
                        this._port = parseInt(res[2]);
                        // Ready to start working with the server.
                        resolve(true);
                    }
                    if (log != null && log.length === 2) {
                        this._server_logfile = log[1];
                    }
                });
            });
            this.backendProcess.stderr.on('data',(data:string) => {
                Log.logWithOrigin("ViperServer STDERR", data.trim(), LogLevel.Info);
            })
            this._backendProcessExit = new Promise(resolve => {
                this.backendProcess.on('exit', code => {
                    Log.log(`ViperServer has stopped with exit code ${code}.`, LogLevel.Info);
                    this.setStopped();
                    resolve(code);
                });
            });
            return await serverReady;
        } else {
            throw new Error('unexpected policy value in settings: ' + policy);
        }
    }

    public async stop(): Promise<boolean> {
        if (this.backendProcess) {
            Log.log(`Sending exit request to ViperServer...`, LogLevel.Debug);
            this.setStopping();
            const stopResponse = await this.sendStopRequest();
            // wait until server process has exited:
            assert(this._backendProcessExit != null);
            await this._backendProcessExit;
            // do not call `this.setStopped()` as this already happens before resolving `_backendProcessExit`.
            this.removeAllListeners();
            this.backendProcess = null;
            this.isSessionRunning = false;
            return stopResponse;
        } else {
            Log.log(`ViperServer has already stopped.`, LogLevel.Debug);
            this.setStopped();
            return true;
        }
    }

    public stopVerification(secondTry: boolean = false): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.sendJobDiscardRequest(this._job_id).then(() => {
                this.isSessionRunning = false
                resolve(true)
            }).catch((e) => {
                reject(e)
            })
        })
    }

    public swapBackend(newBackend: Backend) {
        this.setReady(newBackend)
    }

    private removeAllListeners() {
        this.backendProcess.removeAllListeners()
        this.backendProcess.stdout.removeAllListeners()
        this.backendProcess.stderr.removeAllListeners()
    }

    private logLevelToStr(l: number): string {
        switch (l) {
            case 0: return `OFF`
            case 1: return `ERROR`
            case 2: return `WARN`
            case 3: return `INFO`
            case 4: return `TRACE`
            case 5: return `ALL`
            default: return `ALL`
        }
    }

    private async getViperServerStartCommand(): Promise<string> {
        let javaPath: string
        try {
            const res = await Settings.getJavaPath();
            javaPath = res.path;
        } catch (errorMsg) {
            Log.hint(errorMsg);
            throw errorMsg;
        }

        const javaArgs = Settings.settings.javaSettings.customArguments;
        const customArgs = Settings.settings.viperServerSettings.customArguments;
        const logLevel = this.logLevelToStr(Settings.settings.preferences.logLevel);
        const logFile = Settings.logDirPath == null ? os.tmpdir() : Settings.logDirPath;
        let command = `${javaPath} ${javaArgs} ${customArgs} --logLevel ${logLevel} --logFile ${logFile}`;

        command = command.replace(/\$backendPaths\$/g, Settings.viperServerJars())
        command = command.replace(/\$backendSpecificCache\$/g, (Settings.settings.viperServerSettings.backendSpecificCache === true ? "--backendSpecificCache" : ""))
        command = command.replace(/\$mainMethod\$/g, "viper.server.ViperServerRunner")
        return command
    }

    private getZ3PidsOfCurrentBoogieProcesses(): Promise<number[]> {
        // Find the current Boogie processes (there's typically only one)
        return this.getBoogiePids().then(boogie_pid_list => {
            Log.log(`Current Boogie processes: ${boogie_pid_list.join(', ')}`, LogLevel.LowLevelDebug)
            this._boogie_pids = boogie_pid_list
            this.getZ3Pids(boogie_pid_list).then(z3_pids => {
                Log.log(`Current Z3 processes have the following PIDs: ${z3_pids}`, LogLevel.Info)
                return z3_pids
            }).catch(err => {
                Log.error(`Collecting PIDs for Z3 processes failed.`)
                return err
            })
        }).catch(err => {
            Log.error(`Could not get PIDs of current Boogie processes:\n ${err.join('\n ')}`)
            return err
        })
    }

    private cleanupProcessImpl(ps: number[]): Promise<number[]> { 
        return Promise.all(ps.map(pid => { 
            return new Promise<number>((res, rej) => { 
                tree_kill(pid, "SIGTERM", err1 => { 
                    if (err1) { 
                        Log.log(`Terminating process with PID ${pid} did not success: ${err1}.` +
                                ` Try sending SIGKILL...`, LogLevel.LowLevelDebug)
                        tree_kill(pid, "SIGKILL", err2 => { 
                            if (err2) rej(err2)
                            else res(pid)
                        })
                    } else { 
                        res(pid)
                    }
                })
            })
        }))
    }

    private cleanupProcesses(): Promise<void> {
        return new Promise((res, rej) => {
            if ( Server.backend.type === 'carbon' && this._boogie_pids ) {
                
                let boogie_pids_promise = this._boogie_pids
                ? Promise.resolve(this._boogie_pids)
                : this.getBoogiePids()
                
                boogie_pids_promise.then(bpids => this.cleanupProcessImpl(bpids).then(pids => {
                    Log.log(`Successfully terminated the following Boogie processes: ${pids}`, LogLevel.Info)
                }).catch(err => {
                    Log.log(`Did not find zombie Boogie instances (that's a good thing!)`, LogLevel.LowLevelDebug)
                }).finally(() => {
                    this._boogie_pids = null
                    res()
                }))

            } else {
                res()
            }
        })
    }

    protected startVerifyProcess(command: string, file: string, onData, onError, onClose) {
        this._current_file = file 
        this._pipeline = StreamValues.withParser()
        this._pipeline.on("data", (object) => { 

            let message = object.value
            //Log.log('recieved message: ' + JSON.stringify(message, null, 2), LogLevel.LowLevelDebug)

            if ( message.msg ) {
                onData(JSON.stringify({ 
                    type: "Error",
                    file: file,
                    errors: [{
                        tag: 'exception',
                        start: '0:0',
                        end: '0:12',
                        message: message.msg,
                        cached: 'unknown'
                    }]
                }))
                return onData(JSON.stringify({ type: "Success" }))
            }

            if ( !message.hasOwnProperty('msg_type') ) {
                throw new Error(`property 'msg_type' not found in message=${message}`)
            }

            if ( !message.hasOwnProperty('msg_body') ) {
                throw new Error(`property 'msg_body' not found in message=${message}`)
            }
                
            if ( message.msg_type === 'statistics' ) {
                return onData(JSON.stringify({
                    type: "VerificationStart", 
                    nofPredicates: parseInt(message.msg_body.predicates), 
                    nofMethods: parseInt(message.msg_body.methods), 
                    nofFunctions: parseInt(message.msg_body.functions)
                }))
            }

            if ( message.msg_type === 'program_outline' ) {
                return onData(JSON.stringify({
                    type: "Outline", 
                    members: message.msg_body.members.map((m) => {
                        return {
                            type: m.type,
                            name: m.name,
                            location: m.position.file + '@' + m.position.start + '-' +  m.position.end
                        }
                    })
                }))
            }

            if ( message.msg_type === 'program_definitions' ) {
                // Forward a copy of this message to a potential debugger extension.
                Server.connection.sendNotification(Commands.UnhandledViperServerMessageType, message)

                return onData(JSON.stringify({
                    type: "Definitions", 
                    definitions: message.msg_body.definitions.map(d => {
                        return {
                            name: d.name,
                            type: d.type,
                            scopeStart: d.scopeStart,
                            scopeEnd: d.scopeEnd, 
                            location: d.location.file + '@' + d.location.start + '-' + d.location.end
                        }
                    })
                }))
            }

            if ( message.msg_type.includes('warning') && message.msg_body.length > 0 ) {
                Log.error(`ViperServer reports the following warning: ${message.msg_body.message}`, LogLevel.Default)
                let label = message.msg_type.includes('internal') 
                    ? 'internal' 
                    : message.msg_type.includes('parser') 
                        ? 'parser'
                        : 'geniric'
                
                return onData(JSON.stringify({
                    type: "Error",
                    file: file,
                    errors: message.msg_body.map((e) => {
                        if (e.position === '<no position>') 
                            e.position = {start: '0:0', end: '0:12'}
                        return {
                            tag: `${label}.warning`,
                            start: e.position.start,
                            end: e.position.end,
                            message: e.text,
                            cached: e.cached,
                            severity: DiagnosticSeverity.Warning
                        }
                    })
                }))
            }

            if ( message.msg_type === 'exception_report' ) {

                if ( message.msg_body.message === 'java.lang.InterruptedException' ) {
                    Log.log("ViperServer reports java.lang.InterruptedException", LogLevel.Info)
                    return 
                }

                // Ignore interruprion exceptions as they can occur during a normal interactive session                
                Log.error("ViperServer reports the following exception: " + message.msg_body.message + "\n trace:\n  " +
                    message.msg_body.stacktrace.join("\n  "), LogLevel.Default)

                onData(JSON.stringify({
                    type: "Error",
                    file: file,
                    errors: [{
                        tag: 'exceptional.error',
                        start: '0:0',
                        end: '0:12',
                        message: message.msg_body.message,
                        cached: false
                    }]
                }))
                return onData(JSON.stringify({ type: "Stopped" }))
            }

            if ( message.msg_type === 'backend_sub_process_report' ) {
                if ( message.msg_body.phase === 'after_input_sent' ) {
                    // If in use is Carbon, get and store the PIDs of dependent Z3 and Boogie processes
                    // (available only in newer versions of Carbon)
                    let bpid = message.msg_body.pid
                    Log.log(`Current Boogie PID: ${bpid}`, LogLevel.LowLevelDebug)
                    this._boogie_pids = [bpid]
                }
                return
            }

            if ( (message.msg_type === 'verification_result') || 
                 (message.msg_type === 'ast_construction_result') ) {

                if ( message.hasOwnProperty('msg_body') && 
                        message.msg_body.hasOwnProperty('status') ) {

                        if ( message.msg_body.status === 'failure' &&
                             message.msg_body.details.result.errors.length > 0) {  // we get zero errors in the overall results if the errors have been cached. 
                                
                            let errors = message.msg_body.details.result.errors
                            let first_error = errors[0]
                            let first_error_tag = first_error.tag

                            if ( errors.length === 1 && first_error_tag === 'exceptional.error' && first_error.text === 'Verification aborted exceptionally' ) {
                                // Ignore the exception as it's a normal interrupt. 
                                return onData(JSON.stringify({ type: "Success" }))
                            }

                            let global_failure = 
                                message.msg_type === 'ast_construction_result' ||
                                Server.backend.type === 'other' || 
                                /* TODO: Implement flag DoesCustomBackendSupportFineGrainedReporting */
                                message.msg_body.verifier === 'carbon' ||
                                first_error_tag === 'parser.error' || 
                                first_error_tag === 'parser.warning' ||
                                first_error_tag === 'consistency.error' ||
                                first_error_tag === 'typechecker.error' ||
                                first_error_tag === 'clioption.error' ||
                                first_error_tag === 'dependencynotfound.error' ||
                                first_error_tag === 'timeout.error' ||
                                first_error_tag === 'exceptional.error' ||
                                first_error_tag.includes('internal')

                            if ( message.msg_body.kind === 'for_entity' || global_failure ) {

                                if ( first_error.counterexample ) {
                                    // Forward a copy of this message to a potential debugger extension.
                                    Server.connection.sendNotification(Commands.UnhandledViperServerMessageType, message)
                                }

                                this.emitSound(Sounds.MinorIssue)
                                    
                                onData(JSON.stringify({ 
                                    type: "Error",
                                    file: file,
                                    errors: message.msg_body.details.result.errors.map((e) => {
                                        if (e.position === '<no position>') 
                                            e.position = {start: '0:0', end: '0:12'}
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
                                    message.msg_body.kind === 'for_entity' ) {

                            this.emitSound(Sounds.MinorSuccess)
                                
                            return onData(JSON.stringify({
                                type: (message.msg_body.details.entity.type === 'method' ? 'MethodVerified' 
                                    : (message.msg_body.details.entity.type === 'function' ? 'FunctionVerified' 
                                    :  message.msg_body.details.entity.type === 'predicate' ? 'PredicateVerified' : ''/*bad stuff*/ ) ),
                                name: message.msg_body.details.entity.name
                            }))

                        }
                        if ( message.msg_body.kind === 'overall' || 
                             message.msg_type === 'ast_construction_result' && message.msg_body.status === 'failure' ) {

                            if ( message.msg_body.status === 'success' ) {
                                this.emitSound(Sounds.MajorSuccess)
                            } else {
                                this.emitSound(Sounds.MajorIssue)
                            }
                            
                            onData(JSON.stringify({
                                type: "End", 
                                time: (message.msg_body.details.time * 0.001) + 's'
                            }))
                            return onData(JSON.stringify({ type: "Success" }))  // Success means the end of the process in this case 
                                                                                // (for some reason, we don't use Failure)
                        }
                } 
            } else {
                // Unhandled messages might be destined to some other extension via
                // the ViperApi
                Server.connection.sendNotification(Commands.UnhandledViperServerMessageType, message)
            }

            return true
        })
        
        // Notify dependent extensions about the server settings, e.g. what are the active verification backend's parameters 
        let message = {'msg_type': 'backend_configuration', 'msg_body': Server.backend}
        Server.connection.sendNotification(Commands.UnhandledViperServerMessageType, message)
        
        this.startVerifyStream(command, onData, onError, onClose)
    }

    private startVerifyStream(command: string, onData, onError, onClose) {
        Log.log('Sending verification request to ViperServer...', LogLevel.Debug)

        this.postStartRequest({
            arg: command
        }).then((jid) => {            
            this.isSessionRunning = true
            this._job_id = jid
            
            onData(JSON.stringify({type: "Start", backendType: command.startsWith('silicon') ? "Silicon" : "Carbon"}))

            Log.log(`Requesting ViperServer to stream results of verification job #${jid}...`, LogLevel.LowLevelDebug)
            let url = this._url + ':' + this._port + '/verify/' + jid
            request.get(url).on('error', (err) => {
                Log.error(`error while requesting results from ViperServer.` +
                          ` Request URL: ${url}\n` +
                          ` Error message: ${err}`, LogLevel.Default)
            }).pipe(this._pipeline)

        }).catch((err) => {
            Log.error(`ViperServer is overwhelmed (${err}). Try again in a few seconds.`, LogLevel.Default)            
            let uri = this.getUriOfCurrentFile()
            let task = Server.verificationTasks.get(uri)
            Server.sendStateChangeNotification({
                newState: VerificationState.Ready,
                filename: this._current_file,
                verificationCompleted:  false,
                uri: uri,
                error: "System overwhelmed. Please slow down your interaction."
            }, task);
        })
    }

    public flushCache(filePath?: string): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!this._url) {
                let msg = `The URL of a ViperServer instance isn't set yet.`
                Log.log(msg, LogLevel.Debug)
                resolve(msg)
            } else {
                let url = this._url + ':' + this._port + '/cache/flush'
                if (filePath) {
                    Log.log(`Requesting ViperServer to flush the cache for (` + filePath + `)...`, LogLevel.Info)

                    let options = {
                        url: url, 
                        headers: {'content-type': 'application/json'},
                        body: JSON.stringify({ backend: Server.backend.name, file: filePath })
                    }

                    request.post(options).on('error', (error) => {
                        Log.log(`error while requesting ViperServer to flush the cache for (` + filePath + `).` +
                                ` Request URL: ${url}\n` +
                                ` Error message: ${error}`, LogLevel.Default)
                        reject(error)

                    }).on('data', (data) => {
                        let response = JSON.parse(data.toString())
                        if ( !response.msg ) {
                            Log.log(`ViperServer did not complain about the way we requested it to flush the cache for (` + filePath + `).` + 
                                    ` However, it also did not provide the expected bye-bye message.` + 
                                    ` It said: ${data.toString}`, LogLevel.Debug)
                            resolve(response)
                        } else {
                            Log.log(`ViperServer has confirmed that the cache for (` + filePath + `) has been flushed.`, LogLevel.Debug)
                            resolve(response.msg)
                        }
                    })

                } else {
                    Log.log(`Requesting ViperServer to flush the entire cache...`, LogLevel.Info)

                    request.get(url).on('error', (error) => {
                        Log.log(`error while requesting ViperServer to flush the entire cache.` +
                                ` Request URL: ${url}\n` +
                                ` Error message: ${error}`, LogLevel.Default)
                        reject(error)

                    }).on('data', (data) => {
                        let response = JSON.parse(data.toString())
                        if ( !response.msg ) {
                            Log.log(`ViperServer did not complain about the way we requested it to flush the entire cache.` + 
                                    ` However, it also did not provide the expected bye-bye message.` + 
                                    ` It said: ${data.toString}`, LogLevel.Debug)
                            resolve(response)
                        } else {
                            Log.log(`ViperServer has confirmed that the entire cache has been flushed.`, LogLevel.Debug)
                            resolve(response.msg)
                        }
                    })
                }
            }
        })
    }

    private postStartRequest(request_body): Promise<number> {
        return new Promise((resolve, reject) => {
            Log.log(`Requesting ViperServer to start new job...`, LogLevel.Debug)
            if (!this._url) {
                let msg = `The URL of a ViperServer instance isn't set yet.`
                Log.log(msg, LogLevel.Debug)
                reject(msg)
            } else {
                let options = {
                    url: this._url + ':' + this._port + '/verify', 
                    headers: {'content-type': 'application/json'},
                    body: JSON.stringify(request_body)
                }
                request.post(options, (error, response, body) => { 
                    let json_body = JSON.parse(body)
            
                    // This callback processes the initial response from ViperServer. 
                    // ViperServer confirms that the verification task has been accepted and 
                    //  returns a job ID (which is unique for this session).
                    if (error) {
                        Log.log(`Got error from POST request to ViperServer: ` + 
                                JSON.stringify(error, undefined, 2), LogLevel.Debug)
                        reject(error)
                    }
                    if (response.statusCode !== 200) {
                        Log.log(`Bad response on POST request to ViperServer: ` + 
                                JSON.stringify(response, undefined, 2), LogLevel.Debug)
                        reject(`bad response code: ${response.statusCode}`)
                    }
                    if (typeof json_body.msg !== 'undefined') {
                        Log.log(`ViperServer had trouble accepting the POST request: ` + 
                                JSON.stringify(body.msg, undefined, 2), LogLevel.Debug)
                        reject(`ViperServer: ${json_body.msg}`)
                    }
                    if (typeof json_body.id === 'undefined') {
                        Log.log(`It seems that ViperServer\'s REST API has been changed.` + 
                                ` Body of response: ` + JSON.stringify(json_body, undefined, 2),
                                LogLevel.Debug)
                        reject(`ViperServer did not provide a job ID: ${json_body}`)
                    } 
                    if (json_body.id === -1) {
                        Log.log(`ViperServer was unable to book verification job (jid -1)`,
                                LogLevel.Debug)
                        reject(`ViperServer returned job ID -1`)
                    }
                    Log.log(`ViperServer started new job with ID ${json_body.id}`,
                            LogLevel.Debug)
                    resolve(json_body.id)
                })
            }
        })
    }

    private sendStopRequest(): Promise<boolean> {
        return new Promise((resolve, reject) => { 
            Log.log(`Requesting ViperServer to exit...`, LogLevel.Debug)
            if (!this._url) {
                Log.log(`The URL of a ViperServer instance isn't set yet.`, LogLevel.Debug)
                resolve(false)
            } else {
                let url = this._url + ':' + this._port + '/exit'
                Log.log(`Get request to '${url}'`, LogLevel.LowLevelDebug);
                request.get(url).on('error', (err) => {
                    Log.log(`error while requesting ViperServer to stop.` +
                            ` Request URL: ${url}\n` +
                            ` Error message: ${err}`, LogLevel.Default)
                    reject(err)
                }).on('data', (data) => {
                    Log.log(`Response received '${data}'`, LogLevel.LowLevelDebug);
                    try {
                        const response = JSON.parse(data.toString())
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
                    } catch(err) {
                        reject(new Error(`Parsing response to stop request has failed with error '${err}'`));
                    }
                })
            }
        })
    }

    private isInternalServerError(data_str: string): boolean {
        let err_r = new RegExp(/.*internal server error.*/)
        if ( err_r.test(data_str) ) {
            return true
        }
        return false
    }

    private sendJobDiscardRequest(jid: number): Promise<boolean> {

        return new Promise<boolean>((resolve, reject) => {
            Log.log(`Requesting ViperServer to discard verification job #${jid}...`, LogLevel.Debug)
            if (!this._url) {
                Log.log(`The URL of a ViperServer instance isn't set yet.`, LogLevel.Debug)
                resolve(false)
            } else {
                let url = this._url + ':' + this._port + '/discard/' + jid
                request.get(url).on('error', (err: any) => {
                    Log.log(`error while requesting ViperServer to discard a job.` +
                            ` Request URL: ${url}\n` +
                            ` Error message: ${err}`, LogLevel.Default)
                    reject(err)
                }).on('data', (data) => {
                    let data_str = data.toString()
                    if ( this.isInternalServerError(data_str) ) {
                        Log.log(`ViperServer encountered an internal server error.` + 
                                ` The exact message is: ${data_str}`, LogLevel.Debug)
                        resolve(false)
                    }
                    try {
                        let response = JSON.parse(data_str)
                        if ( !response.msg ) {
                            Log.log(`ViperServer did not complain about the way we requested it to discard a job.` + 
                                    ` However, it also did not provide the expected confirmation message.` + 
                                    ` It said: ${data_str}`, LogLevel.Debug)
                            resolve(true)
                        } else { 
                            Log.log(`ViperServer: ${response.msg}`, LogLevel.Debug)
                            resolve(true)
                        }
                    } catch (e) {
                        Log.log(`ViperServer responded with something that is not a valid JSON object.` + 
                                ` The exact message is: ${data_str}`, LogLevel.Debug)
                        resolve(false)
                    }
                })
            }
        }).then(shutdown_success => {
            return this.cleanupProcesses().then(() => shutdown_success)
        })
    }

    private getChildrenPidsForProcess(pname: string, pid: number): Promise<number[]> {
        return new Promise((resolve, reject) => {
            let command: string = null
            if ( Settings.isWin ) {
                command = `wmic process where (ParentProcessId=${pid} and Name="${pname}") get ProcessId`
            } else {
                command = `pgrep -l -P ${pid} ${pname}`
            }
            let child_pids: number[] = []
            Common.executer(command, 
                stdout => {
                    let array_of_lines = (<string>stdout).match(/[^\r\n]+/g)
                    if (array_of_lines) {
                        array_of_lines.forEach(line => {
                            let regex = /.*?(\d+).*/.exec(line)
                            if (regex != null && regex[1]) 
                                child_pids.push( parseInt(regex[1]) )
                        })
                    }
                }, stderr => {
                    if (stderr) {
                        Log.log(`Process with PID ${pid} does not exist anymore. ` + 
                                `Hence, I couldn't find any of its children.`, LogLevel.LowLevelDebug)
                    }
                }, () => {
                    resolve(child_pids)
                })
        })
    }

    private getBoogiePids(): Promise<number[]> {
        if ( Settings.isWin ) {
            return this.getChildrenPidsForProcess("Boogie.exe", this.backendServerPid)
        } else {
            return this.getChildrenPidsForProcess("Boogie", this.backendServerPid)
        } 
    }

    private getZ3Pids(parent_proc_pid_list: number[]): Promise<number[]> {
        return Promise.all(parent_proc_pid_list.map(ppid => this.getZ3PidsImpl(ppid))).then((z3_pids_list: number[][]) => {
            return [].concat.apply([], z3_pids_list)  // efficient flattening
        })
    }

    private getZ3PidsImpl(parent_proc_pid: number): Promise<number[]> {
        let z3_exe_name = Settings.isWin ? "z3.exe" : "z3"
        return this.getChildrenPidsForProcess(z3_exe_name, parent_proc_pid).catch(reason => {
            // The parent process (e.g. Boogie) might not have created its Z3 instances at this time. 
            // This is normal behavior. 
            return []
        })
    }

    public static isSupportedType(type: string) {
        if (!type) return false
        return type.toLowerCase() == 'carbon' || type.toLowerCase() == 'silicon' || type.toLowerCase() == 'other'
    }

    public static supportedTypes = '"carbon", "silicon", "other"'

    public getAddress() {
        return this._url + ":" + this._port
    }
}
