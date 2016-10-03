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
                            ipc.disconnect('viperDebugger');
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
                        let indexIntoExecutionTrace = 0;
                        while (indexIntoExecutionTrace < task.shownExecutionTrace.length && task.shownExecutionTrace[indexIntoExecutionTrace].state != data.state) {
                            indexIntoExecutionTrace++;
                        }
                        if (indexIntoExecutionTrace >= task.shownExecutionTrace.length) {
                            Log_1.Log.error("the shown state must be in the execution trace in simple mode");
                        }
                        else {
                            let newExecutionTraceIndex = indexIntoExecutionTrace;
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
                            newServerState = task.clientStepIndexToServerStep[task.shownExecutionTrace[newExecutionTraceIndex].state].index;
                        }
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
DebugServer.debugClientConnected = false;
exports.DebugServer = DebugServer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGVidWdTZXJ2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0RlYnVnU2VydmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLDhCQUFxQixlQUFlLENBQUMsQ0FBQTtBQUNyQyxzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsZ0NBQTZHLGlCQUM3RyxDQUFDLENBRDZIO0FBRTlILDJCQUF1QixZQUFZLENBQUMsQ0FBQTtBQUNwQyxJQUFJLEdBQUcsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7QUFFOUI7SUFNSSxPQUFjLFVBQVU7UUFDcEIsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO0lBQzVCLENBQUM7SUFFRCxPQUFjLGdCQUFnQjtRQUMxQixvQkFBTSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLFVBQVU7WUFDbEUsSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO1lBQ25CLEVBQUUsQ0FBQyxDQUFDLG9CQUFNLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDO2dCQUNsQyxvQkFBTSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTztvQkFDakQsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQzt3QkFDdkMsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUTs0QkFDMUIsU0FBUyxDQUFDLElBQUksQ0FBQztnQ0FDWCxJQUFJLEVBQUUsUUFBUTtnQ0FDZCxLQUFLLEVBQUUsUUFBUTtnQ0FDZixrQkFBa0IsRUFBRSxDQUFDOzZCQUN4QixDQUFDLENBQUM7d0JBQ1AsQ0FBQyxDQUFDLENBQUE7b0JBQ04sQ0FBQztnQkFDTCxDQUFDLENBQUMs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