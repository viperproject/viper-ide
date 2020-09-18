/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const request = require("request");
const StreamJsonObjects = require("stream-json/utils/StreamJsonObjects");
const child_process = require("child_process");
const Log_1 = require("./Log");
const Settings_1 = require("./Settings");
const ViperProtocol_1 = require("./ViperProtocol");
const ServerClass_1 = require("./ServerClass");
const BackendService_1 = require("./BackendService");
const tree_kill = require("tree-kill");
class ViperServerService extends BackendService_1.BackendService {
    constructor() {
        super();
        this._stream = StreamJsonObjects.make();
        this.isViperServerService = true;
        this.engine = "ViperServer";
    }
    start() {
        return new Promise((resolve, reject) => {
            let policy = Settings_1.Settings.settings.viperServerSettings.viperServerPolicy;
            if (policy === 'attach') {
                this.backendProcess = null;
                this._url = Settings_1.Settings.settings.viperServerSettings.viperServerAddress;
                this._port = Settings_1.Settings.settings.viperServerSettings.viperServerPort;
                resolve(true);
            }
            else if (policy === 'create') {
                let command = this.getViperServerStartCommand();
                Log_1.Log.log(command, ViperProtocol_1.LogLevel.Debug);
                ServerClass_1.Server.startingOrRestarting = true;
                this.startTimeout(++this.instanceCount);
                let errorReason = "";
                this.backendProcess = child_process.exec(command, {
                    maxBuffer: 1024 * Settings_1.Settings.settings.advancedFeatures.verificationBufferSize,
                    cwd: ServerClass_1.Server.backendOutputDirectory
                });
                let expected_url_msg = new RegExp(/ViperServer online at ([/a-zA-Z0-9:.\-_]+):(\d+).*/);
                let expected_log_msg = new RegExp(/Writing \[level:(\w+)\] logs into journal: (.*)/);
                this.backendProcess.stdout.on('data', (data) => {
                    Log_1.Log.logWithOrigin("VS", data.trim(), ViperProtocol_1.LogLevel.LowLevelDebug);
                    let res = expected_url_msg.exec(data);
                    let log = expected_log_msg.exec(data);
                    if (res != null && res.length === 3) {
                        //FIXME: disabling Wifi causes this language server to crash (blame request.post).
                        //this._url = res[1]
                        this._url = Settings_1.Settings.settings.viperServerSettings.viperServerAddress;
                        this._port = parseInt(res[2]);
                        // This is the last stdout message we expect from the server.
                        this.removeAllListeners();
                        // Ready to start working with the server.
                        resolve(true);
                    }
                    if (log != null && log.length === 2) {
                        this._server_logfile = log[1];
                    }
                });
                this.backendProcess.stderr.on('data', (data) => {
                    errorReason = errorReason += "\n" + data;
                });
                this.backendProcess.on('exit', code => {
                    Log_1.Log.log("ViperServer is stopped.", ViperProtocol_1.LogLevel.Info);
                    this.setStopped();
                });
            }
            else {
                throw new Error('unexpected value in settings: ' + policy);
            }
        });
    }
    stop() {
        return new Promise((resolve, reject) => {
            if (this.backendProcess) {
                Log_1.Log.log(`Sending exit request to ViperServer...`, ViperProtocol_1.LogLevel.Debug);
                //clearTimeout(this.timeout)
                this.setStopping();
                this.backendProcess.removeAllListeners();
                this.sendStopRequest().then(() => {
                    this.setStopped();
                    this.backendProcess = null;
                    this.isSessionRunning = false;
                    resolve(true);
                }).catch((e) => {
                    reject(e);
                });
            }
            else {
                Log_1.Log.log(`ViperServer has already stopped.`, ViperProtocol_1.LogLevel.Debug);
                this.setStopped();
                return resolve(true);
            }
        });
    }
    stopVerification(secondTry = false) {
        return new Promise((resolve, reject) => {
            this.sendJobDiscardRequest(this._job_id).then(() => {
                this.isSessionRunning = false;
                resolve(true);
            }).catch((e) => {
                reject(e);
            });
        });
    }
    swapBackend(newBackend) {
        this.setReady(newBackend);
    }
    removeAllListeners() {
        this.backendProcess.removeAllListeners();
        this.backendProcess.stdout.removeAllListeners();
        this.backendProcess.stderr.removeAllListeners();
    }
    logLevelToStr(l) {
        switch (l) {
            case 0: return `OFF`;
            case 1: return `ERROR`;
            case 2: return `WARN`;
            case 3: return `INFO`;
            case 4: return `TRACE`;
            case 5: return `ALL`;
            default: return `ALL`;
        }
    }
    getViperServerStartCommand() {
        let command = "java " + Settings_1.Settings.settings.javaSettings.customArguments +
            " " + Settings_1.Settings.settings.viperServerSettings.customArguments +
            " --logLevel " + this.logLevelToStr(Settings_1.Settings.settings.preferences.logLevel) +
            " --logFile " + ServerClass_1.Server.tempDirectory;
        command = command.replace(/\$backendPaths\$/g, Settings_1.Settings.viperServerJars());
        command = command.replace(/\$backendSpecificCache\$/g, (Settings_1.Settings.settings.viperServerSettings.backendSpecificCache === true ? "--backendSpecificCache" : ""));
        command = command.replace(/\$mainMethod\$/g, "viper.server.ViperServerRunner");
        return command;
    }
    startVerifyProcess(command, file, onData, onError, onClose) {
        this._stream.output.on("data", (object) => {
            let message = object.value;
            //Log.log('recieved message: ' + JSON.stringify(message, null, 2), LogLevel.LowLevelDebug)
            if (!message.hasOwnProperty('msg_type')) {
                throw `property 'msg_type' not found in message=${message}`;
            }
            if (!message.hasOwnProperty('msg_body')) {
                throw `property 'msg_body' not found in message=${message}`;
            }
            if (message.msg_type === 'statistics') {
                return onData(JSON.stringify({
                    type: "VerificationStart",
                    nofPredicates: parseInt(message.msg_body.predicates),
                    nofMethods: parseInt(message.msg_body.methods),
                    nofFunctions: parseInt(message.msg_body.functions)
                }));
            }
            if (message.msg_type === 'program_outline') {
                return onData(JSON.stringify({
                    type: "Outline",
                    members: message.msg_body.members.map((m) => {
                        return {
                            type: m.type,
                            name: m.name,
                            location: m.position.file + '@' + m.position.start + '-' + m.position.end
                        };
                    })
                }));
            }
            if (message.msg_type === 'program_definitions') {
                return onData(JSON.stringify({
                    type: "Definitions",
                    definitions: message.msg_body.definitions.map(d => {
                        return {
                            name: d.name,
                            type: d.type,
                            scopeStart: d.scopeStart,
                            scopeEnd: d.scopeEnd,
                            location: d.location.file + '@' + d.location.start + '-' + d.location.end
                        };
                    })
                }));
            }
            if (message.msg_type === 'exception_report') {
                Log_1.Log.error("The following exception occured in ViperServer: " + message.msg_body.message + "\n trace:\n  " +
                    message.msg_body.stacktrace.join("\n  "), ViperProtocol_1.LogLevel.Default);
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
                }));
                return onData(JSON.stringify({ type: "Stopped" }));
            }
            if (message.msg_type === 'verification_result') {
                if (message.hasOwnProperty('msg_body') &&
                    message.msg_body.hasOwnProperty('status')) {
                    if (message.msg_body.status === 'failure' &&
                        message.msg_body.details.result.errors.length > 0) { // we get zero errors in the overall results if the errors have been cached. 
                        let first_error_tag = message.msg_body.details.result.errors[0].tag;
                        let global_failure = ServerClass_1.Server.backend.type === 'other' ||
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
                            first_error_tag.includes('internal');
                        if (message.msg_body.kind === 'for_entity' || global_failure) {
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
                                    };
                                })
                            }));
                        }
                    }
                    else if (message.msg_body.status === 'success' &&
                        message.msg_body.kind === 'for_entity') {
                        return onData(JSON.stringify({
                            type: (message.msg_body.details.entity.type === 'method' ? 'MethodVerified'
                                : (message.msg_body.details.entity.type === 'function' ? 'FunctionVerified'
                                    : message.msg_body.details.entity.type === 'predicate' ? 'PredicateVerified' : '' /*bad stuff*/)),
                            name: message.msg_body.details.entity.name
                        }));
                    }
                    if (message.msg_body.kind === 'overall') {
                        onData(JSON.stringify({
                            type: "End",
                            time: (message.msg_body.details.time * 0.001) + 's'
                        }));
                        //if ( message.msg_body.status === 'success' ){
                        return onData(JSON.stringify({ type: "Success" }));
                        //} else {
                        //return onData(JSON.stringify({ type: "Failure" }))
                        //}
                    }
                }
            }
            else {
                // Unhandled messages might be destined to some other extension via
                // the ViperApi
                ServerClass_1.Server.connection.sendNotification(ViperProtocol_1.Commands.UnhandledViperServerMessageType, message);
            }
            return true;
        });
        this._stream.output.on("end", () => {
            //Log.log("ViperServer stream ended.", LogLevel.LowLevelDebug)
            this._stream = StreamJsonObjects.make();
        });
        this.startVerifyStream(command, onData, onError, onClose);
        this.isSessionRunning = true;
    }
    startVerifyStream(command, onData, onError, onClose) {
        Log_1.Log.log('Sending verification request to ViperServer...', ViperProtocol_1.LogLevel.Debug);
        let jid_promise = this.postStartRequest({
            arg: command
        });
        jid_promise.then((jid) => {
            this._job_id = jid;
            onData(JSON.stringify({ type: "Start", backendType: command.startsWith('silicon') ? "Silicon" : "Carbon" }));
            Log_1.Log.log(`Requesting ViperServer to stream results of verification job #${jid}...`, ViperProtocol_1.LogLevel.LowLevelDebug);
            let url = this._url + ':' + this._port + '/verify/' + jid;
            request.get(url).on('error', (err) => {
                Log_1.Log.log(`error while requesting results from ViperServer.` +
                    ` Request URL: ${url}\n` +
                    ` Error message: ${err}`, ViperProtocol_1.LogLevel.Default);
            }).pipe(this._stream.input);
        }).catch((err) => {
            Log_1.Log.log('unfortunately, we did not get a job ID from ViperServer: ' + err, ViperProtocol_1.LogLevel.LowLevelDebug);
        });
    }
    flushCache(filePath) {
        return new Promise((resolve, reject) => {
            let url = this._url + ':' + this._port + '/cache/flush';
            if (filePath) {
                Log_1.Log.log(`Requesting ViperServer to flush the cache for (` + filePath + `)...`, ViperProtocol_1.LogLevel.Info);
                let options = {
                    url: url,
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ backend: ServerClass_1.Server.backend.name, file: filePath })
                };
                request.post(options).on('error', (error) => {
                    Log_1.Log.log(`error while requesting ViperServer to flush the cache for (` + filePath + `).` +
                        ` Request URL: ${url}\n` +
                        ` Error message: ${error}`, ViperProtocol_1.LogLevel.Default);
                    reject(error);
                }).on('data', (data) => {
                    let response = JSON.parse(data.toString());
                    if (!response.msg) {
                        Log_1.Log.log(`ViperServer did not complain about the way we requested it to flush the cache for (` + filePath + `).` +
                            ` However, it also did not provide the expected bye-bye message.` +
                            ` It said: ${data.toString}`, ViperProtocol_1.LogLevel.Debug);
                        resolve(response);
                    }
                    else {
                        Log_1.Log.log(`ViperServer has confirmed that the cache for (` + filePath + `) has been flushed.`, ViperProtocol_1.LogLevel.Debug);
                        resolve(response.msg);
                    }
                });
            }
            else {
                Log_1.Log.log(`Requesting ViperServer to flush the entire cache...`, ViperProtocol_1.LogLevel.Info);
                request.get(url).on('error', (error) => {
                    Log_1.Log.log(`error while requesting ViperServer to flush the entire cache.` +
                        ` Request URL: ${url}\n` +
                        ` Error message: ${error}`, ViperProtocol_1.LogLevel.Default);
                    reject(error);
                }).on('data', (data) => {
                    let response = JSON.parse(data.toString());
                    if (!response.msg) {
                        Log_1.Log.log(`ViperServer did not complain about the way we requested it to flush the entire cache.` +
                            ` However, it also did not provide the expected bye-bye message.` +
                            ` It said: ${data.toString}`, ViperProtocol_1.LogLevel.Debug);
                        resolve(response);
                    }
                    else {
                        Log_1.Log.log(`ViperServer has confirmed that the entire cache has been flushed.`, ViperProtocol_1.LogLevel.Debug);
                        resolve(response.msg);
                    }
                });
            }
        });
    }
    postStartRequest(request_body) {
        return new Promise((resolve, reject) => {
            Log_1.Log.log(`Requesting ViperServer to start new job...`, ViperProtocol_1.LogLevel.Debug);
            let options = {
                url: this._url + ':' + this._port + '/verify',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(request_body)
            };
            request.post(options, (error, response, body) => {
                let json_body = JSON.parse(body);
                // This callback processes the initial response from ViperServer. 
                // ViperServer confirms that the verification task has been accepted and 
                //  returns a job ID (which is unique for this session).
                if (error) {
                    Log_1.Log.log(`Got error from POST request to ViperServer: ` +
                        JSON.stringify(error, undefined, 2), ViperProtocol_1.LogLevel.Debug);
                    reject(error);
                }
                if (response.statusCode !== 200) {
                    Log_1.Log.log(`Bad response on POST request to ViperServer: ` +
                        JSON.stringify(response, undefined, 2), ViperProtocol_1.LogLevel.Debug);
                    reject(`bad response code: ${response.statusCode}`);
                }
                if (typeof json_body.msg !== 'undefined') {
                    Log_1.Log.log(`ViperServer had trouble accepting the POST request: ` +
                        JSON.stringify(body.msg, undefined, 2), ViperProtocol_1.LogLevel.Debug);
                    reject(`ViperServer: ${json_body.msg}`);
                }
                if (typeof json_body.id === 'undefined') {
                    Log_1.Log.log(`It seems that ViperServer\'s REST API has been changed.` +
                        ` Body of response: ` + JSON.stringify(json_body, undefined, 2), ViperProtocol_1.LogLevel.Debug);
                    reject(`ViperServer did not provide a job ID: ${json_body}`);
                }
                Log_1.Log.log(`ViperServer started new job with ID ${json_body.id}`, ViperProtocol_1.LogLevel.Debug);
                resolve(json_body.id);
            });
        });
    }
    sendStopRequest() {
        return new Promise((resolve, reject) => {
            Log_1.Log.log(`Requesting ViperServer to exit...`, ViperProtocol_1.LogLevel.Debug);
            let url = this._url + ':' + this._port + '/exit';
            request.get(url).on('error', (err) => {
                Log_1.Log.log(`error while requesting ViperServer to stop.` +
                    ` Request URL: ${url}\n` +
                    ` Error message: ${err}`, ViperProtocol_1.LogLevel.Default);
                reject(err);
            }).on('data', (data) => {
                let response = JSON.parse(data.toString());
                if (!response.msg) {
                    Log_1.Log.log(`ViperServer did not complain about the way we requested it to exit.` +
                        ` However, it also did not provide the expected bye-bye message.` +
                        ` It said: ${data.toString}`, ViperProtocol_1.LogLevel.Debug);
                    resolve(true);
                }
                else if (response.msg !== 'shutting down...') {
                    Log_1.Log.log(`ViperServer responded with an unexpected bye-bye message: ${response.msg}`, ViperProtocol_1.LogLevel.Debug);
                    resolve(true);
                }
                else {
                    Log_1.Log.log(`ViperServer has exited properly.`, ViperProtocol_1.LogLevel.Debug);
                    resolve(true);
                }
            });
        });
    }
    isInternalServerError(data_str) {
        let err_r = new RegExp(/.*internal server error.*/);
        if (err_r.test(data_str)) {
            return true;
        }
        return false;
    }
    sendJobDiscardRequest(jid) {
        return new Promise((resolve, reject) => {
            new Promise((resolve_0, reject_0) => {
                //FIXME:KILL_BOOGIE
                if (ServerClass_1.Server.backend.type === 'carbon') {
                    this.getBoogiePids().then(boogie_pid_list => {
                        this._uncontrolled_pid_list = boogie_pid_list;
                        Log_1.Log.log(`[KILL_BOOGIE] found uncontrolled Boogie processes: ${boogie_pid_list.join(', ')}`, ViperProtocol_1.LogLevel.LowLevelDebug);
                        resolve_0(true);
                    }).catch((errors) => {
                        Log_1.Log.log(`[KILL_BOOGIE] errors found while scanning for uncontrolled Boogie processes:\n ${errors.join('\n ')}`, ViperProtocol_1.LogLevel.LowLevelDebug);
                        reject_0(errors);
                    });
                }
                else {
                    resolve_0(true);
                }
            }).then(() => {
                Log_1.Log.log(`Requesting ViperServer to discard verification job #${jid}...`, ViperProtocol_1.LogLevel.Debug);
                let url = this._url + ':' + this._port + '/discard/' + jid;
                request.get(url).on('error', (err) => {
                    Log_1.Log.log(`error while requesting ViperServer to discard a job.` +
                        ` Request URL: ${url}\n` +
                        ` Error message: ${err}`, ViperProtocol_1.LogLevel.Default);
                    reject(err);
                }).on('data', (data) => {
                    let data_str = data.toString();
                    if (this.isInternalServerError(data_str)) {
                        Log_1.Log.log(`ViperServer encountered an internal server error.` +
                            ` The exact message is: ${data_str}`, ViperProtocol_1.LogLevel.Debug);
                        resolve(false);
                    }
                    try {
                        let response = JSON.parse(data_str);
                        if (!response.msg) {
                            Log_1.Log.log(`ViperServer did not complain about the way we requested it to discard a job.` +
                                ` However, it also did not provide the expected confirmation message.` +
                                ` It said: ${data_str}`, ViperProtocol_1.LogLevel.Debug);
                            resolve(true);
                        }
                        else {
                            Log_1.Log.log(`ViperServer: ${response.msg}`, ViperProtocol_1.LogLevel.Debug);
                            resolve(true);
                        }
                    }
                    catch (e) {
                        Log_1.Log.log(`ViperServer responded with something that is not a valid JSON object.` +
                            ` The exact message is: ${data_str}`, ViperProtocol_1.LogLevel.Debug);
                        resolve(false);
                    }
                });
            }).then(() => {
                if (ServerClass_1.Server.backend.type === 'carbon') {
                    this.killUncontrolledProcesses().catch((error) => {
                        Log_1.Log.error(`Could not stop uncontrolled processes after Carbon:\n ${error}`);
                    });
                }
            });
        });
    }
    killUncontrolledProcesses() {
        return new Promise((resolve, reject) => {
            if (this._uncontrolled_pid_list.length == 0) {
                resolve(true);
            }
            else {
                if (Settings_1.Settings.isWin) {
                    Promise.all(this._uncontrolled_pid_list.map(pid => {
                        return new Promise((res, rej) => {
                            this.getZ3Pids(pid).then(z3_pid_list => {
                                if (z3_pid_list.length == 0) {
                                    res(true);
                                }
                                else {
                                    let taskkill = ViperProtocol_1.Common.executer(`Taskkill /PID ${z3_pid_list.join(' /PID ')} /F /T`);
                                    taskkill.stderr.on('data', error => {
                                        rej(error);
                                    });
                                    taskkill.on('exit', () => {
                                        res(true);
                                    });
                                }
                            }).catch((error) => {
                                rej(error);
                            });
                        });
                    })).then(() => {
                        resolve(true);
                    }).catch(error => {
                        reject(error);
                    });
                }
                else { // Linux, Mac
                    Promise.all(this._uncontrolled_pid_list.map(pid => {
                        return new Promise((res, rej) => {
                            tree_kill(pid, "SIGTERM", error => {
                                //res(true)
                            });
                            res(true);
                        });
                    })).then(() => {
                        resolve(true);
                    }).catch(error => {
                        reject(error);
                    });
                }
            }
        });
    }
    getChildrenPidsForProcess(pname, pid) {
        return new Promise((resolve, reject) => {
            let command = null;
            if (Settings_1.Settings.isWin) {
                command = `wmic process where (ParentProcessId=${pid} and Name="${pname}") get ProcessId`;
            }
            else {
                command = `pgrep -l -P ${pid} ${pname}`;
            }
            let wmic = ViperProtocol_1.Common.executer(command);
            let child_pids = [];
            let errors = [];
            wmic.stdout.on('data', stdout => {
                let array_of_lines = stdout.match(/[^\r\n]+/g);
                if (array_of_lines) {
                    array_of_lines.forEach(line => {
                        let regex = /.*?(\d+).*/.exec(line);
                        if (regex != null && regex[1]) {
                            child_pids.push(parseInt(regex[1]));
                        }
                    });
                }
            });
            wmic.stderr.on('data', data => {
                errors.concat(data + "");
            });
            wmic.on('exit', () => {
                if (errors.length == 0) {
                    resolve(child_pids);
                }
                else {
                    reject(errors);
                }
            });
        });
    }
    getBoogiePids() {
        if (Settings_1.Settings.isWin) {
            return this.getChildrenPidsForProcess("Boogie.exe", this.backendServerPid);
        }
        else if (Settings_1.Settings.isLinux) {
            return this.getChildrenPidsForProcess("Boogie", this.backendServerPid);
        }
        else {
            // Java(ViperServer) -> sh(Boogie) -> mono(Boogie.exe) -> {z3, z3, ...}
            //return this.getChildrenPidsForProcess("sh", this.backendServerPid)
            return new Promise((resolve, reject) => {
                this.getChildrenPidsForProcess("sh", this.backendServerPid).then(sh_pid_list => {
                    this.getChildrenPidsForProcess("mono", sh_pid_list[0]).then(mono_pid_list => {
                        resolve(mono_pid_list);
                    }).catch(err => {
                        reject(`- mono process(es) not found -` + err);
                    });
                }).catch(error => {
                    reject(`-- sh process(es) not found -- ` + error);
                });
            });
        }
    }
    getZ3Pids(parent_proc_pid) {
        if (Settings_1.Settings.isWin) {
            return this.getChildrenPidsForProcess("z3.exe", parent_proc_pid);
        }
        else if (Settings_1.Settings.isLinux) {
            return this.getChildrenPidsForProcess("z3", parent_proc_pid);
        }
        else { // Mac
            return new Promise((resolve, reject) => {
                this.getChildrenPidsForProcess("mono", parent_proc_pid).then(mono_pid_list => {
                    this.getChildrenPidsForProcess("z3", mono_pid_list[0]).then(z3_pid_list => {
                        resolve(z3_pid_list);
                    }).catch(err => {
                        reject(`- z3 process(es) not found -` + err);
                    });
                }).catch(error => {
                    reject(`-- mono process(es) not found -- ` + error);
                });
            });
        }
    }
    static isSupportedType(type) {
        if (!type)
            return false;
        return type.toLowerCase() == 'carbon' || type.toLowerCase() == 'silicon' || type.toLowerCase() == 'other';
    }
    getAddress() {
        return this._url + ":" + this._port;
    }
}
ViperServerService.supportedTypes = '"carbon", "silicon", "other"';
exports.ViperServerService = ViperServerService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJTZXJ2ZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9WaXBlclNlcnZlclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztJQU1JO0FBRUosWUFBWSxDQUFBOztBQUtaLG1DQUFtQztBQUNuQyx5RUFBeUU7QUFFekUsK0NBQStDO0FBQy9DLCtCQUEyQjtBQUMzQix5Q0FBcUM7QUFDckMsbURBQWtIO0FBQ2xILCtDQUFzQztBQUV0QyxxREFBaUQ7QUFFakQsdUNBQXVDO0FBSXZDLE1BQWEsa0JBQW1CLFNBQVEsK0JBQWM7SUFnQmxEO1FBQ0ksS0FBSyxFQUFFLENBQUE7UUFaSCxZQUFPLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUE7UUFhdEMsSUFBSSxDQUFDLG9CQUFvQixHQUFHLElBQUksQ0FBQTtRQUNoQyxJQUFJLENBQUMsTUFBTSxHQUFHLGFBQWEsQ0FBQTtJQUMvQixDQUFDO0lBRU0sS0FBSztRQUNSLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDbkMsSUFBSSxNQUFNLEdBQUcsbUJBQVEsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUMsaUJBQWlCLENBQUE7WUFDcEUsSUFBSyxNQUFNLEtBQUssUUFBUSxFQUFHO2dCQUN2QixJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQTtnQkFDMUIsSUFBSSxDQUFDLElBQUksR0FBRyxtQkFBUSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxrQkFBa0IsQ0FBQTtnQkFDcEUsSUFBSSxDQUFDLEtBQUssR0FBRyxtQkFBUSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxlQUFlLENBQUE7Z0JBQ2xFLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQTthQUVoQjtpQkFBTSxJQUFLLE1BQU0sS0FBSyxRQUFRLEVBQUc7Z0JBQzlCLElBQUksT0FBTyxHQUFHLElB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