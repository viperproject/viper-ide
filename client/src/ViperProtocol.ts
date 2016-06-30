export enum VerificationState {
    Stopped = 0,
    Starting = 1,
    VerificationRunning = 2,
    VerificationPrintingHelp = 3,
    VerificationReporting = 4,
    Ready = 6,
    Stopping = 7
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

export interface UpdateStatusBarParams {
    newState: VerificationState;
    progress?;
    success?;
    firstTime?:boolean;
    manuallyTriggered?:boolean;
    filename?:string;
}

export interface VerifyRequest{
    uri:string,
    manuallyTriggered:boolean
}

export interface ViperSettings {
    verificationBackends: [Backend];
    nailgunServerJar: string;
    nailgunClient: string;
    z3Executable: string;
    valid: boolean;
    writeRawOutputToLogFile: boolean;
    autoSave:boolean;
}

export interface Backend {
    name: string;
    paths: [string];
    mainMethod: string;
    getTrace: boolean;
}