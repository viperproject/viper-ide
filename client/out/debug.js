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
        ipc.config.id = 'viper';
        ipc.config.retry = 1500;
        ipc.connectTo('viper', () => {
            ipc.of.viper.on('connect', () => {
                this.log("Debugger connected to Language Server");
            });
            ipc.of.viper.on('disconnect', () => {
                ipc.log('disconnected from viper');
            });
            ipc.of.viper.on('message', (data) => {
                ipc.log('got a message from viper : ', data);
            });
        });
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
        this.log("launchRequest");
        this._sourceFile = args.program;
        this._stopOnEntry = args.stopOnEntry;
        this._sourceLines = fs_1.readFileSync(this._sourceFile).toString().split('\n');
        //notify Language server about started debugging session
        this.sendResponse(response);
        this.requestFromLanguageServer("launch", this._sourceFile);
    }
    disconnectRequest(response, args) {
        this.log("disconnectRequest");
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
        this.log("scopesRequest");
        const frameReference = args.frameId;
        const scopes = new Array();
        scopes.push(new vscode_debugadapter_1.Scope("Local", this._variableHandles.create("local_" + frameReference), false));
        response.body = {
            scopes: scopes
        };
        this.sendResponse(response);
    }
    variablesRequest(response, args) {
        this.log("variablesRequest");
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