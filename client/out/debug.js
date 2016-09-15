/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';
const vscode_debugadapter_1 = require('vscode-debugadapter');
const fs_1 = require('fs');
const path_1 = require('path');
const ViperProtocol_1 = require('./ViperProtocol');
const ipc = require('node-ipc');
/**
 * This interface should always match the schema found in the mock-debug extension manifest.
 */
class ViperDebugSession extends vscode_debugadapter_1.DebugSession {
    /**
     * Creates a new debug adapter that is used for one debug session.
     * We configure the default implementation of a debug adapter here.
     */
    constructor() {
        super();
        // since we want to send breakpoint events, we will assign an id to every event
        // so that the frontend can match events with breakpoints.
        this._breakpointId = 1000;
        // This is the next position that will be 'executed'
        this._currentCharacter = 0;
        this._currentLine = 0;
        this.__currentState = 0;
        // the contents (= lines) of the one and only file
        this._sourceLines = new Array();
        // maps from sourceFile to array of Breakpoints
        this._breakPoints = new Map();
        this._variableHandles = new vscode_debugadapter_1.Handles();
        ViperDebugSession.self = this;
        // this debugger uses zero-based lines and columns
        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);
    }
    get _currentState() {
        return this.__currentState;
    }
    set _currentState(state) {
        this.__currentState = state;
        //this.sendEvent(new OutputEvent(`state: ${state}\n`));	// print current line on debug console
    }
    connectToLanguageServer() {
        ipc.config.id = 'viperDebugger';
        ipc.config.retry = 1500;
        ipc.connectTo('viper', () => {
            ipc.of.viper.on('connect', () => {
                ViperDebugSession.log("Debugger connected to Language Server");
            });
            ipc.of.viper.on('disconnect', () => {
                ViperDebugSession.log('disconnected from viper');
            });
            ipc.of.viper.on('message', (data) => {
                ViperDebugSession.log('got a message from viper : ' + data);
            });
        });
        ipc.serve(function () {
            ipc.server.on('MoveDebuggerToPos', function (data, socket) {
                try {
                    //ViperDebugSession.log("MoveDebuggerToPos " + data);
                    let obj = JSON.parse(data);
                    ViperDebugSession.self._currentLine = obj.position.line;
                    ViperDebugSession.self._currentCharacter = obj.position.character;
                    ViperDebugSession.self._currentState = obj.step;
                    ViperDebugSession.self.sendEvent(new vscode_debugadapter_1.StoppedEvent("step", ViperDebugSession.THREAD_ID));
                }
                catch (e) {
                    ViperDebugSession.log("Error handling MoveDebuggerToPos \"" + data + "\" request: " + e);
                }
            });
            ipc.server.on('StopDebugging', function (data, socket) {
                try {
                    ViperDebugSession.self.sendEvent(new vscode_debugadapter_1.TerminatedEvent(false));
                }
                catch (e) {
                    ViperDebugSession.log("Error handling StopDebugging request: " + e);
                }
            });
        });
        ipc.server.start();
    }
    registerHandlers() {
        this.registerIpcHandler("launch", false, (ok) => {
            if (ok != "true") {
                this.sendEvent(new vscode_debugadapter_1.TerminatedEvent(false));
                return;
            }
            else {
                this.requestFromLanguageServer("Move", JSON.stringify({ type: ViperProtocol_1.StepType.Continue, state: this._currentState }));
            }
        });
        this.registerIpcHandler("Move", true, res => {
            if (res.position.line >= 0) {
                this._currentLine = res.position.line;
                this._currentCharacter = res.position.character;
                this._currentState = res.state;
                this.sendEvent(new vscode_debugadapter_1.StoppedEvent("step", ViperDebugSession.THREAD_ID));
            }
            else {
                // no more lines: run to end
                this.sendEvent(new vscode_debugadapter_1.TerminatedEvent());
            }
        });
    }
    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
    initializeRequest(response, args) {
        // since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
        // we request them early by sending an 'initializeRequest' to the frontend.
        // The frontend will end the configuration sequence by calling 'configurationDone' request.
        this.sendEvent(new vscode_debugadapter_1.InitializedEvent());
        // This debug adapter implements the configurationDoneRequest.
        response.body.supportsConfigurationDoneRequest = true;
        // make VS Code to use 'evaluate' when hovering over source
        response.body.supportsEvaluateForHovers = false;
        // make VS Code to show a 'step back' button
        response.body.supportsStepBack = true;
        this.sendResponse(response);
    }
    sendTolanguageServer(method, data) {
        ipc.of.viper.emit(method, data);
    }
    requestFromLanguageServer(method, data) {
        ipc.of.viper.emit(method + "Request", data);
    }
    registerIpcHandler(method, isJsonResponse, onResponse) {
        ipc.of.viper.on(method + "Response", (data) => {
            if (data && data != "[]") {
                ViperDebugSession.log(data);
            }
            let parsedData;
            if (isJsonResponse) {
                try {
                    parsedData = JSON.parse(data);
                }
                catch (error) {
                    ViperDebugSession.log("Error:" + error.toString());
                    return;
                }
            }
            else {
                parsedData = data;
            }
            onResponse(parsedData);
        });
    }
    launchRequest(response, args) {
        //start IPC connection
        this.connectToLanguageServer();
        this.registerHandlers();
        //ViperDebugSession.log("launchRequest");
        this._sourceFile = args.program;
        this._currentState = args.startInState;
        ViperDebugSession.log("LaunchRequestArguments: " + JSON.stringify(args));
        //this._stopOnEntry = args.stopOnEntry;
        this._sourceLines = fs_1.readFileSync(this._sourceFile).toString().split('\n');
        //notify Language server about started debugging session
        this.sendResponse(response);
        this.requestFromLanguageServer("launch", args);
    }
    disconnectRequest(response, args) {
        //ViperDebugSession.log("disconnectRequest");
        // stop sending custom events
        clearInterval(this._timer);
        super.disconnectRequest(response, args);
    }
    setBreakPointsRequest(response, args) {
        ViperDebugSession.log("setBreakPointsRequest is not supported");
        this.sendResponse(response);
        // var path = args.source.path;
        // var clientLines = args.lines;
        // // read file contents into array for direct access
        // var lines = readFileSync(path).toString().split('\n');
        // var breakpoints = new Array<Breakpoint>();
        // // verify breakpoint locations
        // for (var i = 0; i < clientLines.length; i++) {
        // 	var l = this.convertClientLineToDebugger(clientLines[i]);
        // 	var verified = false;
        // 	if (l < lines.length) {
        // 		const line = lines[l].trim();
        // 		// if a line is empty or starts with '+' we don't allow to set a breakpoint but move the breakpoint down
        // 		if (line.length == 0 || line.indexOf("+") == 0)
        // 			l++;
        // 		// if a line starts with '-' we don't allow to set a breakpoint but move the breakpoint up
        // 		if (line.indexOf("-") == 0)
        // 			l--;
        // 		// don't set 'verified' to true if the line contains the word 'lazy'
        // 		// in this case the breakpoint will be verified 'lazy' after hitting it once.
        // 		if (line.indexOf("lazy") < 0) {
        // 			verified = true;    // this breakpoint has been validated
        // 		}
        // 	}
        // 	const bp = <DebugProtocol.Breakpoint>new Breakpoint(verified, this.convertDebuggerLineToClient(l));
        // 	bp.id = this._breakpointId++;
        // 	breakpoints.push(bp);
        // }
        // this._breakPoints.set(path, breakpoints);
        // // send back the actual breakpoint positions
        // response.body = {
        // 	breakpoints: breakpoints
        // };
        // this.sendResponse(response);
    }
    threadsRequest(response) {
        //ViperDebugSession.log("threadsRequest");
        // return the default thread
        response.body = {
            threads: [
                new vscode_debugadapter_1.Thread(ViperDebugSession.THREAD_ID, "thread 1")
            ]
        };
        this.sendResponse(response);
    }
    stackTraceRequest(response, args) {
        //ViperDebugSession.log("stackTraceRequest: " + JSON.stringify(args));
        const startFrame = typeof args.startFrame === 'number' ? args.startFrame : 0;
        const maxLevels = typeof args.levels;
        const frames = new Array();
        // every word of the current line becomes a stack frame.
        frames.push(new vscode_debugadapter_1.StackFrame(0, this._sourceLines[this._currentLine], new vscode_debugadapter_1.Source(path_1.basename(this._sourceFile), this.convertDebuggerPathToClient(this._sourceFile)), this.convertDebuggerLineToClient(this._currentLine), this.convertDebuggerColumnToClient(this._currentCharacter)));
        response.body = {
            stackFrames: frames,
            totalFrames: 1
        };
        this.sendResponse(response);
        /*
        this.requestFromLanguageServer("stackTrace", this.__currentLine, true, (steps) => {
            const frames = new Array<StackFrame>();
    
            frames.push(new StackFrame(i, "Root", new Source(basename(this._sourceFile), this.convertDebuggerPathToClient(this._sourceFile)), this.convertDebuggerLineToClient(this.__currentLine), 0));
            for (var i = 0; i < steps.length; i++) {
                let step = steps[i];
                frames.push(new StackFrame(i, step.type, new Source(basename(this._sourceFile), this.convertDebuggerPathToClient(this._sourceFile)), this.convertDebuggerLineToClient(step.position.line), this.convertClientColumnToDebugger(step.position.character)));
            }
    
            response.body = {
                stackFrames: frames
            };
            this.sendResponse(response);
        });
        */
    }
    scopesRequest(response, args) {
        //ViperDebugSession.log("scopesRequest");
        const frameReference = args.frameId;
        const scopes = new Array();
        scopes.push(new vscode_debugadapter_1.Scope("Local", this._variableHandles.create("local_" + frameReference), false));
        response.body = {
            scopes: scopes
        };
        this.sendResponse(response);
    }
    variablesRequest(response, args) {
        //ViperDebugSession.log("variablesRequest");
        this.sendResponse(response);
        /*
        this.requestFromLanguageServer("variablesInLine", this.__currentLine, true, (variables) => {
            response.body = {
                variables: variables
            };
            this.sendResponse(response);
        });
        */
    }
    static log(message) {
        ipc.of.viper.emit('log', message);
    }
    continueRequest(response, args) {
        ViperDebugSession.log("nextRequest");
        this.requestFromLanguageServer("Move", JSON.stringify({ type: ViperProtocol_1.StepType.Continue, state: this._currentState }));
        this.sendResponse(response);
        //ViperDebugSession.log("continueRequest does the same as next");
        //this.nextRequest(response, args);
        // // find the breakpoints for the current source file
        // const breakpoints = this._breakPoints.get(this._sourceFile);
        // for (var ln = this._currentLine + 1; ln < this._sourceLines.length; ln++) {
        // 	if (breakpoints) {
        // 		const bps = breakpoints.filter(bp => bp.line === this.convertDebuggerLineToClient(ln));
        // 		if (bps.length > 0) {
        // 			this._currentLine = ln;
        // 			// 'continue' request finished
        // 			this.sendResponse(response);
        // 			// send 'stopped' event
        // 			this.sendEvent(new StoppedEvent("breakpoint", ViperDebugSession.THREAD_ID));
        // 			// the following shows the use of 'breakpoint' events to update properties of a breakpoint in the UI
        // 			// if breakpoint is not yet verified, verify it now and send a 'breakpoint' update event
        // 			if (!bps[0].verified) {
        // 				bps[0].verified = true;
        // 				this.sendEvent(new BreakpointEvent("update", bps[0]));
        // 			}
        // 			return;
        // 		}
        // 	}
        // 	// if word 'exception' found in source -> throw exception
        // 	if (this._sourceLines[ln].indexOf("exception") >= 0) {
        // 		this._currentLine = ln;
        // 		//this.sendResponse(response);
        // 		this.sendEvent(new StoppedEvent("exception", ViperDebugSession.THREAD_ID));
        // 		this.sendEvent(new OutputEvent(`exception in line: ${ln}\n`, 'stderr'));
        // 		return;
        // 	}
        // }
        // //this.sendResponse(response);
        // // no more lines: run to end
        // this.sendEvent(new TerminatedEvent());
    }
    nextRequest(response, args) {
        ViperDebugSession.log("nextRequest");
        this.requestFromLanguageServer("Move", JSON.stringify({ type: ViperProtocol_1.StepType.Next, state: this._currentState }));
        this.sendResponse(response);
    }
    stepBackRequest(response, args) {
        ViperDebugSession.log("stepBackRequest");
        this.requestFromLanguageServer("Move", JSON.stringify({ type: ViperProtocol_1.StepType.Back, state: this._currentState }));
        this.sendResponse(response);
    }
    stepInRequest(response, args) {
        ViperDebugSession.log("stepInRequest");
        this.requestFromLanguageServer("Move", JSON.stringify({ type: ViperProtocol_1.StepType.In, state: this._currentState }));
        this.sendResponse(response);
    }
    stepOutRequest(response, args) {
        ViperDebugSession.log("stepOutRequest");
        this.requestFromLanguageServer("Move", JSON.stringify({ type: ViperProtocol_1.StepType.Out, state: this._currentState }));
        this.sendResponse(response);
    }
    evaluateRequest(response, args) {
        ViperDebugSession.log("evaluateRequest");
        this.sendResponse(response);
        /*
        this.requestFromLanguageServer("evaluate", JSON.stringify(args), false, (evaluated) => {
            response.body = {
                result: `${args.expression} = ${evaluated}`,
                variablesReference: 0
            };
            this.sendResponse(response);
        });
        */
    }
    customRequest(request, response, args) {
        ViperDebugSession.log("customRequest");
        switch (request) {
            case 'infoRequest':
                response.body = {
                    'currentFile': this.convertDebuggerPathToClient(this._sourceFile),
                    'currentLine': this.convertDebuggerLineToClient(this._currentLine)
                };
                this.sendResponse(response);
                break;
            default:
                super.customRequest(request, response, args);
                break;
        }
    }
}
// we don't support multiple threads, so we can use a hardcoded ID for the default thread
ViperDebugSession.THREAD_ID = 1;
vscode_debugadapter_1.DebugSession.run(ViperDebugSession);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvZGVidWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OzREQUU0RDtBQUU1RCxZQUFZLENBQUM7QUFFYixzQ0FJTyxxQkFBcUIsQ0FBQyxDQUFBO0FBRTdCLHFCQUEyQixJQUFJLENBQUMsQ0FBQTtBQUNoQyx1QkFBdUIsTUFBTSxDQUFDLENBQUE7QUFJOUIsZ0NBQStDLGlCQUUvQyxDQUFDLENBRitEO0FBRWhFLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUVoQzs7R0FFRztBQUVILGdDQUFnQyxrQ0FBWTtJQWtDM0M7OztPQUdHO0lBQ0g7UUFDQyxPQUFPLENBQUM7UUFsQ1QsK0VBQStFO1FBQy9FLDBEQUEwRDtRQUNsRCxrQkFBYSxHQUFHLElBQUksQ0FBQztRQUU3QixvREFBb0Q7UUFDNUMsc0JBQWlCLEdBQUcsQ0FBQyxDQUFDO1FBQ3RCLGlCQUFZLEdBQUcsQ0FBQyxDQUFDO1FBRWpCLG1CQUFjLEdBQVcsQ0FBQyxDQUFDO1FBVW5DLGtEQUFrRDtRQUMxQyxpQkFBWSxHQUFHLElBQUksS0FBSyxFQUFVLENBQUM7UUFDM0MsK0NBQStDO1FBQ3ZDLGlCQUFZLEdBQUcsSUFBSSxHQUFHLEVBQXNDLENBQUM7UUFDN0QscUJBQWdCLEdBQUcsSUFBSSw2QkFBTyxFQUFVLENBQUM7UUFhaEQsaUJBQWlCLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUM5QixrREFBa0Q7UUFDbEQsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3JDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBOUJELElBQVksYUFBYTtRQUN4QixNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQztJQUN6QixDQUFDO0lBQ0osSUFBWSxhQUFhLENBQUMsS0FBYTtRQUN0QyxJQUFJLENBQUMsY0FBYyxH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