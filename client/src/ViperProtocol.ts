/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2020 ETH Zurich.
  */

import * as child_process from 'child_process';
import * as vscode from 'vscode';
import { NotificationType, RequestType0, RequestType } from 'vscode-jsonrpc';
import { URI } from 'vscode-uri';
import { Log } from './Log';

//==============================================================================
// These commands are used to distinguish the different message types.
// 
// A file containing the same set of commands also exists in the ViperServer
// code base under viper/server/frontends/lsp/CommandProtocol.scala. The set of 
// commands in both files should be kept in sync.
//==============================================================================

// implementation note:
// - RequestType0 represents an LSP request & response pair whose request does not take any arguments
// - RequestType represents an LSP request & response pair whose request takes exactly 1 argument

export class Commands {
    //SERVER TO CLIENT
    //Server notifies client about a state change
    static StateChange: NotificationType<StateChangeParams> = new NotificationType("StateChange");
    //LOGGING
    //Log a message to the output
    static Log: NotificationType<LogParams> = new NotificationType("Log");
    //Server tells client to show an information message to the user
    static Hint: NotificationType<HintMessage> = new NotificationType("Hint");
    //Server is notifying client that the verification could not be started
    static VerificationNotStarted: NotificationType<VerificationNotStartedParams> = new NotificationType("VerificationNotStarted");
    //Either server or client request debugging to be stopped
    // static StopDebugging = "StopDebugging";//void
    // static StepsAsDecorationOptions = "StepsAsDecorationOptions";//StepsAsDecorationOptionsResult
    // static HeapGraph = "HeapGraph";//HeapGraph
    /** The language server notifies an unhandled message type from ViperServer.
     *  
     *  Used to inform the client that there might be some additional messages
     *  that may be destined to some extension via the ViperApi.
     */
    static UnhandledViperServerMessageType: NotificationType<UnhandledViperServerMessageTypeParams> = new NotificationType('UnhandledViperServerMessageType');

    //CLIENT TO SERVER
    static GetVersion: RequestType<GetVersionRequest, GetVersionResponse, void> = new RequestType("GetVersion");
    static GetDefinitions: RequestType<GetDefinitionsRequest, GetDefinitionsResponse, void> = new RequestType("GetDefinitions")
    //Client requests verification for a file
    static Verify: NotificationType<VerifyParams> = new NotificationType("Verify");
    //Client tells server to abort the running verification
    static StopVerification: RequestType<StopVerificationRequest, StopVerificationResponse, void> = new RequestType("StopVerification");
    static GetLanguageServerUrl: RequestType0<GetLanguageServerUrlResponse, void> = new RequestType0("GetLanguageServerUrl");
    // static ShowHeap = "ShowHeap";//ShowHeapParams
    //Request a list of all states that led to the current state
    // static GetExecutionTrace = "GetExecutionTrace";//GetExecutionTraceParams -> trace:ExecutionTrace[]
    //remove the diagnostics in the file specified by uri
    static RemoveDiagnostics: RequestType<RemoveDiagnosticsRequest, RemoveDiagnosticsResponse, void> = new RequestType("RemoveDiagnostics");
    //The server requests the custom file endings specified in the configuration
    static GetViperFileEndings: RequestType0<GetViperFileEndingsResponse, void> = new RequestType0("GetViperFileEndings");
    //The client requests the cache in the viperserver to be flushed, (either completely or for a file)
    static FlushCache: RequestType<FlushCacheParams, void, void> = new RequestType("FlushCache");
    //The server requests the identifier at some location in the current file to answer the gotoDefinition request
    static GetIdentifier: RequestType<Position, GetIdentifierResponse, void> = new RequestType("GetIdentifier");
}

//==============================================================================
// These data structures are used in communication between the client and the
// server.

// A file containing the same set of data structures also exists in the 
// ViperServer code base under viper/server/frontends/lsp/DataProtocol.scala. 
// The set of commands in both files should be kept in sync.
//==============================================================================

export interface GetVersionRequest {
    clientVersion: string
}

export interface GetVersionResponse {
    serverVersion: string,
    error: string | null // error message if client is not supported by server, null otherwise
}

export interface GetDefinitionsRequest {
    uri: string
}

export interface GetDefinitionsResponse {
    definitions: Definition[]
}

export interface GetExecutionTraceParams {
    uri: string;
    clientState: number;
}

export interface VerifyParams {
    uri: string;
    manuallyTriggered: boolean;
    workspace: string;
    backend: string;
    verifyTarget: string;
    customArgs: string;
}

export interface Command {
    method: string;
}

//Communication between Language Client and Language Server:

export interface ExecutionTrace {
    state: number;
    color: string;
    showNumber: boolean;
}

export enum VerificationState {
    Stopped = 0,
    Starting = 1,
    VerificationRunning = 2,
    VerificationPrintingHelp = 3,
    VerificationReporting = 4,
    PostProcessing = 5,
    Ready = 6,
    Stopping = 7,
    Stage = 8
}

export enum LogLevel {
    //No output
    None = 0,
    //Only verification specific output
    Default = 1,
    //Some info about internal state, critical errors
    Info = 2,
    //More info about internal state
    Verbose = 3,
    //Detailed information about internal state, non critical errors
    Debug = 4,
    //all output of used tools is written to logFile,
    //some of it also to the console
    LowLevelDebug = 5
}

//Verification Success
export enum Success {
    //Used for initialization
    None = 0,
    Success = 1,
    ParsingFailed = 2,
    TypecheckingFailed = 3,
    VerificationFailed = 4,
    //Manually aborted verification
    Aborted = 5,
    //Caused by internal error
    Error = 6,
    //Caused by verification taking too long
    Timeout = 7
}

export interface StateChangeParams {
    newState: VerificationState;
    progress?: number;
    success?: Success;
    verificationCompleted?: number;
    manuallyTriggered?: number;
    filename?: string;
    backendName?: string;
    time?: number;
    verificationNeeded?: number;
    uri?: string;
    stage?: string;
    error?: string;
    diagnostics?: vscode.Diagnostic[]
}

export interface BackendReadyParams {
    //name of the backend ready to use
    name: string;
    //should the open file be reverified
    restarted: boolean;
    isViperServer: boolean;
}

export interface BackendStartedParams {
    //name of the backend ready to use
    name: string;
    //should the open file be reverified
    forceRestart: boolean;
    isViperServer: boolean;
}

export interface StopVerificationRequest {
    uri: string
}

export interface StopVerificationResponse {
    success: boolean
}

export interface GetLanguageServerUrlResponse {
    url: string
}

export interface RemoveDiagnosticsRequest {
    uri: string
}

export interface RemoveDiagnosticsResponse {
    success: boolean
}

export interface GetViperFileEndingsResponse {
    fileEndings: string[]
}

export interface ShowHeapParams {
    //file to show heap params of
    uri: string,
    //the index of the state to show
    //the client index does only take the states with a position into account
    clientIndex: number;
    //is the server expected to return the heap, or is it just a notification and the heap already known.
    isHeapNeeded: boolean;
}

export interface HeapGraph {
    //dot representation of heap
    heap: string,
    //dot representation of the old heap
    oldHeap: string,
    //dot representation of the partial execution tree around the current state
    partialExecutionTree: string,
    //client index of represented state
    state: number,
    //information about verified file
    fileName: string,
    fileUri: string,
    position: Position,
    stateInfos: string,
    //name of method containing the represented state
    methodName: string,
    //predicate, function or method
    methodType: string,
    methodOffset: number,
    conditions: string[]
}

// own Position interface, because vscode.Position is not available at Language Server
export interface Position {
    line: number;
    character: number;
}
//own Range interface, because vscode.Range is not available at Language Server
export interface Range {
    start: Position,
    end: Position
}

//colors of states shown in the source code during debugging for both viper light and viper dark theme
export class StateColors {
    //currently selected state
    static currentState(dark: boolean): string {
        return dark ? "red" : "red";
    }
    //previously selected state
    static previousState(dark: boolean): string {
        return dark ? "green" : "green";
    }
    //state in which an error was reported by the backend
    static errorState(dark: boolean): string {
        return dark ? "yellow" : "orange";
    }
    //state in same method as current state
    static interestingState(dark: boolean): string {
        return dark ? "yellow" : "orange";
    }
    //state in other method
    static uninterestingState(dark: boolean): string {
        return dark ? "grey" : "grey";
    }
}

export interface StepsAsDecorationOptionsResult {
    //decoration options to be shown in the source code
    decorationOptions: MyProtocolDecorationOptions[],
    //info that relates to all states
    globalInfo: string
    //file under verification
    uri: string;
}

export interface SettingsCheckedParams {
    ok: boolean;
    errors: SettingsError[];
    settings: ViperSettings;
}

export interface LogParams {
    data: string;
    logLevel: LogLevel;
}

export interface ProgressParams {
    data: Progress;
    logLevel: LogLevel;
}

export interface MyProtocolDecorationOptions {
    hoverMessage: string;
    range: Range;
    renderOptions: {
        before: {
            contentText: string,
            color: string
        }
    }
    //state index relative to the method start
    numberToDisplay: number;
    //position in the unmodified source file
    originalPosition: Position;
    //depth in the symbExLog
    depth: number,
    //used for determining which states belong to the same method
    methodIndex: number,
    //client index of current state
    index: number,
    //client index of the parent state in the execution graph
    parent: number,
    //is the current state an error state?
    isErrorState: boolean
}

export interface UnhandledViperServerMessageTypeParams {
    msgType: string,
    msg: string,
    logLevel: LogLevel
}

export interface FlushCacheParams {
    uri: string, // nullable (null indicates that the cache for all files should be flushed)
    backend: string // non-null
}

export interface GetIdentifierResponse {
    identifier: string // nullable
}

//Communication between Language Server and Debugger:

export enum StepType { Stay, Next, Back, In, Out, Continue }

export interface LaunchRequestArguments {
    program: string;
    //client state to start debugging in
    startInState: number;
}

//Language Server Internal:

export enum StatementType { EXECUTE, EVAL, CONSUME, PRODUCE, UNKONWN }

////////////////////////////////////////////////////
//SETTINGS
////////////////////////////////////////////////////

export interface ViperSettings {
    //All viperServer related settings
    viperServerSettings: ViperServerSettings;
    //Description of backends
    verificationBackends: Backend[];
    //Used paths
    paths: PathSettings;
    //General user preferences
    preferences: UserPreferences;
    //Java settings
    javaSettings: JavaSettings;
    //Settings for AdvancedFeatures
    advancedFeatures: AdvancedFeatureSettings;
    buildVersion: "Stable" | "Nightly" | "Local";
}

export interface VersionedSettings { v: string; }

export interface ViperServerSettings extends VersionedSettings {
    //Locator to the ViperServer jars
    serverJars: string | string[] | PlatformDependentPath | PlatformDependentListOfPaths;
    //custom commandLine arguments
    customArguments: string;
    //it set to false, cached errors are reused across backends
    backendSpecificCache: boolean;
    //disable the caching mechanism
    disableCaching: boolean;
    //After timeout ms the startup of the viperServer is expected to have failed and thus aborted
    timeout: number;
    //Specifies whether ViperServer should be started by the IDE or whether the IDE should attach to an existing instance of ViperServer. Possible values: "attach", "create". 
    viperServerPolicy: string;
    //Specifies the address part of the URL that ViperServer is running on. 
    viperServerAddress: string;
    //Specifies the port part of the URL that ViperServer is running on. Only needed if viperServerPolicy is set to 'attach'. 
    viperServerPort: number;
}

export interface Backend extends VersionedSettings {
    //The unique name of this backend
    name: string;
    //The type of the backend: "silicon", "carbon", or "other"
    type: string;
    //List of paths locating all used jar files, the files can be addressed directly or via folder, in which case all jar files in the folder are included
    paths: string[];
    //The engine used for verification: "ViperServer", or "none"
    engine: string;
    //After timeout ms the verification is expected to be non terminating and is thus aborted.
    timeout: number;
    //A list of verification stages
    stages: Stage[];
    //the timeout in ms after which stopping a verification is considered failed.
    stoppingTimeout: number;
}

export interface Stage {
    //The per backend unique name of this stage
    name: string;
    //Enable if this stage is describing a verification
    isVerification: boolean;
    //The method to invoke when staring the stage
    mainMethod: string;
    //the commandline arguments for the java engine
    customArguments: string;
    //The name of the stage to start in case of a parsing error
    onParsingError: string;
    //The name of the stage to start in case of a type checking error
    onTypeCheckingError: string;
    //The name of the stage to start in case of a verification error
    onVerificationError: string;
    //The name of the stage to start in case of a success
    onSuccess: string;
}

export interface PathSettings extends VersionedSettings {
    // Path to the folder containing all the ViperTools
    viperToolsPath: string | PlatformDependentPath

    // The path to the z3 executable
    z3Executable: string | PlatformDependentPath

    // The path to the boogie executable
    boogieExecutable: string | PlatformDependentPath

    // The prefix of a directory containing sound effect resources
    sfxPrefix: string | PlatformDependentPath
}

export interface UserPreferences extends VersionedSettings {
    // Verbosity of the output, all output is written to the logFile, regardless of the logLevel
    logLevel: number;
    
    // Reverify the open viper file upon backend change.
    autoVerifyAfterBackendChange: boolean;
    
    // Display the verification progress in the status bar. Only useful if the backend supports progress reporting.
    showProgress: boolean;
    
    // Emit sound effects, indicating reached milestones in a verification process
    enableSoundEffects: boolean; 

    // The URL for downloading the stable ViperTools from
    stableViperToolsProvider: string | PlatformDependentURL;

    // The URL for downloading the nightly ViperTools from
    nightlyViperToolsProvider: string | PlatformDependentURL;
}

export interface JavaSettings extends VersionedSettings {
    // optional path to a Java binary
    javaBinary: string
    //The arguments used for all java invocations
    customArguments: string;
}

export interface AdvancedFeatureSettings extends VersionedSettings {
    //Enable heap visualization, stepwise debugging and execution path visualization
    enabled: boolean;
    //Show the symbolic values in the heap visualization. If disabled, the symbolic values are only shown in the error states.
    showSymbolicState: boolean;
    //To get the best visual heap representation, this setting should match with the active theme.
    darkGraphs: boolean;
    //Useful for verifying programs. Disable when developing the backend
    simpleMode: boolean;
    //Visualize also the oldHeap in the heap preview
    showOldState: boolean;
    //Show the part of the execution tree around the current state in the state visualization
    showPartialExecutionTree: boolean;
    //Maximal buffer size for verification in KB
    verificationBufferSize: number;
    //compare states
    compareStates: boolean;
}

export interface PlatformDependentPath {
    windows?: string;
    mac?: string;
    linux?: string;
}

export interface PlatformDependentListOfPaths {
    windows?: string[];
    mac?: string[];
    linux?: string[];
}

export interface PlatformDependentURL {
    windows?: string;
    mac?: string;
    mac_arm?: string;
    linux?: string;
}

export enum SettingsErrorType { Error, Warning }

export interface SettingsError {
    type: SettingsErrorType;
    msg: string;
}

export interface Progress {
    domain: string;
    current?: number;
    total?: number;
    progress?: number;
    postfix?: string;
}

export interface Versions {
    viperServerSettingsVersion: string;
    verificationBackendsVersion: string;
    pathsVersion: string;
    preferencesVersion: string;
    javaSettingsVersion: string;
    advancedFeaturesVersion: string;
    defaultSettings: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    extensionVersion: string;
}

////////////////////////////////////////////////////
//BACKEND OUTPUT
////////////////////////////////////////////////////

//Format expected from other tools:
//Silicon should provide the verification states in this format
export interface SymbExLogEntry {
    value: string,
    type?: string,
    kind?: string,
    open: boolean,
    pos?: string,
    prestate?: { store: SymbExLogStore[], heap: string[], oldHeap: string[], pcs: string[] },
    children?: SymbExLogEntry[];
}

export interface SymbExLogStore {
    value: string;
    type: string;
}

export class BackendOutputType {
    static Start = "Start";
    static End = "End";
    static VerificationStart = "VerificationStart";
    static MethodVerified = "MethodVerified";
    static FunctionVerified = "FunctionVerified";
    static PredicateVerified = "PredicateVerified";
    static Error = "Error";
    static Outline = "Outline";
    static Definitions = "Definitions";
    static Success = "Success";
    static Stopped = "Stopped";
}

export interface BackendOutput {
    type: string;
    //for ...Verified:
    name?: string;
    //for Start:
    backendType?: string;
    //for VerificationStart:
    nofMethods?: number;
    nofPredicates?: number;
    nofFunctions?: number;
    //for End:
    time?: string;
    //for Error:
    file?: string;
    errors?: Error[];
    //for Outline
    members?: Member[];
    //for Definitions:
    definitions?: IDefinition[];
}

export interface IDefinition {
    type: string;
    name: string;
    location: string;
    scopeStart: string;
    scopeEnd: string;
}

export class Definition {
    type: string;
    name: string;
    location: Range;
    scope: Range;
    constructor(def: IDefinition, location: Range, scope: Range) {
        this.type = def.type;
        this.name = def.name;
        this.location = location
        this.scope = scope;
    }
}

export interface Member {
    type: string;
    name: string;
    location: string;
}

export interface HintMessage {
    message: string,
    showSettingsButton: boolean,
    showViperToolsUpdateButton: boolean
}

export interface VerificationNotStartedParams {
    uri: string
}

export interface Error {
    start: string
    end: string
    tag: string
    message: string
    cached?: boolean
    severity?: number
    source?: string
}

export interface TimingInfo {
    //the total time in seconds
    total: number;
    //the intermediate timings in milliseconds
    timings: number[];
}

export class Common {
    //URI helper Methods
    public static uriToPath(uri: string): string {
        const uriObject: URI = URI.parse(uri);
        const platformIndependentPath = uriObject.fsPath;
        return platformIndependentPath;
    }

    public static uriToString(uri: string | vscode.Uri): string {
        if (!uri) return null;
        if (typeof uri === "string") {
            return uri;
        } else {
            return uri.toString();
        }
    }

    public static uriToObject(uri: string | vscode.Uri): vscode.Uri {
        if (!uri) return null;
        if (typeof uri === "string") {
            return vscode.Uri.parse(uri);
        } else {
            return uri;
        }
    }

    public static pathToUri(path: string): string {
        const uriObject: URI = URI.file(path);
        const platformIndependentUri = uriObject.toString();
        return platformIndependentUri;
    }

    public static uriEquals(a: string | vscode.Uri, b: string | vscode.Uri): boolean {
        if (!a || !b) return false;
        return this.uriToString(a) === this.uriToString(b);
    }

    //Helper methods for child processes
    public static executer(command: string, onData?: (string) => void, 
                           onError?: (string) => void, onExit?: () => void): child_process.ChildProcess {
        try {
            Log.logWithOrigin("executer", command, LogLevel.Debug);
            const child: child_process.ChildProcess = child_process.exec(command, function (error, stdout, stderr) {
                Log.logWithOrigin('executer:stdout', stdout, LogLevel.LowLevelDebug);
                Log.logWithOrigin('executer:stderr', stderr, LogLevel.LowLevelDebug);
                if (error) Log.logWithOrigin('executer:error', `${error}`, LogLevel.LowLevelDebug);
                if (onData) onData(stdout);
                if (onError) onError(stderr);
                if (onExit) {
                    Log.logWithOrigin('executer', 'done', LogLevel.LowLevelDebug);
                    onExit();
                }
            });
            return child;
        } catch (e) {
            Log.error("Error executing " + command + ": " + e);
        }
    }

    public static executor(command: string, callback: () => void): void {
        Log.log("executer: " + command, LogLevel.Debug);
        child_process.exec(command, (error, stdout, stderr) => {
            Log.logWithOrigin('stdout', stdout, LogLevel.LowLevelDebug);
            Log.logWithOrigin('stderr', stderr, LogLevel.LowLevelDebug);
            if (error) {
                Log.error('executer error: ' + error);
            }
            callback();
        });
    }

    public static spawner(command: string, args: string[]): child_process.ChildProcess {
        Log.log("spawner: " + command + " " + args.join(" "), LogLevel.Debug);
        try {
            const child = child_process.spawn(command, args, { detached: true });
            child.on('stdout', data => {
                Log.logWithOrigin('spawner stdout', data, LogLevel.LowLevelDebug);
            });
            child.on('stderr', data => {
                Log.logWithOrigin('spawner stderr', data, LogLevel.LowLevelDebug);
            });
            child.on('exit', data => {
                Log.log('spawner done: ' + data, LogLevel.LowLevelDebug);
            });
            return child;
        } catch (e) {
            Log.error("Error spawning command: " + e);
        }
    }

    public static spawn(
        cmd: string, 
        args?: string[] | undefined, 
        options?: child_process.SpawnOptionsWithoutStdio | undefined
      ): Promise<Output> {
        const prettifiedCmd = `${cmd} ${args ? args.join(' ') : ''}`;
        Log.log(`Viper-IDE/server: Running '${prettifiedCmd}'`, LogLevel.Debug);
        return new Promise((resolve, reject) => {
          let stdout = '';
          let stderr = '';
    
          const proc = child_process.spawn(cmd, args, options);
    
          proc.stdout.on('data', (data) => stdout += data);
          proc.stderr.on('data', (data) => stderr += data);
          proc.on('close', (code, signal) => {
            Log.log("┌──── Begin stdout ────┐", LogLevel.Debug);
            Log.log(stdout, LogLevel.Debug);
            Log.log("└──── End stdout ──────┘", LogLevel.Debug);
            Log.log("┌──── Begin stderr ────┐", LogLevel.Debug);
            Log.log(stderr, LogLevel.Debug);
            Log.log("└──── End stderr ──────┘", LogLevel.Debug);
            if (code != null && code === 0) {
                resolve({ stdout, stderr });
            } else if (code != null) {
                reject(new Error(`Running '${prettifiedCmd}' resulted in the non-zero exit code ${code}`));
            } else {
                reject(new Error(`Running '${prettifiedCmd}' resulted in the non-zero exit code because the process got terminated by signal '${signal}'`));
            }
          });
          proc.on('error', (err) => {
            Log.log("┌──── Begin stdout ────┐", LogLevel.Debug);
            Log.log(stdout, LogLevel.Debug);
            Log.log("└──── End stdout ──────┘", LogLevel.Debug);
            Log.log("┌──── Begin stderr ────┐", LogLevel.Debug);
            Log.log(stderr, LogLevel.Debug);
            Log.log("└──── End stderr ──────┘", LogLevel.Debug);
            Log.log(`Error: ${err}`, LogLevel.Debug);
            reject(err);
          });
        });
      }

    public static backendRestartNeeded(settings: ViperSettings, oldBackendName: string, newBackendName: string): boolean {
        if (!settings) {
            return true;
        }

        const oldBackend = settings.verificationBackends.find(value => value.name === oldBackendName);
        const newBackend = settings.verificationBackends.find(value => value.name === newBackendName);

        if (oldBackend && newBackend && oldBackend.engine.toLowerCase() === 'viperserver' && newBackend.engine.toLowerCase() == 'viperserver') {
            return false;
        }
        return true;
    }

    public static isViperServer(settings: ViperSettings, newBackendName: string): boolean {
        if (!settings) {
            return false;
        }

        const newBackend = settings.verificationBackends.find(value => value.name === newBackendName);

        if (newBackend && newBackend.engine.toLowerCase() === 'viperserver') {
            return true;
        }
        return false;
    }

    public static comparePosition(a: Position, b: Position): number {
        if (!a && !b) return 0;
        if (!a) return -1;
        if (!b) return 1;
        if (a.line < b.line || (a.line === b.line && a.character < b.character)) {
            return -1;
        } else if (a.line === b.line && a.character === b.character) {
            return 0;
        } else {
            return 1;
        }
    }
}

export interface Output {
    stdout: string;
    stderr: string;
}
