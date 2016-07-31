/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';
const vscode_debugadapter_1 = require('vscode-debugadapter');
const fs_1 = require('fs');
const path_1 = require('path');
const ViperProtocol_1 = require('./ViperProtocol');
const ipc = require('node-ipc');
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
        this._stopOnEntry = true;
        // this debugger uses zero-based lines and columns
        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);
    }
    get _currentState() {
        return this.__currentState;
    }
    set _currentState(state) {
        this.__currentState = state;
        this.sendEvent(new vscode_debugadapter_1.OutputEvent(`state: ${state}\n`)); // print current line on debug console
    }
    connectToLanguageServer() {
        ipc.config.id = 'viperDebugger';
        ipc.config.retry = 1500;
        ipc.connectTo('viper', () => {
            ipc.of.viper.on('connect', () => {
                this.log("Debugger connected to Language Server");
            });
            ipc.of.viper.on('disconnect', () => {
                this.log('disconnected from viper');
            });
            ipc.of.viper.on('message', (data) => {
                this.log('got a message from viper : ' + data);
            });
        });
        ipc.serve(function () {
            ipc.server.on('MoveDebuggerToPos', function (data, socket) {
                try {
                    this.log("MoveDebuggerToPos " + data);
                    let position = JSON.parse(data);
                    this._currentLine = position.line;
                    this._currentCharacter = position.character;
                    this.sendEvent(new vscode_debugadapter_1.StoppedEvent("step", ViperDebugSession.THREAD_ID));
                }
                catch (e) {
                    this.log(e);
                }
            });
        });
        ipc.server.start();
    }
    registerHandlers() {
        this.registerIpcHandler("launch", false, (ok) => {
            if (ok != "true") {
                this.sendEvent(new vscode_debugadapter_1.TerminatedEvent());
                return;
            }
            else {
                //if (this._stopOnEntry) {
                //stop at the first State
                this._currentState = 0;
                this.requestFromLanguageServer("Move", JSON.stringify({ type: ViperProtocol_1.StepType.Stay, state: this._currentState }));
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
                this.log(data);
            }
            let parsedData;
            if (isJsonResponse) {
                try {
                    parsedData = JSON.parse(data);
                }
                catch (error) {
                    this.log("Error:" + error.toString());
                    return;
                }
            }
            else {
                parsedData = data;
            }
            onResponse(parsedData);
        });
    }
    //TODO: make sure to send ContinueRequest instead of LaunchRequest
    launchRequest(response, args) {
        //start IPC connection
        this.connectToLanguageServer();
        this.registerHandlers();
        //this.log("launchRequest");
        this._sourceFile = args.program;
        this._stopOnEntry = args.stopOnEntry;
        this._sourceLines = fs_1.readFileSync(this._sourceFile).toString().split('\n');
        //notify Language server about started debugging session
        this.sendResponse(response);
        this.requestFromLanguageServer("launch", this._sourceFile);
    }
    disconnectRequest(response, args) {
        //this.log("disconnectRequest");
        // stop sending custom events
        clearInterval(this._timer);
        super.disconnectRequest(response, args);
    }
    setBreakPointsRequest(response, args) {
        this.log("setBreakPointsRequest is not supported");
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
        //this.log("threadsRequest");
        // return the default thread
        response.body = {
            threads: [
                new vscode_debugadapter_1.Thread(ViperDebugSession.THREAD_ID, "thread 1")
            ]
        };
        this.sendResponse(response);
    }
    stackTraceRequest(response, args) {
        //this.log("stackTraceRequest: " + JSON.stringify(args));
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
        //this.log("scopesRequest");
        const frameReference = args.frameId;
        const scopes = new Array();
        scopes.push(new vscode_debugadapter_1.Scope("Local", this._variableHandles.create("local_" + frameReference), false));
        response.body = {
            scopes: scopes
        };
        this.sendResponse(response);
    }
    variablesRequest(response, args) {
        //this.log("variablesRequest");
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
    log(message) {
        ipc.of.viper.emit('log', message);
    }
    continueRequest(response, args) {
        this.log("continueRequest does the same as next");
        this.nextRequest(response, args);
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
        this.log("nextRequest");
        this.requestFromLanguageServer("Move", JSON.stringify({ type: ViperProtocol_1.StepType.Next, state: this._currentState }));
        this.sendResponse(response);
    }
    stepBackRequest(response, args) {
        this.log("stepBackRequest");
        this.requestFromLanguageServer("Move", JSON.stringify({ type: ViperProtocol_1.StepType.Back, state: this._currentState }));
        this.sendResponse(response);
    }
    stepInRequest(response, args) {
        this.log("stepInRequest");
        this.requestFromLanguageServer("Move", JSON.stringify({ type: ViperProtocol_1.StepType.In, state: this._currentState }));
        this.sendResponse(response);
    }
    stepOutRequest(response, args) {
        this.log("stepOutRequest");
        this.requestFromLanguageServer("Move", JSON.stringify({ type: ViperProtocol_1.StepType.Out, state: this._currentState }));
        this.sendResponse(response);
    }
    evaluateRequest(response, args) {
        this.log("evaluateRequest");
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
        this.log("customRequest");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvZGVidWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OzREQUU0RDtBQUU1RCxZQUFZLENBQUM7QUFFYixzQ0FJTyxxQkFBcUIsQ0FBQyxDQUFBO0FBRTdCLHFCQUEyQixJQUFJLENBQUMsQ0FBQTtBQUNoQyx1QkFBdUIsTUFBTSxDQUFDLENBQUE7QUFJOUIsZ0NBQXVCLGlCQUV2QixDQUFDLENBRnVDO0FBRXhDLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztBQVloQyxnQ0FBZ0Msa0NBQVk7SUFnQzNDOzs7T0FHRztJQUNIO1FBQ0MsT0FBTyxDQUFDO1FBaENULCtFQUErRTtRQUMvRSwwREFBMEQ7UUFDbEQsa0JBQWEsR0FBRyxJQUFJLENBQUM7UUFFN0Isb0RBQW9EO1FBQzVDLHNCQUFpQixHQUFHLENBQUMsQ0FBQztRQUN0QixpQkFBWSxHQUFHLENBQUMsQ0FBQztRQUVqQixtQkFBYyxHQUFXLENBQUMsQ0FBQztRQVVuQyxrREFBa0Q7UUFDMUMsaUJBQVksR0FBRyxJQUFJLEtBQUssRUFBVSxDQUFDO1FBQzNDLCtDQUErQztRQUN2QyxpQkFBWSxHQUFHLElBQUksR0FBRyxFQUFzQyxDQUFDO1FBQzdELHFCQUFnQixHQUFHLElBQUksNkJBQU8sRUFBVSxDQUFDO1FBR3pDLGlCQUFZLEdBQVksSUFBSSxDQUFDO1FBU3BDLGtEQUFrRDtRQUNsRCxJQUFJLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDckMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUE1QkQsSUFBWSxhQUFhO1FBQ3hCLE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDO0lBQ3pCLENBQUM7SUFDSixJQUFZLGFBQWEsQ0FBQyxLQUFhO1FBQ3RDLElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDO1FBQzVCLElB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