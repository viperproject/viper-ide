/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
 
'use strict'

import { clearTimeout } from 'timers'
import * as fs from 'fs'
import rp = require('request-promise-native')
import request = require('request')
import StreamJsonObjects = require("stream-json/utils/StreamJsonObjects")

import child_process = require('child_process')
import { Log } from './Log'
import { Settings } from './Settings'
import { BackendOutputType, Common, Stage, Backend, VerificationState, LogLevel } from './ViperProtocol'
import { Server } from './ServerClass'
import { VerificationTask } from './VerificationTask'
import { BackendService } from './BackendService'

import tree_kill = require('tree-kill')
import { error } from 'util'
import { resolve } from '../node_modules/vscode-languageserver/lib/files';

export class ViperServerService extends BackendService {

    private _server_logfile: string
    private _port: number
    private _url: string
    private _stream = StreamJsonObjects.make()

    // the JID that ViperServer assigned to the current verification job.
    private _job_id: number

    // the list of PIDs that are to be killed after stopping the current job.
    // FIXME:this is needed because Carbon does not stop the corresponding Boogie process. 
    // FIXME:see https://bitbucket.org/viperproject/carbon/issues/225
    // FIXME:search keyword [FIXME:KILL_BOOGIE] for other parts of this workaround. 
    private _uncontrolled_pid_list: number[]

    public constructor() {
        super()
        this.isViperServerService = true
        this.engine = "ViperServer"
    }

    public start(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            let policy = Settings.settings.viperServerSettings.viperServerPolicy
            if ( policy === 'attach' ) {
                this.backendProcess = null
                this._url = Settings.settings.viperServerSettings.viperServerAddress
                this._port = Settings.settings.viperServerSettings.viperServerPort
                resolve(true)

            } else if ( policy === 'create' ) {
                let command = this.getViperServerStartCommand()
                Log.log(command, LogLevel.Debug)

                Server.startingOrRestarting = true
                this.startTimeout(++this.instanceCount)
                
                let errorReason = ""
                this.backendProcess = child_process.exec(command, { 
                    maxBuffer: 1024 * Settings.settings.advancedFeatures.verificationBufferSize, 
                    cwd: Server.backendOutputDirectory 
                })
                let expected_url_msg = new RegExp(/ViperServer online at ([/a-zA-Z0-9:.\-_]+):(\d+).*/)
                let expected_log_msg = new RegExp(/Writing \[level:(\w+)\] logs into journal: (.*)/)
                this.backendProcess.stdout.on('data', (data: string) => {
                    Log.logWithOrigin("VS", data.trim(), LogLevel.LowLevelDebug)
                    let res = expected_url_msg.exec(data)
                    let log = expected_log_msg.exec(data)
                    if ( res != null && res.length === 3 ) {
                        //FIXME: disabling Wifi causes this language server to crash (blame request.post).
                        //this._url = res[1]
                        this._url = Settings.settings.viperServerSettings.viperServerAddress
                        this._port = parseInt(res[2])
                        // This is the last stdout message we expect from the server.
                        this.removeAllListeners()
                        // Ready to start working with the server.
                        resolve(true)
                    } 
                    if ( log != null && log.length === 2 ) {
                        this._server_logfile = log[1]
                    }
                })
                this.backendProcess.stderr.on('data',(data:string) => {
                    errorReason = errorReason += "\n" + data
                })
                this.backendProcess.on('exit', code => {
                    Log.log("ViperServer is stopped.", LogLevel.Info)
                    this.setStopped()
                })
            
            } else {
                throw new Error('unexpected value in settings: ' + policy)
            }
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
                    this.backendProcess = null
                    this.isSessionRunning = false
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

    private getViperServerStartCommand(): string {
        let command = "java " + Settings.settings.javaSettings.customArguments +  
                      " " + Settings.settings.viperServerSettings.customArguments + 
                      " --logLevel " + this.logLevelToStr(Settings.settings.preferences.logLevel) +
                      " --logFile " + Server.tempDirectory

        command = command.replace(/\$backendPaths\$/g, Settings.viperServerJars())
        command = command.replace(/\$backendSpecificCache\$/g, (Settings.settings.viperServerSettings.backendSpecificCache === true ? "--backendSpecificCache" : ""))
        command = command.replace(/\$mainMethod\$/g, "viper.server.ViperServerRunner")
        return command
    }

    protected startVerifyProcess(command: string, file: string, onData, onError, onClose) {

        this._stream.output.on("data", (object) => { 
            let message = object.value
            //Log.log('recieved message: ' + JSON.stringify(message, null, 2), LogLevel.LowLevelDebug)
            if ( message.hasOwnProperty('msg_type') ) {

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

                if ( message.msg_type === 'exception_report' ) {
                    Log.error("The following exception occured in ViperServer: " + message.msg_body.message + "\n trace:\n  " +
                        message.msg_body.stacktrace.join("\n  "), LogLevel.Default)
                    onData(JSON.stringify({
                        type: "Error",
                        file: file,
                        errors: [{
                            tag: 'exceptional.error',
                            start: '0:0',
                            end: '0:0',
                            message: message.msg_body.message,
                            cached: false
                        }]
                    }))
                    return onData(JSON.stringify({ type: "Stopped" }))
                }

                if ( message.msg_type === 'verification_result' ) {

                    if ( message.hasOwnProperty('msg_body') && 
                         message.msg_body.hasOwnProperty('status') ) {

                            if ( message.msg_body.status === 'failure' && 
                                 message.msg_body.details.result.errors.length > 0) {  // we get zero errors in the overall results if the errors have been cached. 

                                let first_error_tag = message.msg_body.details.result.errors[0].tag
                                let global_failure = 
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
                            
                            if ( message.msg_body.kind === 'overall' ) {
                                onData(JSON.stringify({
                                    type: "End", 
                                    time: (message.msg_body.details.time * 0.001) + 's'
                                }))
                                //if ( message.msg_body.status === 'success' ){
                                    return onData(JSON.stringify({ type: "Success" }))
                                //} else {
                                //return onData(JSON.stringify({ type: "Failure" }))
                                //}
                            }

                    } else {
                        throw `property 'msg_body' not found in message=${message}`
                    }
                } 
            } else {
                throw `property 'msg_type' not found in message=${message}`
            }
            return true 
        })
        this._stream.output.on("end", () => {
            //Log.log("ViperServer stream ended.", LogLevel.LowLevelDebug)
            this._stream = StreamJsonObjects.make()
        })

        this.startVerifyStream(command, onData, onError, onClose)
        this.isSessionRunning = true
    }

    private startVerifyStream(command: string, onData, onError, onClose) {
        Log.log('Sending verification request to ViperServer...', LogLevel.Debug) 

        let jid_promise = this.postStartRequest({
            arg: command
        })

        jid_promise.then((jid) => {
            this._job_id = jid
            
            onData(JSON.stringify({type: "Start", backendType: command.startsWith('silicon') ? "Silicon" : "Carbon"}))

            Log.log(`Requesting ViperServer to stream results of verification job #${jid}...`, LogLevel.LowLevelDebug)
            let url = this._url + ':' + this._port + '/verify/' + jid
            request.get(url).on('error', (err) => {
                Log.log(`error while requesting results from ViperServer.` +
                        ` Request URL: ${url}\n` +
                        ` Error message: ${err}`, LogLevel.Default)
            }).pipe(this._stream.input)

        }).catch((err) => {
            Log.log('unfortunately, we did not get a job ID from ViperServer: ' + err, LogLevel.LowLevelDebug)
        })
    }

    public flushCache(filePath?: string): Promise<string> {
        return new Promise((resolve, reject) => {
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
        })
    }

    private postStartRequest(request_body): Promise<number> {
        return new Promise((resolve, reject) => {
            Log.log(`Requesting ViperServer to start new job...`, LogLevel.Debug)
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
                Log.log(`ViperServer started new job with ID ${json_body.id}`,
                        LogLevel.Debug)
                resolve(json_body.id)
            })

        })
    }

    private sendStopRequest(): Promise<boolean> {
        return new Promise((resolve, reject) => { 
            Log.log(`Requesting ViperServer to exit...`, LogLevel.Debug)
            let url = this._url + ':' + this._port + '/exit'
            request.get(url).on('error', (err) => {
                Log.log(`error while requesting ViperServer to stop.` +
                        ` Request URL: ${url}\n` +
                        ` Error message: ${err}`, LogLevel.Default)
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

    private isInternalServerError(data_str: string): boolean {
        let err_r = new RegExp(/.*internal server error.*/)
        if ( err_r.test(data_str) ) {
            return true
        }
        return false
    }

    private sendJobDiscardRequest(jid: number): Promise<boolean> {
        
        return new Promise((resolve, reject) => {
            
            new Promise((resolve_0, reject_0) => {
                //FIXME:KILL_BOOGIE
                if ( Server.backend.type === 'carbon' ) {
                    this.getBoogiePids().then(boogie_pid_list => {
                        this._uncontrolled_pid_list = boogie_pid_list
                        Log.log(`[KILL_BOOGIE] found uncontrolled Boogie processes: ${boogie_pid_list.join(', ')}`, LogLevel.LowLevelDebug)
                        resolve_0(true)
                    }).catch((errors) => {
                        Log.log(`[KILL_BOOGIE] errors found while scanning for uncontrolled Boogie processes:\n ${errors.join('\n ')}`, LogLevel.LowLevelDebug)
                        reject_0(errors)
                    })
                } else {
                    resolve_0(true)
                }

            }).then(() => {
                Log.log(`Requesting ViperServer to discard verification job #${jid}...`, LogLevel.Debug)
                let url = this._url + ':' + this._port + '/discard/' + jid
                request.get(url).on('error', (err) => {
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



            }).then(() => {
                if ( Server.backend.type === 'carbon' ) {
                    this.killUncontrolledProcesses().catch((error) => {
                        Log.error(`Could not stop uncontrolled processes after Carbon:\n ${error}`)
                    })
                }
            })
        })
    }

    private killUncontrolledProcesses(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if ( this._uncontrolled_pid_list.length == 0 ) {
                resolve(true)
            } else {
                if ( Settings.isWin ) {
                    Promise.all(this._uncontrolled_pid_list.map(pid => {
                        return new Promise((res, rej) => {
                            this.getZ3Pids(pid).then(z3_pid_list => {
                                if ( z3_pid_list.length == 0 ) {
                                    res(true)
                                } else {
                                    let taskkill = Common.executer(`Taskkill /PID ${z3_pid_list.join(' /PID ')} /F /T`)
                                    taskkill.stderr.on('data', error => {
                                        rej(error)
                                    })
                                    taskkill.on('exit', () => {
                                        res(true)
                                    })
                                }
                            }).catch((error) => {
                                rej(error)
                            })
                        })
                    })).then(() => {
                        resolve(true)
                    }).catch(error => {
                        reject(error)
                    })

                } else { // Linux, Mac
                    Promise.all(this._uncontrolled_pid_list.map(pid => {
                        return new Promise((res, rej) => {
                            tree_kill(pid, "SIGTERM", error => {
                                //res(true)
                            })
                            res(true)
                        })
                    })).then(() => {
                        resolve(true)
                    }).catch(error => {
                        reject(error)
                    })
                }
            }
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
            let wmic = Common.executer(command)
            let child_pids: number[] = []
            let errors: string[] = []
            wmic.stdout.on('data', stdout => {
                let array_of_lines = (<string>stdout).match(/[^\r\n]+/g)
                if (array_of_lines) {
                    array_of_lines.forEach(line => {
                        let regex = /.*?(\d+).*/.exec(line)
                        if (regex != null && regex[1]) {
                            child_pids.push( parseInt(regex[1]) )
                        }
                    })
                }
            })
            wmic.stderr.on('data', data => {
                errors.concat( data + "" )
            })
            wmic.on('exit', () => {
                if ( errors.length == 0 ) {
                    resolve( child_pids )
                } else {
                    reject( errors )
                }
            })
        })
    }

    private getBoogiePids(): Promise<number[]> {
        if ( Settings.isWin ) {
            return  this.getChildrenPidsForProcess("Boogie.exe", this.backendServerPid)
        } else if ( Settings.isLinux ) {
            return this.getChildrenPidsForProcess("Boogie", this.backendServerPid)
        } else {
            // Java(ViperServer) -> sh(Boogie) -> mono(Boogie.exe) -> {z3, z3, ...}
            //return this.getChildrenPidsForProcess("sh", this.backendServerPid)
            return new Promise((resolve, reject) => {
                this.getChildrenPidsForProcess("sh", this.backendServerPid).then(sh_pid_list => {
                    this.getChildrenPidsForProcess("mono", sh_pid_list[0]).then(mono_pid_list => {
                        resolve(mono_pid_list)
                    }).catch(err => {
                        reject(`- mono process(es) not found -` + err)
                    })
                }).catch(error => {
                    reject(`-- sh process(es) not found -- ` + error)
                })
            })
        }
    }

    private getZ3Pids(parent_proc_pid: number): Promise<number[]> {
        if ( Settings.isWin ) {
            return this.getChildrenPidsForProcess("z3.exe", parent_proc_pid)

        } else if ( Settings.isLinux ) {
            return this.getChildrenPidsForProcess("z3", parent_proc_pid)
            
        }  else { // Mac
            return new Promise((resolve, reject) => {
                this.getChildrenPidsForProcess("mono", parent_proc_pid).then(mono_pid_list => {
                        this.getChildrenPidsForProcess("z3", mono_pid_list[0]).then(z3_pid_list => {
                            resolve(z3_pid_list)
                        }).catch(err => {
                            reject(`- z3 process(es) not found -` + err)
                        })
                }).catch(error => {
                    reject(`-- mono process(es) not found -- ` + error)
                })
            })
        }
    }

    public static isSupportedType(type: string) {
        if (!type) return false
        return type.toLowerCase() == 'carbon' || type.toLowerCase() == 'silicon' || type.toLowerCase() == 'other'
    }

    public static supportedTypes = '"carbon", "silicon", "other"'
}

