'use strict';
const ServerClass_1 = require('./ServerClass');
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const VerificationTask_1 = require('./VerificationTask');
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
        //connect to Debugger as client to be able to send messages
        ipc.connectTo('viperDebugger', () => {
            ipc.of.viperDebugger.on('connect', () => {
                Log_1.Log.log("Language Server connected to Debugger, as client", ViperProtocol_1.LogLevel.Debug);
            });
            ipc.of.viperDebugger.on('disconnect', () => {
                ipc.disconnect();
                if (DebugServer.debuggerRunning) {
                    Log_1.Log.log('LanguageServer disconnected from Debugger', ViperProtocol_1.LogLevel.Debug);
                    DebugServer.debuggerRunning = false;
                    ServerClass_1.Server.sendStopDebuggingNotification();
                }
            });
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
                    VerificationTask_1.VerificationTask.pathToUri(data.program).then((uri) => {
                        ServerClass_1.Server.debuggedVerificationTask = ServerClass_1.Server.verificationTasks.get(uri);
                        let response = "true";
                        if (!ServerClass_1.Server.debuggedVerificationTask) {
                            //TODO: use better criterion to detect a missing verification
                            Log_1.Log.hint("Cannot debug file, you must first verify the file: " + uri);
                            response = "false";
                        }
                        ipc.server.emit(socket, 'launchResponse', response);
                    });
                }
                catch (e) {
                    Log_1.Log.error("Error handling lanch request: " + e);
                }
            });
            ipc.server.on('MoveRequest', function (dataString, socket) {
                try {
                    let data = JSON.parse(dataString);
                    let newServerState = -1;
                    //translate from client state to server state
                    let currentServerState = ServerClass_1.Server.debuggedVerificationTask.clientStepIndexToServerStep[data.state].index;
                    let steps = ServerClass_1.Server.debuggedVerificationTask.steps;
                    let currentDepth = steps[currentServerState].depthLevel();
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
                    let position = ServerClass_1.Server.debuggedVerificationTask ? ServerClass_1.Server.debuggedVerificationTask.getPositionOfState(newServerState) : { line: 0, character: 0 };
                    //translate from server state to client state
                    let newClientState = (newServerState >= 0) ? steps[newServerState].decorationOptions.index : -1;
                    if (position.line >= 0) {
                        ServerClass_1.Server.showHeap(ServerClass_1.Server.debuggedVerificationTask, newClientState);
                    }
                    Log_1.Log.log(`Step${ViperProtocol_1.StepType[data.type]}: state ${data.state} -> state ${newClientState}`, ViperProtocol_1.LogLevel.LowLevelDebug);
                    ipc.server.emit(socket, 'MoveResponse', JSON.stringify({ position: position, state: newClientState }));
                }
                catch (e) {
                    Log_1.Log.error("Error handling move request: " + e);
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
                ipc.of.viperDebugger.emit("MoveDebuggerToPos", JSON.stringify({ position: position, step: clientStep }));
                Log_1.Log.log("LanguageServer is telling Debugger to Move to Position of State " + clientStep, ViperProtocol_1.LogLevel.Debug);
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
exports.DebugServer = DebugServer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGVidWdTZXJ2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0RlYnVnU2VydmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLDhCQUFxQixlQUFlLENBQUMsQ0FBQTtBQUNyQyxzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsZ0NBQXNLLGlCQUN0SyxDQUFDLENBRHNMO0FBQ3ZMLG1DQUErQixvQkFBb0IsQ0FBQyxDQUFBO0FBQ3BELElBQUksR0FBRyxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUU5QjtJQUlJLE9BQWMsVUFBVTtRQUNwQixJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDdEIsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7SUFDNUIsQ0FBQztJQUVELE9BQWMsZ0JBQWdCO1FBQzFCLG9CQUFNLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsRUFBRSxFQUFFLENBQUMsVUFBVTtZQUNsRSxJQUFJLFNBQVMsR0FBRyxFQUFFLENBQUM7WUFDbkIsRUFBRSxDQUFDLENBQUMsb0JBQU0sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xDLG9CQUFNLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFPO29CQUNqRCxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDO3dCQUN2QyxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFROzRCQUMxQixTQUFTLENBQUMsSUFBSSxDQUFDO2dDQUNYLElBQUksRUFBRSxRQUFRO2dDQUNkLEtBQUssRUFBRSxRQUFRO2dDQUNmLGtCQUFrQixFQUFFLENBQUM7NkJBQ3hCLENBQUMsQ0FBQzt3QkFDUCxDQUFDLENBQUMsQ0FBQTtvQkFDTixDQUFDO2dCQUNMLENBQUMsQ0FB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