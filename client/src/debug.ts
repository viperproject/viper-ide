/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import {
	DebugSession,
	InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent, Event,
	Thread, StackFrame, Scope, Source, Handles, Breakpoint
} from 'vscode-debugadapter';
import {DebugProtocol} from 'vscode-debugprotocol';
import {readFileSync} from 'fs';
import {basename} from 'path';
import {LanguageClient, RequestType} from 'vscode-languageclient';
import * as vscode from 'vscode';
import {ExtensionState} from './ExtensionState';
import {StepType} from './ViperProtocol'

const ipc = require('node-ipc');

/**
 * This interface should always match the schema found in the mock-debug extension manifest.
 */
export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	/** An absolute path to the program to debug. */
	program: string;
	/** Automatically stop target after launch. If not specified, target does not stop. */
	stopOnEntry?: boolean;
}

class ViperDebugSession extends DebugSession {

	// we don't support multiple threads, so we can use a hardcoded ID for the default thread
	private static THREAD_ID = 1;

	// since we want to send breakpoint events, we will assign an id to every event
	// so that the frontend can match events with breakpoints.
	private _breakpointId = 1000;

	// This is the next position that will be 'executed'
	private _currentCharacter = 0;
	private _currentLine = 0;

	private __currentState: number = 0;
	private get _currentState(): number {
		return this.__currentState;
    }
	private set _currentState(state: number) {
		this.__currentState = state;
		this.sendEvent(new OutputEvent(`state: ${state}\n`));	// print current line on debug console
	}
	// the initial (and one and only) file we are 'debugging'
	private _sourceFile: string;
	// the contents (= lines) of the one and only file
	private _sourceLines = new Array<string>();
	// maps from sourceFile to array of Breakpoints
	private _breakPoints = new Map<string, DebugProtocol.Breakpoint[]>();
	private _variableHandles = new Handles<string>();
	private _timer;

	private _stopOnEntry: boolean = true;

	private static self:ViperDebugSession;

	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor() {
		super();
		ViperDebugSession.self = this;
		// this debugger uses zero-based lines and columns
		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);
	}

	private connectToLanguageServer() {
		ipc.config.id = 'viperDebugger';
		ipc.config.retry = 1500;
		ipc.connectTo(
			'viper', () => {
				ipc.of.viper.on(
					'connect', () => {
						ViperDebugSession.log("Debugger connected to Language Server");
					}
				);
				ipc.of.viper.on(
					'disconnect', () => {
						ViperDebugSession.log('disconnected from viper');
					}
				);
				ipc.of.viper.on(
					'message', (data) => {
						ViperDebugSession.log('got a message from viper : ' + data);
					}
				);
			}
		);

		ipc.serve(
			function () {
				ipc.server.on(
					'MoveDebuggerToPos',
					function (data, socket) {
						try {
							ViperDebugSession.log("MoveDebuggerToPos " + data);
							let obj = JSON.parse(data);
							ViperDebugSession.self._currentLine = obj.position.line;
							ViperDebugSession.self._currentCharacter = obj.position.character;
							ViperDebugSession.self._currentState = obj.step;
							ViperDebugSession.self.sendEvent(new StoppedEvent("step", ViperDebugSession.THREAD_ID));
						} catch (e) {
							ViperDebugSession.log("MoveDebuggerToPos "+e);
						}
					}
				);
			}
		);
		ipc.server.start();
	}

	private registerHandlers() {
		this.registerIpcHandler("launch", false, (ok) => {
			if (ok != "true") {
				this.sendEvent(new TerminatedEvent());
				return;
			} else {
				//if (this._stopOnEntry) {
				//stop at the first State
				this._currentState = 0;
				this.requestFromLanguageServer("Move", JSON.stringify({ type: StepType.Stay, state: this._currentState }));
				//} else {
				// we just start to run until we hit a breakpoint or an exception
				//this.continueRequest(response, { threadId: ViperDebugSession.THREAD_ID });
				//}
			}
		});
		this.registerIpcHandler("Move", true, res => {
			if (res.position.line >= 0) {
				this._currentLine = res.position.line;
				this._currentCharacter = res.position.character;
				this._currentState = res.state;
				this.sendEvent(new StoppedEvent("step", ViperDebugSession.THREAD_ID));
			} else {
				// no more lines: run to end
				this.sendEvent(new TerminatedEvent());
			}
		});
	}

	/**
	 * The 'initialize' request is the first request called by the frontend
	 * to interrogate the features the debug adapter provides.
	 */
	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {

		// since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
		// we request them early by sending an 'initializeRequest' to the frontend.
		// The frontend will end the configuration sequence by calling 'configurationDone' request.
		this.sendEvent(new InitializedEvent());

		// This debug adapter implements the configurationDoneRequest.
		response.body.supportsConfigurationDoneRequest = true;

		// make VS Code to use 'evaluate' when hovering over source
		response.body.supportsEvaluateForHovers = false;

		// make VS Code to show a 'step back' button
		response.body.supportsStepBack = true;

		this.sendResponse(response);
	}

	private sendTolanguageServer(method: string, data: any) {
		ipc.of.viper.emit(method, data);
	}

	private requestFromLanguageServer(method: string, data: any) {
		ipc.of.viper.emit(method + "Request", data);
	}

	private registerIpcHandler(method: string, isJsonResponse: boolean, onResponse): any {
		ipc.of.viper.on(
			method + "Response", (data) => {
				if (data && data != "[]") {
					ViperDebugSession.log(data);
				}
				let parsedData;
				if (isJsonResponse) {
					try {
						parsedData = JSON.parse(data);
					} catch (error) {
						ViperDebugSession.log("Error:" + error.toString());
						return;
					}
				} else {
					parsedData = data;
				}
				onResponse(parsedData);
			}
		);
	}

	//TODO: make sure to send ContinueRequest instead of LaunchRequest
	protected launchRequest(response: DebugProtocol.ContinueResponse, args: LaunchRequestArguments): void {
		//start IPC connection
		this.connectToLanguageServer();
		this.registerHandlers();
		//ViperDebugSession.log("launchRequest");

		this._sourceFile = args.program;
		this._stopOnEntry = args.stopOnEntry;
		this._sourceLines = readFileSync(this._sourceFile).toString().split('\n');
		//notify Language server about started debugging session
		this.sendResponse(response);
		this.requestFromLanguageServer("launch", this._sourceFile);
	}

	protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): void {
		//ViperDebugSession.log("disconnectRequest");
		// stop sending custom events
		clearInterval(this._timer);
		super.disconnectRequest(response, args);
	}

	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
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

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
		//ViperDebugSession.log("threadsRequest");
		// return the default thread
		response.body = {
			threads: [
				new Thread(ViperDebugSession.THREAD_ID, "thread 1")
			]
		};
		this.sendResponse(response);
	}

	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
		//ViperDebugSession.log("stackTraceRequest: " + JSON.stringify(args));

		const startFrame = typeof args.startFrame === 'number' ? args.startFrame : 0;
		const maxLevels = typeof args.levels;

		const frames = new Array<StackFrame>();
		// every word of the current line becomes a stack frame.
		frames.push(new StackFrame(0,
			this._sourceLines[this._currentLine],
			new Source(basename(this._sourceFile), this.convertDebuggerPathToClient(this._sourceFile)),
			this.convertDebuggerLineToClient(this._currentLine),
			this.convertDebuggerColumnToClient(this._currentCharacter)));
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

	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
		//ViperDebugSession.log("scopesRequest");
		const frameReference = args.frameId;
		const scopes = new Array<Scope>();

		scopes.push(new Scope("Local", this._variableHandles.create("local_" + frameReference), false));

		response.body = {
			scopes: scopes
		};
		this.sendResponse(response);
	}
	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
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

	public static log(message: string) {
		ipc.of.viper.emit('log', message);
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		ViperDebugSession.log("continueRequest does the same as next");
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

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
		ViperDebugSession.log("nextRequest");
		this.requestFromLanguageServer("Move", JSON.stringify({ type: StepType.Next, state: this._currentState }));
		this.sendResponse(response);
	}

	protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): void {
		ViperDebugSession.log("stepBackRequest");
		this.requestFromLanguageServer("Move", JSON.stringify({ type: StepType.Back, state: this._currentState }));
		this.sendResponse(response);
	}

	protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments) {
		ViperDebugSession.log("stepInRequest");
		this.requestFromLanguageServer("Move", JSON.stringify({ type: StepType.In, state: this._currentState }));
		this.sendResponse(response);
	}

	protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments) {
		ViperDebugSession.log("stepOutRequest");
		this.requestFromLanguageServer("Move", JSON.stringify({ type: StepType.Out, state: this._currentState }));
		this.sendResponse(response);
	}

	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
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

	protected customRequest(request: string, response: DebugProtocol.Response, args: any): void {
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

DebugSession.run(ViperDebugSession);
