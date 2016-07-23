/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';
const vscode_debugadapter_1 = require('vscode-debugadapter');
const fs_1 = require('fs');
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
        this._currentState = 0;
        // This is the next line that will be 'executed'
        this.__currentLine = 0;
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
    get _currentLine() {
        return this.__currentLine;
    }
    set _currentLine(line) {
        this.__currentLine = line;
        this.sendEvent(new vscode_debugadapter_1.OutputEvent(`line: ${line}\n`)); // print current line on debug console
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
        this.registerIpcHandler("launch", this._sourceFile, false, (ok) => {
            if (ok != "true") {
                this.sendEvent(new vscode_debugadapter_1.TerminatedEvent());
                return;
            }
            else {
                //if (this._stopOnEntry) {
                //stop at the first State
                this._currentState = 0;
                this.requestFromLanguageServer("lineOfState", this._currentState);
            }
        });
        this.registerIpcHandler("lineOfState", this._currentState, false, line => {
            if (line >= 0) {
                this._currentLine = line;
                //this.sendResponse(response);
                this.sendEvent(new vscode_debugadapter_1.StoppedEvent("step", ViperDebugSession.THREAD_ID));
            }
            else {
                // no more lines: run to end
                //this.sendResponse(response);
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
    registerIpcHandler(method, data, isJsonResponse, onResponse) {
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
        this._sourceFile = args.program;
        this._stopOnEntry = args.stopOnEntry;
        this._sourceLines = fs_1.readFileSync(this._sourceFile).toString().split('\n');
        //notify Language server about started debugging session
        this.sendResponse(response);
        this.requestFromLanguageServer("launch", this._sourceFile);
        this.sendEvent(new vscode_debugadapter_1.StoppedEvent("entry", ViperDebugSession.THREAD_ID));
    }
    disconnectRequest(response, args) {
        // stop sending custom events
        clearInterval(this._timer);
        super.disconnectRequest(response, args);
    }
    setBreakPointsRequest(response, args) {
        var path = args.source.path;
        var clientLines = args.lines;
        // read file contents into array for direct access
        var lines = fs_1.readFileSync(path).toString().split('\n');
        var breakpoints = new Array();
        // verify breakpoint locations
        for (var i = 0; i < clientLines.length; i++) {
            var l = this.convertClientLineToDebugger(clientLines[i]);
            var verified = false;
            if (l < lines.length) {
                const line = lines[l].trim();
                // if a line is empty or starts with '+' we don't allow to set a breakpoint but move the breakpoint down
                if (line.length == 0 || line.indexOf("+") == 0)
                    l++;
                // if a line starts with '-' we don't allow to set a breakpoint but move the breakpoint up
                if (line.indexOf("-") == 0)
                    l--;
                // don't set 'verified' to true if the line contains the word 'lazy'
                // in this case the breakpoint will be verified 'lazy' after hitting it once.
                if (line.indexOf("lazy") < 0) {
                    verified = true; // this breakpoint has been validated
                }
            }
            const bp = new vscode_debugadapter_1.Breakpoint(verified, this.convertDebuggerLineToClient(l));
            bp.id = this._breakpointId++;
            breakpoints.push(bp);
        }
        this._breakPoints.set(path, breakpoints);
        // send back the actual breakpoint positions
        response.body = {
            breakpoints: breakpoints
        };
        this.sendResponse(response);
    }
    threadsRequest(response) {
        // return the default thread
        response.body = {
            threads: [
                new vscode_debugadapter_1.Thread(ViperDebugSession.THREAD_ID, "thread 1")
            ]
        };
        this.sendResponse(response);
    }
    stackTraceRequest(response, args) {
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
        const frameReference = args.frameId;
        const scopes = new Array();
        scopes.push(new vscode_debugadapter_1.Scope("Local", this._variableHandles.create("local_" + frameReference), false));
        response.body = {
            scopes: scopes
        };
        this.sendResponse(response);
    }
    variablesRequest(response, args) {
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
        // find the breakpoints for the current source file
        const breakpoints = this._breakPoints.get(this._sourceFile);
        for (var ln = this._currentLine + 1; ln < this._sourceLines.length; ln++) {
            if (breakpoints) {
                const bps = breakpoints.filter(bp => bp.line === this.convertDebuggerLineToClient(ln));
                if (bps.length > 0) {
                    this._currentLine = ln;
                    // 'continue' request finished
                    this.sendResponse(response);
                    // send 'stopped' event
                    this.sendEvent(new vscode_debugadapter_1.StoppedEvent("breakpoint", ViperDebugSession.THREAD_ID));
                    // the following shows the use of 'breakpoint' events to update properties of a breakpoint in the UI
                    // if breakpoint is not yet verified, verify it now and send a 'breakpoint' update event
                    if (!bps[0].verified) {
                        bps[0].verified = true;
                        this.sendEvent(new vscode_debugadapter_1.BreakpointEvent("update", bps[0]));
                    }
                    return;
                }
            }
            // if word 'exception' found in source -> throw exception
            if (this._sourceLines[ln].indexOf("exception") >= 0) {
                this._currentLine = ln;
                //this.sendResponse(response);
                this.sendEvent(new vscode_debugadapter_1.StoppedEvent("exception", ViperDebugSession.THREAD_ID));
                this.sendEvent(new vscode_debugadapter_1.OutputEvent(`exception in line: ${ln}\n`, 'stderr'));
                return;
            }
        }
        //this.sendResponse(response);
        // no more lines: run to end
        this.sendEvent(new vscode_debugadapter_1.TerminatedEvent());
    }
    nextRequest(response, args) {
        this._currentState++;
        this.requestFromLanguageServer("lineOfState", this._currentState);
        this.sendResponse(response);
    }
    stepBackRequest(response, args) {
        if (this._currentState > 0) {
            this._currentState--;
            this.requestFromLanguageServer("lineOfState", this._currentState);
        }
        this.sendResponse(response);
    }
    evaluateRequest(response, args) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvZGVidWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OzREQUU0RDtBQUU1RCxZQUFZLENBQUM7QUFFYixzQ0FJTyxxQkFBcUIsQ0FBQyxDQUFBO0FBRTdCLHFCQUEyQixJQUFJLENBQUMsQ0FBQTtBQU1oQyxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7QUFZaEMsZ0NBQWdDLGtDQUFZO0lBK0IzQzs7O09BR0c7SUFDSDtRQUNDLE9BQU8sQ0FBQztRQS9CVCwrRUFBK0U7UUFDL0UsMERBQTBEO1FBQ2xELGtCQUFhLEdBQUcsSUFBSSxDQUFDO1FBRXJCLGtCQUFhLEdBQVcsQ0FBQyxDQUFDO1FBRWxDLGdEQUFnRDtRQUN4QyxrQkFBYSxHQUFHLENBQUMsQ0FBQztRQVUxQixrREFBa0Q7UUFDMUMsaUJBQVksR0FBRyxJQUFJLEtBQUssRUFBVSxDQUFDO1FBQzNDLCtDQUErQztRQUN2QyxpQkFBWSxHQUFHLElBQUksR0FBRyxFQUFzQyxDQUFDO1FBQzdELHFCQUFnQixHQUFHLElBQUksNkJBQU8sRUFBVSxDQUFDO1FBR3pDLGlCQUFZLEdBQVksSUFBSSxDQUFDO1FBU3BDLGtEQUFrRDtRQUNsRCxJQUFJLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDckMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUE1QkQsSUFBWSxZQUFZO1FBQ3ZCLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO0lBQ3hCLENBQUM7SUFDSixJQUFZLFlBQVksQ0FBQyxJQUFZO1FBQ3BDLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO1FBQzFCLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxpQ0FBVyxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsc0NBQXNDO0lBQzNGLENBQUM7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