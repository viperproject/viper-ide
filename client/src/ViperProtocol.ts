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
}

export enum Success {
    None = 0,
    Success = 1,
    ParsingFailed = 2,
    TypecheckingFailed = 3,
    VerificationFailed = 4,
    Aborted = 5,
    Error = 6
}

export interface UpdateStatusBarParams {
    newState: VerificationState;
    progress?;
    success?: Success;
    firstTime?: boolean;
    manuallyTriggered?: boolean;
    filename?: string;
    backendName?: string;
    time?: number;
    nofErrors?: number;
    verificationNeeded?: boolean;
}

export interface VerifyRequest {
    uri: string,
    manuallyTriggered: boolean,
    workspace: string
}

export interface ViperSettings {
    verificationBackends: [Backend];
    nailgunServerJar: string;
    nailgunClient: string;
    z3Executable: string;
    valid: boolean;
    autoSave: boolean;
    nailgunPort: string;
    logLevel: number;
    autoVerifyAfterBackendChange: boolean;
    showProgress: boolean;
}

export interface Backend {
    name: string;
    paths: [string];
    mainMethod: string;
    getTrace: boolean;
    customArguments: string;
}