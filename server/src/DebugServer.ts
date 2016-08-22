'use strict';

import fs = require('fs');

import {
    IPCMessageReader, IPCMessageWriter,
    createConnection, IConnection, TextDocumentSyncKind,
    TextDocuments, TextDocument, TextDocumentIdentifier, Diagnostic, DiagnosticSeverity,
    InitializeParams, InitializeResult, TextDocumentPositionParams,
    CompletionItem, CompletionItemKind, NotificationType,
    RequestType, RequestHandler
} from 'vscode-languageserver';
import {Server} from './ServerClass';

// import {LogEntry, LogType} from './LogEntry';
import {Log} from './Log';
// import {Settings} from './Settings'
import {Position, StepType, Backend, ViperSettings, Commands, VerificationState, VerifyRequest, LogLevel, ShowHeapParams} from './ViperProtocol'
// import {NailgunService} from './NailgunService';
import {VerificationTask} from './VerificationTask';
import {Statement, StatementType} from './Statement';
// import {Model} from './Model';

let ipc = require('node-ipc');

export class DebugServer {

    public static debuggerRunning = false;

    public static initialize() {
        this.startIPCServer();
        this.registerHandlers();
    }

    public static registerHandlers() {
        Server.connection.onRequest({ method: 'variablesInLine' }, (lineNumber) => {
            let variables = [];
            if (Server.debuggedVerificationTask) {
                Server.debuggedVerificationTask.steps.forEach(element => {
                    if (element.position.line === lineNumber) {
                        element.store.forEach(variable => {
                            variables.push({
                                name: variable,
                                value: variable,
                                variablesReference: 0
                            });
                        })
                    }
                });
            }
        });
    }

    //communication with debugger
    static startIPCServer() {
        ipc.config.id = 'viper';
        ipc.config.retry = 1500;

        ipc.serve(
            function () {
                ipc.server.on(
                    'log',
                    function (data, socket) {
                        Log.logWithOrigin("Debugger", data, LogLevel.LowLevelDebug);
                    }
                );
                ipc.server.on(
                    'launchRequest',
                    function (data, socket) {
                        try {
                            DebugServer.debuggerRunning = true;
                            Log.log('Debugging was requested for file: ' + data, LogLevel.Debug);
                            VerificationTask.pathToUri(data).then((uri) => {
                                Server.debuggedVerificationTask = Server.verificationTasks.get(uri);
                                let response = "true";
                                if (!Server.debuggedVerificationTask) {
                                    //TODO: use better criterion to detect a missing verification
                                    Log.hint("Cannot debug file, you must first verify the file: " + uri);
                                    response = "false";
                                }
                                ipc.server.emit(
                                    socket,
                                    'launchResponse',
                                    response
                                );
                                //TODO: is it right to connect each time debugging is started?
                                //connect to Debugger as client to be able to send messages
                                ipc.connectTo(
                                    'viperDebugger', () => {
                                        ipc.of.viperDebugger.on(
                                            'connect', () => {
                                                Log.log("Language Server connected to Debugger, as client", LogLevel.Debug);
                                            }
                                        );
                                        ipc.of.viperDebugger.on(
                                            'disconnect', () => {
                                                ipc.disconnect()
                                                if (DebugServer.debuggerRunning) {
                                                    Log.log('LanguageServer disconnected from Debugger', LogLevel.Debug);
                                                    DebugServer.debuggerRunning = false;
                                                    VerificationTask.connection.sendNotification(Commands.StopDebugging);
                                                }
                                            }
                                        );
                                    }
                                )
                            });
                        } catch (e) {
                            Log.error("Error handling lanch request: " + e);
                        }
                    }
                );

                ipc.server.on(
                    'MoveRequest',
                    function (dataString, socket) {
                        try {
                            let data = JSON.parse(dataString);
                            let newState: number = -1;

                            let steps = Server.debuggedVerificationTask.steps;
                            let currentDepth = steps[data.state].depthLevel();
                            switch (data.type) {
                                case StepType.Stay:
                                    newState = data.state;
                                    break;
                                case StepType.In:
                                    newState = data.state + 1;
                                    break;
                                case StepType.Back:
                                    newState = data.state - 1;
                                    break;
                                case StepType.Continue:
                                    Log.error("continue is not supported right now, do step next instead");
                                case StepType.Next:
                                    for (let i = data.state + 1; i < steps.length; i++) {
                                        let step = steps[i];
                                        if (step.depthLevel() <= currentDepth) {
                                            //the step is on the same level or less deap
                                            newState = i;
                                            break;
                                        }
                                    }
                                    break;
                                case StepType.Out:
                                    for (let i = data.state + 1; i < steps.length; i++) {
                                        let step = steps[i];
                                        if (step.depthLevel() < currentDepth) {
                                            //the step is less deap
                                            newState = i;
                                            break;
                                        }
                                    }
                                    break;
                            }
                            Log.log(`Step${StepType[data.type]}: state ${data.state} -> state ${newState}`, LogLevel.LowLevelDebug);
                            let position = Server.debuggedVerificationTask ? Server.debuggedVerificationTask.getPositionOfState(newState) : { line: 0, character: 0 };
                            if (position.line >= 0) {
                                Server.showHeap(Server.debuggedVerificationTask, newState);
                            }
                            ipc.server.emit(
                                socket,
                                'MoveResponse',
                                JSON.stringify({ position: position, state: newState })
                            );

                        }
                        catch (e) {
                            Log.log("Error handling move request: " + e);
                        }
                    }
                );

                ipc.server.on(
                    'variablesInLineRequest',
                    function (data, socket) {
                        Log.log('got a variables request for line ' + data, LogLevel.Debug);
                        let lineNumber: number;
                        try {
                            lineNumber = data - 0;
                        } catch (error) {
                            Log.error("Wrong format");
                        }

                        let variables = [];
                        if (Server.debuggedVerificationTask) {
                            let steps = Server.debuggedVerificationTask.getStepsOnLine(lineNumber);
                            if (steps.length > 0) {
                                steps[0].store.forEach((variable) => {
                                    variables.push(variable);
                                });
                            }
                        } else {
                            Log.error("no Server.debuggedVerificationTask available");
                        }

                        ipc.server.emit(
                            socket,
                            'variablesInLineResponse',
                            JSON.stringify(variables)
                        );
                    }
                );

                ipc.server.on(
                    'evaluateRequest',
                    function (data, socket) {
                        Log.log(`evaluate(context: '${data.context}', '${data.expression}')`, LogLevel.LowLevelDebug);

                        let evaluated: string = Server.debuggedVerificationTask.model.values.has(data.expression)
                            ? Server.debuggedVerificationTask.model.values.get(data.expression)
                            : "unknown";

                        ipc.server.emit(
                            socket,
                            'evaluateResponse',
                            JSON.stringify(evaluated)
                        );
                    }
                );

                ipc.server.on(
                    'stackTraceRequest',
                    function (data, socket) {
                        Log.log('stack trace request for line ' + data, LogLevel.Debug);
                        let lineNumber: number;
                        try {
                            lineNumber = data - 0;
                        } catch (error) {
                            Log.error("Wrong format");
                        }
                        let stepsOnLine = [];
                        if (Server.debuggedVerificationTask) {
                            let steps = Server.debuggedVerificationTask.getStepsOnLine(lineNumber);
                            steps.forEach((step) => {
                                stepsOnLine.push({ "type": StatementType[step.type], position: step.position });
                            });
                        }
                        ipc.server.emit(
                            socket,
                            'stackTraceResponse',
                            JSON.stringify(stepsOnLine)
                        );
                    }
                );
            }
        );
        ipc.server.start();
    }

    static moveDebuggerToPos(position: Position, step) {
        if (DebugServer.debuggerRunning) {
            try {
                ipc.of.viperDebugger.emit("MoveDebuggerToPos", JSON.stringify({ position: position, step: step }));
                Log.log("LanguageServer is telling Debugger to Move to Position of State " + step)
            } catch (e) {
                Log.error("Error sending MoveDebuggerToPos request: " + e);
            }
        }
    }

    static stopDebugging() {
        if (DebugServer.debuggerRunning) {
            try {
                ipc.of.viperDebugger.emit("StopDebugging");
                Log.log("LanguageServer is telling Debugger to stop debugging")
            } catch (e) {
                Log.error("Error sending StopDebugging request: " + e);
            }
        }
    }
}