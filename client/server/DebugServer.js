/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const ServerClass_1 = require("./ServerClass");
const Log_1 = require("./Log");
const ViperProtocol_1 = require("./ViperProtocol");
const Settings_1 = require("./Settings");
let ipc = require('node-ipc');
class DebugServer {
    static initialize() {
        this.startIPCServer();
        this.registerHandlers();
    }
    static registerHandlers() {
        ServerClass_1.Server.connection.onRequest('variablesInLine', (lineNumber) => {
            let variables = [];
            if (ServerClass_1.Server.debuggedVerificationTask) {
                ServerClass_1.Server.debuggedVerificationTask.steps.forEach(element => {
                    if (element.position.line === lineNumber) {
                        element.store.forEach(variable => {
                            variables.push({
                                name: variable,
                                value: variable,
                                variablesReference: 0
                            });
                        });
                    }
                });
            }
        });
    }
    static connectToDebuggerAsClient() {
        //connect to Debugger as client to be able to send messages
        return new Promise((resolve, reject) => {
            try {
                if (!this.debugClientConnected) {
                    this.debugClientConnected = true;
                    ipc.connectTo('viperDebugger', () => {
                        ipc.of.viperDebugger.on('connect', () => {
                            Log_1.Log.log("Language Server connected to Debugger, as client", ViperProtocol_1.LogLevel.Debug);
                            resolve(true);
                        });
                        ipc.of.viperDebugger.on('disconnect', () => {
                            this.debugClientConnected = false;
                            try {
                                ipc.disconnect('viperDebugger');
                            }
                            catch (e) {
                                Log_1.Log.error("Error disconnecting from Debug server, is the server already stopped? " + e);
                            }
                            if (DebugServer.debuggerRunning) {
                                Log_1.Log.log('LanguageServer disconnected from Debugger', ViperProtocol_1.LogLevel.Debug);
                                DebugServer.debuggerRunning = false;
                                ServerClass_1.Server.sendStopDebuggingNotification();
                            }
                        });
                    });
                }
                else {
                    resolve(true);
                }
            }
            catch (e) {
                Log_1.Log.error("Error connecting toDebuggerAsClient: " + e);
            }
        });
    }
    //communication with debugger
    static startIPCServer() {
        ipc.config.id = 'viper';
        ipc.config.retry = 1500;
        ipc.serve(function () {
            ipc.server.on('log', function (data, socket) {
                Log_1.Log.logWithOrigin("Debugger", data, ViperProtocol_1.LogLevel.LowLevelDebug);
            });
            ipc.server.on('launchRequest', function (data, socket) {
                try {
                    DebugServer.debuggerRunning = true;
                    Log_1.Log.log('Debugging was requested for file: ' + data.program, ViperProtocol_1.LogLevel.Debug);
                    let uri = ViperProtocol_1.Common.pathToUri(data.program);
                    ServerClass_1.Server.debuggedVerificationTask = ServerClass_1.Server.verificationTasks.get(uri);
                    let response = "true";
                    if (!ServerClass_1.Server.debuggedVerificationTask || ServerClass_1.Server.debuggedVerificationTask.state != ViperProtocol_1.VerificationState.Ready) {
                        Log_1.Log.hint("Cannot debug file, you must first verify the file: " + uri);
                        response = "false";
                    }
                    ipc.server.emit(socket, 'launchResponse', response);
                }
                catch (e) {
                    Log_1.Log.error("Error handling lanch request: " + e);
                }
            });
            ipc.server.on('MoveRequest', function (dataString, socket) {
                try {
                    let data = JSON.parse(dataString);
                    let newServerState = -1;
                    let task = ServerClass_1.Server.debuggedVerificationTask;
                    //translate from client state to server state
                    let currentServerState = task.clientStepIndexToServerStep[data.state].index;
                    let steps = task.steps;
                    let currentDepth = steps[currentServerState].depthLevel();
                    if (Settings_1.Settings.settings.advancedFeatures.simpleMode && task.shownExecutionTrace) {
                        //SIMPLE MODE
                        let newExecutionTraceIndex = 0;
                        let indexIntoExecutionTrace = 0;
                        while (indexIntoExecutionTrace < task.shownExecutionTrace.length && task.shownExecutionTrace[indexIntoExecutionTrace].state != data.state) {
                            indexIntoExecutionTrace++;
                        }
                        if (indexIntoExecutionTrace >= task.shownExecutionTrace.length) {
                            //Log.error("the shown state must be in the execution trace in simple mode");
                            newExecutionTraceIndex = 0;
                        }
                        else {
                            newExecutionTraceIndex = indexIntoExecutionTrace;
                            switch (data.type) {
                                case ViperProtocol_1.StepType.Stay:
                                    //stay at the same executionTrace element
                                    break;
                                case ViperProtocol_1.StepType.In:
                                case ViperProtocol_1.StepType.Next:
                                    //walk to next execution trace item if there is a next one, otherwise stay
                                    if (indexIntoExecutionTrace - 1 >= 0) {
                                        newExecutionTraceIndex = indexIntoExecutionTrace - 1;
                                    }
                                    break;
                                case ViperProtocol_1.StepType.Back:
                                case ViperProtocol_1.StepType.Out:
                                    //walk to previous execution trace item if there is a next one, otherwise stay
                                    if (indexIntoExecutionTrace + 1 < task.shownExecutionTrace.length) {
                                        newExecutionTraceIndex = indexIntoExecutionTrace + 1;
                                    }
                                    break;
                                case ViperProtocol_1.StepType.Continue:
                                    //goto last exectution trace state (error state)
                                    newExecutionTraceIndex = 0;
                                    break;
                            }
                        }
                        newServerState = task.clientStepIndexToServerStep[task.shownExecutionTrace[newExecutionTraceIndex].state].index;
                    }
                    else {
                        //ADVANCED MODE
                        switch (data.type) {
                            case ViperProtocol_1.StepType.Stay:
                                newServerState = currentServerState;
                                break;
                            case ViperProtocol_1.StepType.In:
                                newServerState = currentServerState + 1;
                                while (newServerState < steps.length && !steps[newServerState].canBeShownAsDecoration) {
                                    newServerState++;
                                }
                                break;
                            case ViperProtocol_1.StepType.Back:
                                newServerState = currentServerState - 1;
                                while (newServerState >= 0 && !steps[newServerState].canBeShownAsDecoration) {
                                    newServerState--;
                                }
                                break;
                            case ViperProtocol_1.StepType.Continue:
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
                            case ViperProtocol_1.StepType.Next:
                                for (let i = currentServerState + 1; i < steps.length; i++) {
                                    let step = steps[i];
                                    if (step.depthLevel() <= currentDepth && step.canBeShownAsDecoration) {
                                        //the step is on the same level or less deap
                                        newServerState = i;
                                        break;
                                    }
                                }
                                break;
                            case ViperProtocol_1.StepType.Out:
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
                    let position = ServerClass_1.Server.debuggedVerificationTask ? ServerClass_1.Server.debuggedVerificationTask.getPositionOfState(newServerState) : { line: 0, character: 0 };
                    //translate from server state to client state
                    let newClientState = (newServerState >= 0 && newServerState < steps.length) ? steps[newServerState].decorationOptions.index : -1;
                    if (position.line >= 0) {
                        ServerClass_1.Server.showHeap(ServerClass_1.Server.debuggedVerificationTask, newClientState, true);
                    }
                    Log_1.Log.log(`Step${ViperProtocol_1.StepType[data.type]}: state ${data.state} -> state ${newClientState}`, ViperProtocol_1.LogLevel.LowLevelDebug);
                    ipc.server.emit(socket, 'MoveResponse', JSON.stringify({ position: position, state: newClientState }));
                }
                catch (e) {
                    Log_1.Log.error("Error handling move request: " + dataString + ": " + e);
                }
            });
            ipc.server.on('variablesInLineRequest', function (data, socket) {
                Log_1.Log.log('got a variables request for line ' + data, ViperProtocol_1.LogLevel.Debug);
                let lineNumber;
                try {
                    lineNumber = data - 0;
                }
                catch (error) {
                    Log_1.Log.error("Wrong format");
                }
                let variables = [];
                if (ServerClass_1.Server.debuggedVerificationTask) {
                    let steps = ServerClass_1.Server.debuggedVerificationTask.getStepsOnLine(lineNumber);
                    if (steps.length > 0) {
                        steps[0].store.forEach((variable) => {
                            variables.push(variable);
                        });
                    }
                }
                else {
                    Log_1.Log.error("no Server.debuggedVerificationTask available");
                }
                ipc.server.emit(socket, 'variablesInLineResponse', JSON.stringify(variables));
            });
            ipc.server.on('evaluateRequest', function (data, socket) {
                Log_1.Log.log(`evaluate(context: '${data.context}', '${data.expression}')`, ViperProtocol_1.LogLevel.LowLevelDebug);
                let evaluated = ServerClass_1.Server.debuggedVerificationTask.model.values.has(data.expression)
                    ? ServerClass_1.Server.debuggedVerificationTask.model.values.get(data.expression)
                    : "unknown";
                ipc.server.emit(socket, 'evaluateResponse', JSON.stringify(evaluated));
            });
            ipc.server.on('stackTraceRequest', function (data, socket) {
                Log_1.Log.log('stack trace request for line ' + data, ViperProtocol_1.LogLevel.Debug);
                let lineNumber;
                try {
                    lineNumber = data - 0;
                }
                catch (error) {
                    Log_1.Log.error("Wrong format");
                }
                let stepsOnLine = [];
                if (ServerClass_1.Server.debuggedVerificationTask) {
                    let steps = ServerClass_1.Server.debuggedVerificationTask.getStepsOnLine(lineNumber);
                    steps.forEach((step) => {
                        stepsOnLine.push({ "type": ViperProtocol_1.StatementType[step.type], position: step.position });
                    });
                }
                ipc.server.emit(socket, 'stackTraceResponse', JSON.stringify(stepsOnLine));
            });
        });
        ipc.server.start();
    }
    static moveDebuggerToPos(position, clientStep) {
        if (DebugServer.debuggerRunning) {
            try {
                this.connectToDebuggerAsClient().then(resolve => {
                    ipc.of.viperDebugger.emit("MoveDebuggerToPos", JSON.stringify({ position: position, step: clientStep }));
                    Log_1.Log.log("LanguageServer is telling Debugger to Move to Position of State " + clientStep, ViperProtocol_1.LogLevel.Debug);
                });
            }
            catch (e) {
                Log_1.Log.error("Error sending MoveDebuggerToPos request: " + e);
            }
        }
    }
    static stopDebugging() {
        if (DebugServer.debuggerRunning) {
            try {
                if (ipc.of.viperDebugger) {
                    ipc.of.viperDebugger.emit("StopDebugging");
                    Log_1.Log.log("LanguageServer is telling Debugger to stop debugging", ViperProtocol_1.LogLevel.Debug);
                }
                ipc.disconnect();
                Log_1.Log.log("LanguageServer is telling Debugger to stop debugging", ViperProtocol_1.LogLevel.Debug);
            }
            catch (e) {
                Log_1.Log.error("Error sending StopDebugging request: " + e);
            }
        }
    }
}
DebugServer.debuggerRunning = false;
DebugServer.debugClientConnected = false;
exports.DebugServer = DebugServer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGVidWdTZXJ2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0RlYnVnU2VydmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7SUFNSTtBQUVKLFlBQVksQ0FBQzs7QUFFYiwrQ0FBdUM7QUFDdkMsK0JBQTRCO0FBQzVCLG1EQUFnSTtBQUVoSSx5Q0FBc0M7QUFDdEMsSUFBSSxHQUFHLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBRTlCLE1BQWEsV0FBVztJQU1iLE1BQU0sQ0FBQyxVQUFVO1FBQ3BCLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUN0QixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBRU0sTUFBTSxDQUFDLGdCQUFnQjtRQUMxQixvQkFBTSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxVQUFVLEVBQUUsRUFBRTtZQUMxRCxJQUFJLFNBQVMsR0FBRyxFQUFFLENBQUM7WUFDbkIsSUFBSSxvQkFBTSxDQUFDLHdCQUF3QixFQUFFO2dCQUNqQyxvQkFBTSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUU7b0JBQ3BELElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEtBQUssVUFBVSxFQUFFO3dCQUN0QyxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRTs0QkFDN0IsU0FBUyxDQUFDLElBQUksQ0FBQztnQ0FDWCxJQUFJLEVBQUUsUUFBUTtnQ0FDZCxLQUFLLEVBQUUsUUFBUTtnQ0FDZixrQkFBa0IsRUFBRSxDQUFDOzZCQUN4QixDQUFDLENBQUM7d0JBQ1AsQ0FBQyxDQUFDLENBQUE7cUJBQ0w7Z0JBQ0wsQ0FBQyxDQUFDLENBQUM7YUFDTjtRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVELE1BQU0sQ0FBQyx5QkFBeUI7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