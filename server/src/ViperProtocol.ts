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

export enum StatementType { EXECUTE, EVAL, CONSUME, PRODUCE, UNKONWN };

export class Commands {
    static InvalidSettings = { method: "InvalidSettings" };
    static Hint = { method: "Hint" };
    static UriToPath = { method: "UriToPath" };
    static PathToUri = { method: "PathToUri" };
    static SelectBackend = { method: "SelectBackend" };
    static AskUserToSelectBackend = { method: "AskUserToSelectBackend" };
    static RequestBackendNames = { method: "RequestBackendNames" };
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
    static VerificationNotStarted = { method: "VerificationNotStarted" };
    static StopDebugging = { method: "StopDebugging" };
    static BackendStarted = { method: "BackendStarted" };
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
    uri?: string;
    stage?: string;
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
    stages: Stage[];
    paths: string[];
}

export interface Stage {
    name: string;
    isVerification: boolean;
    mainMethod: string;
    customArguments: string;
    onParsingError: string;
    onTypeCheckingError: string;
    onVerificationError: string;
    onSuccess: string;
}

export interface ShowHeapParams {
    uri: string,
    clientIndex: number
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
    static currentState(dark: boolean): string {
        return dark ? "red" : "red";
    };
    static previousState(dark: boolean): string {
        return dark ? "green" : "green";
    };
    static errorState(dark: boolean): string {
        return dark ? "yellow" : "orange";
    };
    static interestingState(dark: boolean): string {
        return dark ? "yellow" : "orange";
    };
    static uninterestingState(dark: boolean): string {
        return dark ? "grey" : "grey";
    };
}

export interface StepInfo {
    originalPosition: Position,
    depth: number,
    methodIndex: number,
    index: number,
    isErrorState: boolean
}

export interface StepsAsDecorationOptionsResult {
    decorationOptions: MyProtocolDecorationOptions[],
    globalInfo: string
    uri: string;
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
    numberToDisplay: number;
    originalPosition: Position;
    depth: number,
    methodIndex: number,
    index: number,
    isErrorState: boolean
}

export interface Range {
    start: Position,
    end: Position
}

export interface LaunchRequestArguments {
    program: string;
    startInState: number;
}