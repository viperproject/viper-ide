'use strict';
const ServerClass_1 = require('./ServerClass');
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const Settings_1 = require('./Settings');
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
                    //TODO: is this a good criterion?
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGVidWdTZXJ2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0RlYnVnU2VydmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLDhCQUF1QixlQUFlLENBQUMsQ0FBQTtBQUN2QyxzQkFBb0IsT0FBTyxDQUFDLENBQUE7QUFDNUIsZ0NBQStHLGlCQUMvRyxDQUFDLENBRCtIO0FBRWhJLDJCQUF5QixZQUFZLENBQUMsQ0FBQTtBQUN0QyxJQUFJLEdBQUcsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7QUFFOUI7SUFNSSxPQUFjLFVBQVU7UUFDcEIsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO0lBQzVCLENBQUM7SUFFRCxPQUFjLGdCQUFnQjtRQUMxQixvQkFBTSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLFVBQVU7WUFDbEUsSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO1lBQ25CLEVBQUUsQ0FBQyxDQUFDLG9CQUFNLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDO2dCQUNsQyxvQkFBTSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTztvQkFDakQsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQzt3QkFDdkMsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUTs0QkFDMUIsU0FBUyxDQUFDLElBQUksQ0FBQztnQ0FDWCxJQUFJLEVBQUUsUUFBUTtnQ0FDZCxLQUFLLEVBQUUsUUFBUTtnQ0FDZixrQkFBa0IsRUFBRSxDQUFDOzZCQUN4QixDQUFDLENBQUM7d0JBQ1AsQ0FBQyxDQUFDLENBQUE7b0JBQ04sQ0FBQztnQkFDTCxDQUFDLENBQUMs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