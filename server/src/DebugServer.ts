'use strict';

import {Server} from './ServerClass';
import {Log} from './Log';
import {Common, LaunchRequestArguments, StatementType, Position, StepType, VerificationState, LogLevel} from './ViperProtocol'
import {VerificationTask} from './VerificationTask';
import {Settings} from './Settings';
let ipc = require('node-ipc');

export class DebugServer {

    public static debuggerRunning = false;

    private static debugClientConnected = false;

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

    static connectToDebuggerAsClient(): Thenable<boolean> {
        //connect to Debugger as client to be able to send messages
        return new Promise((resolve, reject) => {
            try {
                if (!this.debugClientConnected) {
                    this.debugClientConnected = true;
                    ipc.connectTo(
                        'viperDebugger', () => {
                            ipc.of.viperDebugger.on(
                                'connect', () => {
                                    Log.log("Language Server connected to Debugger, as client", LogLevel.Debug);
                                    resolve(true);
                                }
                            );
                            ipc.of.viperDebugger.on(
                                'disconnect', () => {
                                    this.debugClientConnected = false;
                                    ipc.disconnect('viperDebugger');
                                    if (DebugServer.debuggerRunning) {
                                        Log.log('LanguageServer disconnected from Debugger', LogLevel.Debug);
                                        DebugServer.debuggerRunning = false;
                                        Server.sendStopDebuggingNotification();
                                    }
                                }
                            );
                        });
                } else {
                    resolve(true);
                }
            } catch (e) {
                Log.error("Error connecting toDebuggerAsClient: " + e);
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
                    function (data: LaunchRequestArguments, socket) {
                        try {
                            DebugServer.debuggerRunning = true;
                            Log.log('Debugging was requested for file: ' + data.program, LogLevel.Debug);
                            let uri = Common.pathToUri(data.program);
                            Server.debuggedVerificationTask = Server.verificationTasks.get(uri);
                            let response = "true";
                            //TODO: is this a good criterion?
                            if (!Server.debuggedVerificationTask || Server.debuggedVerificationTask.state != VerificationState.Ready) {
                                Log.hint("Cannot debug file, you must first verify the file: " + uri);
                                response = "false";
                            }
                            ipc.server.emit(
                                socket,
                                'launchResponse',
                                response
                            );
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
                            let newServerState: number = -1;

                            let task = Server.debuggedVerificationTask;
                            //translate from client state to server state
                            let currentServerState = task.clientStepIndexToServerStep[data.state].index;

                            let steps = task.steps;
                            let currentDepth = steps[currentServerState].depthLevel();

                            if (Settings.settings.advancedFeatures.simpleMode && task.shownExecutionTrace) {
                                //SIMPLE MODE
                                let newExecutionTraceIndex = 0;
                                let indexIntoExecutionTrace = 0;
                                while (indexIntoExecutionTrace < task.shownExecutionTrace.length && task.shownExecutionTrace[indexIntoExecutionTrace].state != data.state) {
                                    indexIntoExecutionTrace++;
                                }
                                if (indexIntoExecutionTrace >= task.shownExecutionTrace.length) {
                                    //Log.error("the shown state must be in the execution trace in simple mode");
                                    newExecutionTraceIndex = 0;
                                } else {
                                    newExecutionTraceIndex = indexIntoExecutionTrace;
                                    switch (data.type) {
                                        case StepType.Stay:
                                            //stay at the same executionTrace element
                                            break;
                                        case StepType.In: case StepType.Next:
                                            //walk to next execution trace item if there is a next one, otherwise stay
                                            if (indexIntoExecutionTrace - 1 >= 0) {
                                                newExecutionTraceIndex = indexIntoExecutionTrace - 1;
                                            }
                                            break;
                                        case StepType.Back: case StepType.Out:
                                            //walk to previous execution trace item if there is a next one, otherwise stay
                                            if (indexIntoExecutionTrace + 1 < task.shownExecutionTrace.length) {
                                                newExecutionTraceIndex = indexIntoExecutionTrace + 1;
                                            }
                                            break;
                                        case StepType.Continue:
                                            //goto last exectution trace state (error state)
                                            newExecutionTraceIndex = 0;
                                            break;
                                    }
                                }
                                newServerState = task.clientStepIndexToServerStep[task.shownExecutionTrace[newExecutionTraceIndex].state].index;
                            } else {
                                //ADVANCED MODE
                                switch (data.type) {
                                    case StepType.Stay:
                                        newServerState = currentServerState;
                                        break;
                                    case StepType.In:
                                        newServerState = currentServerState + 1;
                                        while (newServerState < steps.length && !steps[newServerState].canBeShownAsDecoration) {
                                            newServerState++;
                                        }
                                        break;
                                    case StepType.Back:
                                        newServerState = currentServerState - 1;
                                        while (newServerState >= 0 && !steps[newServerState].canBeShownAsDecoration) {
                                            newServerState--;
                                        }
                                        break;
                                    case StepType.Continue:
                                        //go to next error state
                                        for (let i = currentServerState + 1; i < steps.length; i++) {
                                            let step = steps[i];
                                            if (step.isErrorState && step.canBeShownAsDecoration) {
                                                //the step is on the same level or less deap
                                                newServerState = i;
                                                break;
                                            }
                                        }
                                        if (newServerState < 0) {
                                            for (let i = 0; i <= currentServerState; i++) {
                                                let step = steps[i];
                                                if (step.isErrorState && step.canBeShownAsDecoration) {
                                                    //the step is on the same level or less deap
                                                    newServerState = i;
                                                    break;
                                                }
                                            }
                                        }
                                        if (newServerState == -1) {
                                            newServerState = currentServerState;
                                        }
                                        break;
                                    case StepType.Next:
                                        for (let i = currentServerState + 1; i < steps.length; i++) {
                                            let step = steps[i];
                                            if (step.depthLevel() <= currentDepth && step.canBeShownAsDecoration) {
                                                //the step is on the same level or less deap
                                                newServerState = i;
                                                break;
                                            }
                                        }
                                        break;
                                    case StepType.Out:
                                        for (let i = currentServerState + 1; i < steps.length; i++) {
                                            let step = steps[i];
                                            if (step.depthLevel() < currentDepth && step.canBeShownAsDecoration) {
                                                //the step is less deap
                                                newServerState = i;
                                                break;
                                            }
                                        }
                                        break;
                                }
                            }
                            let position = Server.debuggedVerificationTask ? Server.debuggedVerificationTask.getPositionOfState(newServerState) : { line: 0, character: 0 };

                            //translate from server state to client state
                            let newClientState = (newServerState >= 0 && newServerState < steps.length) ? steps[newServerState].decorationOptions.index : -1;

                            if (position.line >= 0) {
                                Server.showHeap(Server.debuggedVerificationTask, newClientState, true);
                            }
                            Log.log(`Step${StepType[data.type]}: state ${data.state} -> state ${newClientState}`, LogLevel.LowLevelDebug);
                            ipc.server.emit(
                                socket,
                                'MoveResponse',
                                JSON.stringify({ position: position, state: newClientState })
                            );
                        }
                        catch (e) {
                            Log.error("Error handling move request: " + dataString + ": " + e);
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

    static moveDebuggerToPos(position: Position, clientStep) {
        if (DebugServer.debuggerRunning) {
            try {
                this.connectToDebuggerAsClient().then(resolve => {
                    ipc.of.viperDebugger.emit("MoveDebuggerToPos", JSON.stringify({ position: position, step: clientStep }));
                    Log.log("LanguageServer is telling Debugger to Move to Position of State " + clientStep, LogLevel.Debug)
                });
            } catch (e) {
                Log.error("Error sending MoveDebuggerToPos request: " + e);
            }
        }
    }

    static stopDebugging() {
        if (DebugServer.debuggerRunning) {
            try {
                if (ipc.of.viperDebugger) {
                    ipc.of.viperDebugger.emit("StopDebugging");
                    Log.log("LanguageServer is telling Debugger to stop debugging", LogLevel.Debug)
                }
                ipc.disconnect();
                Log.log("LanguageServer is telling Debugger to stop debugging", LogLevel.Debug)
            } catch (e) {
                Log.error("Error sending StopDebugging request: " + e);
            }
        }
    }
}