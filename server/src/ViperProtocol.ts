export enum VerificationState {
    Stopped = 0,
    Starting = 1,
    VerificationRunning = 2,
    VerificationPrintingHelp = 3,
    VerificationReporting = 4,
    Ready = 6,
    Stopping = 7
}

export enum LogLevel {
    None = 0,
    Default = 1,
    Info = 2,
    Verbose = 3,
    Debug = 4,
    LowLevelDebug = 5
}

export enum StepType { Stay, Next, Back, In, Out, Continue }

export enum Success {
    None = 0,
    Success = 1,
    ParsingFailed = 2,
    TypecheckingFailed = 3,
    VerificationFailed = 4,
    Aborted = 5,
    Error = 6
}

export class Commands {
    static InvalidSettings = { method: "InvalidSettings" };
    static Hint = { method: "Hint" };
    static UriToPath = { method: "UriToPath" };
    static PathToUri = { method: "PathToUri" };
    static SelectBackend = { method: "SelectBackend" };
    static AskUserToSelectBackend = { method: "AskUserToSelectBackend" };
    static RequestBackendSelection = { method: "RequestBackendSelection" };
    static StateChange = { method: "StateChange" };
    static Dispose = { method: "Dispose" };
    static Verify = { method: "Verify" };
    static Log = { method: "Log" };
    static Error = { method: "Error" };
    static StopVerification = { method: "StopVerification" };
    static ToLogFile = { method: "ToLogFile" };
    static BackendChange = { method: "BackendChange" };
    static StepsAsDecorationOptions = { method: "StepsAsDecorationOptions" };
    static ShowHeap = { method: "ShowHeap" };
    static HeapGraph = { method: "HeapGraph" };
    static StateSelected = { method: "StateSelected" };
    static FileOpened = { method: "FileOpened" };
    static FileClosed = { method: "FileClosed" };
}

export interface UpdateStatusBarParams {
    newState: VerificationState;
    progress?;
    success?: Success;
    verificationCompleted?: boolean;
    manuallyTriggered?: boolean;
    filename?: string;
    backendName?: string;
    time?: number;
    nofErrors?: number;
    verificationNeeded?: boolean;
    uri?:string;
}

export interface VerifyRequest {
    uri: string,
    manuallyTriggered: boolean,
    workspace: string
}

export interface ViperSettings {
    verificationBackends: Backend[];
    nailgunServerJar: string;
    nailgunClient: string;
    z3Executable: string;
    valid: boolean;
    autoSave: boolean;
    nailgunPort: string;
    logLevel: number;
    autoVerifyAfterBackendChange: boolean;
    showProgress: boolean;
    dotExecutable: string;
    showSymbolicState: boolean;
    darkGraphs: boolean;
}

export interface Backend {
    name: string;
    paths: string[];
    mainMethod: string;
    getTrace: boolean;
    customArguments: string;
}

export interface ShowHeapParams {
    uri: string,
    index: number
}

export interface HeapGraph {
    heap: string,
    state: number,
    fileName: string,
    fileUri: string,
    position: Position,
    stateInfos: string,
    methodName: string,
    methodType: string,
    methodOffset: number,
    conditions: string[]
}

export interface Position {
    line: number;
    character: number;
}

export interface MethodBorder {
    name: string,
    methodType: string,
    methodName: string,
    firstStateIndex: number,
    lastStateIndex: number,
    start: number,
    end: number
}

export class StateColors {
    static currentState = "red";
    static previousState = "green";
    static errorState = "yellow";
    static interestingState = "yellow";
    static uninterestingState = "grey";
}

export interface StepInfo {
    originalPosition: Position,
    depth: number,
    methodIndex: number,
    index: number,
    isErrorState: boolean
}

export interface ViperFileState {
    verified: boolean;
    verifying: boolean;
    open: boolean;
    changed: boolean;
    needsVerification: boolean;
    decorationsShown: boolean;
}