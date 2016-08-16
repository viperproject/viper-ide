'use strict';
const ServerClass_1 = require('./ServerClass');
// import {LogEntry, LogType} from './LogEntry';
const Log_1 = require('./Log');
// import {Settings} from './Settings'
const ViperProtocol_1 = require('./ViperProtocol');
// import {NailgunService} from './NailgunService';
const VerificationTask_1 = require('./VerificationTask');
const Statement_1 = require('./Statement');
// import {Model} from './Model';
let ipc = require('node-ipc');
class DebugServer {
    static initialize() {
        this.startIPCServer();
        this.registerHandlers();
    }
    static registerHandlers() {
        ServerClass_1.Server.connection.onRequest({ method: 'variablesInLine' }, (lineNumber) => {
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
                    Log_1.Log.log('Debugging was requested for file: ' + data, ViperProtocol_1.LogLevel.Debug);
                    VerificationTask_1.VerificationTask.pathToUri(data).then((uri) => {
                        ServerClass_1.Server.debuggedVerificationTask = ServerClass_1.Server.verificationTasks.get(uri);
                        let response = "true";
                        if (!ServerClass_1.Server.debuggedVerificationTask) {
                            //TODO: use better criterion to detect a missing verification
                            Log_1.Log.hint("Cannot debug file, you must first verify the file: " + uri);
                            response = "false";
                        }
                        ipc.server.emit(socket, 'launchResponse', response);
                        //connect to Debugger as client to be able to send messages
                        ipc.connectTo('viperDebugger', () => {
                            ipc.of.viperDebugger.on('connect', () => {
                                Log_1.Log.log("Language Server connected to Debugger, as client", ViperProtocol_1.LogLevel.Debug);
                            });
                            ipc.of.viperDebugger.on('disconnect', () => {
                                Log_1.Log.log('LanguageServer disconnected from Debugger', ViperProtocol_1.LogLevel.Debug);
                                DebugServer.debuggerRunning = false;
                            });
                        });
                    });
                }
                catch (e) {
                    Log_1.Log.error("Error handling lanch request: " + e);
                }
            });
            ipc.server.on('MoveRequest', function (dataString, socket) {
                try {
                    let data = JSON.parse(dataString);
                    let newState = -1;
                    let steps = ServerClass_1.Server.debuggedVerificationTask.steps;
                    let currentDepth = steps[data.state].depthLevel();
                    switch (data.type) {
                        case ViperProtocol_1.StepType.Stay:
                            newState = data.state;
                            break;
                        case ViperProtocol_1.StepType.In:
                            newState = data.state + 1;
                            break;
                        case ViperProtocol_1.StepType.Back:
                            newState = data.state - 1;
                            break;
                        case ViperProtocol_1.StepType.Continue:
                            Log_1.Log.error("continue is not supported right now, do step next instead");
                        case ViperProtocol_1.StepType.Next:
                            for (let i = data.state + 1; i < steps.length; i++) {
                                let step = steps[i];
                                if (step.depthLevel() <= currentDepth) {
                                    //the step is on the same level or less deap
                                    newState = i;
                                    break;
                                }
                            }
                            break;
                        case ViperProtocol_1.StepType.Out:
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
                    Log_1.Log.log(`Step${ViperProtocol_1.StepType[data.type]}: state ${data.state} -> state ${newState}`, ViperProtocol_1.LogLevel.LowLevelDebug);
                    let position = ServerClass_1.Server.debuggedVerificationTask ? ServerClass_1.Server.debuggedVerificationTask.getPositionOfState(newState) : { line: 0, character: 0 };
                    if (position.line >= 0) {
                        ServerClass_1.Server.showHeap(ServerClass_1.Server.debuggedVerificationTask, newState);
                    }
                    ipc.server.emit(socket, 'MoveResponse', JSON.stringify({ position: position, state: newState }));
                }
                catch (e) {
                    Log_1.Log.log("Error handling move request: " + e);
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
                        stepsOnLine.push({ "type": Statement_1.StatementType[step.type], position: step.position });
                    });
                }
                ipc.server.emit(socket, 'stackTraceResponse', JSON.stringify(stepsOnLine));
            });
        });
        ipc.server.start();
    }
    static moveDebuggerToPos(position, step) {
        if (DebugServer.debuggerRunning) {
            try {
                ipc.of.viperDebugger.emit("MoveDebuggerToPos", JSON.stringify({ position: position, step: step }));
                Log_1.Log.log("LanguageServer is telling Debugger to Move to Position of State " + step);
            }
            catch (e) {
                Log_1.Log.error("Error sending MoveDebuggerToPos request: " + e);
            }
        }
    }
    static stopDebugging() {
        if (DebugServer.debuggerRunning) {
            try {
                ipc.of.viperDebugger.emit("StopDebugging");
                Log_1.Log.log("LanguageServer is telling Debugger to stop debugging");
            }
            catch (e) {
                Log_1.Log.error("Error sending StopDebugging request: " + e);
            }
        }
    }
}
DebugServer.debuggerRunning = false;
exports.DebugServer = DebugServer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGVidWdTZXJ2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0RlYnVnU2VydmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQVliLDhCQUFxQixlQUFlLENBQUMsQ0FBQTtBQUVyQyxnREFBZ0Q7QUFDaEQsc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBQzFCLHNDQUFzQztBQUN0QyxnQ0FBK0gsaUJBRS9ILENBQUMsQ0FGK0k7QUFDaEosbURBQW1EO0FBQ25ELG1DQUErQixvQkFBb0IsQ0FBQyxDQUFBO0FBQ3BELDRCQUF1QyxhQUFhLENBQUMsQ0FBQTtBQUNyRCxpQ0FBaUM7QUFFakMsSUFBSSxHQUFHLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBRTlCO0lBSUksT0FBYyxVQUFVO1FBQ3BCLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUN0QixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBRUQsT0FBYyxnQkFBZ0I7UUFDMUIsb0JBQU0sQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxVQUFVO1lBQ2xFLElBQUksU0FBUyxHQUFHLEVBQUUsQ0FBQztZQUNuQixFQUFFLENBQUMsQ0FBQyxvQkFBTSxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQztnQkFDbEMsb0JBQU0sQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU87b0JBQ2pELEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUM7d0JBQ3ZDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVE7NEJBQzFCLFNBQVMsQ0FBQyxJQUFJLENBQUM7Z0NBQ1gsSUFBSSxFQUFFLFFBQVE7Z0NBQ2QsS0FBSyxFQUFFLFFBQVE7Z0NBQ2Ys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