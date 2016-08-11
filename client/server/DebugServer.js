'use strict';
const server_1 = require('./server');
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
        server_1.Server.connection.onRequest({ method: 'variablesInLine' }, (lineNumber) => {
            let variables = [];
            if (server_1.Server.debuggedVerificationTask) {
                server_1.Server.debuggedVerificationTask.steps.forEach(element => {
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
                DebugServer.debuggerRunning = true;
                Log_1.Log.log('Debugging was requested for file: ' + data, ViperProtocol_1.LogLevel.Debug);
                VerificationTask_1.VerificationTask.pathToUri(data).then((uri) => {
                    server_1.Server.debuggedVerificationTask = server_1.Server.verificationTasks.get(uri);
                    let response = "true";
                    if (!server_1.Server.debuggedVerificationTask) {
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
                if (server_1.Server.debuggedVerificationTask) {
                    let steps = server_1.Server.debuggedVerificationTask.getStepsOnLine(lineNumber);
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
                let evaluated = server_1.Server.debuggedVerificationTask.model.values.has(data.expression)
                    ? server_1.Server.debuggedVerificationTask.model.values.get(data.expression)
                    : "unknown";
                ipc.server.emit(socket, 'evaluateResponse', JSON.stringify(evaluated));
            });
            ipc.server.on('MoveRequest', function (dataString, socket) {
                let data = JSON.parse(dataString);
                let newState = -1;
                let steps = server_1.Server.debuggedVerificationTask.steps;
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
                let position = server_1.Server.debuggedVerificationTask ? server_1.Server.debuggedVerificationTask.getPositionOfState(newState) : { line: 0, character: 0 };
                if (position.line >= 0) {
                    server_1.Server.showHeap(server_1.Server.debuggedVerificationTask, newState);
                }
                ipc.server.emit(socket, 'MoveResponse', JSON.stringify({ position: position, state: newState }));
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
                if (server_1.Server.debuggedVerificationTask) {
                    let steps = server_1.Server.debuggedVerificationTask.getStepsOnLine(lineNumber);
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
                Log_1.Log.error("MoveDebuggerToPos: " + e);
            }
        }
    }
}
DebugServer.debuggerRunning = false;
exports.DebugServer = DebugServer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGVidWdTZXJ2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0RlYnVnU2VydmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQVliLHlCQUFxQixVQUFVLENBQUMsQ0FBQTtBQUVoQyxnREFBZ0Q7QUFDaEQsc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBQzFCLHNDQUFzQztBQUN0QyxnQ0FBK0gsaUJBRS9ILENBQUMsQ0FGK0k7QUFDaEosbURBQW1EO0FBQ25ELG1DQUErQixvQkFBb0IsQ0FBQyxDQUFBO0FBQ3BELDRCQUF1QyxhQUFhLENBQUMsQ0FBQTtBQUNyRCxpQ0FBaUM7QUFFakMsSUFBSSxHQUFHLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBRTlCO0lBSUksT0FBYyxVQUFVO1FBQ3BCLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUN0QixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBRUQsT0FBYyxnQkFBZ0I7UUFDMUIsZUFBTSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLFVBQVU7WUFDbEUsSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO1lBQ25CLEVBQUUsQ0FBQyxDQUFDLGVBQU0sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xDLGVBQU0sQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU87b0JBQ2pELEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUM7d0JBQ3ZDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVE7NEJBQzFCLFNBQVMsQ0FBQyxJQUFJLENBQUM7Z0NBQ1gsSUFBSSxFQUFFLFFBQVE7Z0NBQ2QsS0FBSyxFQUFFLFFBQVE7Z0NBQ2Ysa0JB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