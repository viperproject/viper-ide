//Global interfaces:

//These commands are used to distinguish the different message types
export class Commands {
    //Server notifies client about invalid settings
    static InvalidSettings = { method: "InvalidSettings" };
    //Server asks client to transform a uri to a file path
    static UriToPath = { method: "UriToPath" };
    //Server asks client to transform a file path to a uri
    static PathToUri = { method: "PathToUri" };

    static SelectBackend = { method: "SelectBackend" };
    //Client asks server for the list of backend names
    static RequestBackendNames = { method: "RequestBackendNames" };
    //Server notifies client about a state change
    static StateChange = { method: "StateChange" };
    //Client tells server to dispose itself
    static Dispose = { method: "Dispose" };
    //Client requests verification for a file
    static Verify = { method: "Verify" };
    //Used for logging
    static Log = { method: "Log" };
    static Error = { method: "Error" };
    static ToLogFile = { method: "ToLogFile" };
    //Server tells client to show an information message to the user
    static Hint = { method: "Hint" };
    //Client tells server to abort the running verification
    static StopVerification = { method: "StopVerification" };
    //Server informs client about ongoing backend change
    static BackendChange = { method: "BackendChange" };

    static StepsAsDecorationOptions = { method: "StepsAsDecorationOptions" };
    static ShowHeap = { method: "ShowHeap" };
    static HeapGraph = { method: "HeapGraph" };
    static StateSelected = { method: "StateSelected" };
    //Server is informing client about opened file
    static FileOpened = { method: "FileOpened" };
    //Server is informing client about closed file
    static FileClosed = { method: "FileClosed" };
    //Server is notifying client that the verification could not be started
    static VerificationNotStarted = { method: "VerificationNotStarted" };
    //Either server or client request debugging to be stopped
    static StopDebugging = { method: "StopDebugging" };
    //Server informs client about started backend
    static BackendReady = { method: "BackendReady" };
    //Client tells Server to start backends
    static StartBackend = { method: "StartBackend" };
    //Request a list of all states that led to the current state
    static GetExecutionTrace = { method: "GetExecutionTrace" };
    //Request the path to the dot executable from the language server
    static GetDotExecutable = { method: "GetDotExecutable" };
    //The language server requests what version is required for the settings
    static RequestRequiredVersion = { method: "RequestRequiredVersion" };
}

//Communication between Language Client and Language Server:

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
    Error = 6
}

export interface StateChangeParams {
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
    error?: string;
}

export interface BackendReadyParams {
    //name of the backend ready to use
    name: string;
    //should the open file be reverified
    restarted: boolean;
}

export interface VerifyRequest {
    //file to verify
    uri: string,
    //was the verification triggered manually
    manuallyTriggered: boolean,
    //the path to the open workspace folder
    workspace: string
}

export interface ShowHeapParams {
    //file to show heap params of
    uri: string,
    //the index of the state to show
    //the client index does only take the states with a position into account
    clientIndex: number
}

export interface HeapGraph {
    //dot representation of heap
    heap: string,
    //dot representation of the old heap
    oldHeap: string,
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

//own Position interface, because vscode.Position is not available at Language Server
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
    };
    //previously selected state
    static previousState(dark: boolean): string {
        return dark ? "green" : "green";
    };
    //state in which an error was reported by the backend
    static errorState(dark: boolean): string {
        return dark ? "yellow" : "orange";
    };
    //state in same method as current state
    static interestingState(dark: boolean): string {
        return dark ? "yellow" : "orange";
    };
    //state in other method
    static uninterestingState(dark: boolean): string {
        return dark ? "grey" : "grey";
    };
}

export interface StepsAsDecorationOptionsResult {
    //decoration options to be shown in the source code
    decorationOptions: MyProtocolDecorationOptions[],
    //info that relates to all states
    globalInfo: string
    //file under verification
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

//Communication between Language Server and Debugger:

export enum StepType { Stay, Next, Back, In, Out, Continue }

export interface LaunchRequestArguments {
    program: string;
    //client state to start debugging in
    startInState: number;
}

//Language Server Internal:

export enum StatementType { EXECUTE, EVAL, CONSUME, PRODUCE, UNKONWN };

////////////////////////////////////////////////////
//SETTINGS
////////////////////////////////////////////////////

export interface ViperSettings {
    //All nailgun related settings
    nailgunSettings: NailgunSettings;
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
}

export interface VersionedSettings { v: string; }

export interface NailgunSettings extends VersionedSettings {
    //The path to the nailgun server jar.
    serverJar: string;
    //The path to the nailgun client executable 
    clientExecutable: string | PlatformDependentPath;
    //The port used for the communication between nailgun client and server
    port: string;
    //After timeout ms the startup of the nailgun server is expected to have failed and thus aborted
    timeout: number;
}

export interface Backend extends VersionedSettings {
    //The unique name of this backend
    name: string;
    //List of paths locating all used jar files, the files can be addressed directly or via folder, in which case all jar files in the folder are included
    paths: string[];
    //Enable to run the backend through nailgun, speeding up the process by reusing the same Java Virtual Machine
    useNailgun: boolean;
    //After timeout ms the verification is expected to be non terminating and is thus aborted.
    timeout: number;
    //A list of verification stages
    stages: Stage[];
}

export interface Stage {
    //The per backend unique name of this stage
    name: string;
    //Enable if this stage is describing a verification
    isVerification: boolean;
    //The method to invoke when staring the stage
    mainMethod: string;
    //the commandline arguments for the nailgun client (or java, when useNailgun is disabled)
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
    //Path to the folder containing all the ViperTools
    viperToolsPath: PlatformDependentPath;
    //The path to the z3 executable
    z3Executable: string | PlatformDependentPath;
    //The path to the boogie executable
    boogieExecutable: string | PlatformDependentPath;
    //The path to the dot executable.
    dotExecutable: string;
}

export interface UserPreferences extends VersionedSettings {
    //Enable automatically saving modified viper files
    autoSave: boolean;
    //Verbosity of the output, all output is written to the logFile, regardless of the logLevel
    logLevel: number;
    //Reverify the open viper file upon backend change.
    autoVerifyAfterBackendChange: boolean;
    //Display the verification progress in the status bar. Only useful if the backend supports progress reporting.
    showProgress: boolean;
}

export interface JavaSettings extends VersionedSettings {
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
    //Maximal buffer size for verification in KB
    verificationBufferSize: number;
}

export interface PlatformDependentPath {
    windows?: string;
    mac?: string;
    linux?: string;
}

export enum SettingsErrorType { Error, Warning }

export interface SettingsError {
    type: SettingsErrorType;
    msg: string;
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
}

export interface BackendOutput {
    type: string,
    //for ...Verified:
    name?: string,
    //for Start:
    backendType?: string,
    //for VerificationStart:
    nofMethods?: number,
    nofPredicates?: number,
    nofFunctions?: number,
    //for End:
    time?: string,
    //for Error:
    file?: string,
    errors?: Error[]
}

export interface Error {
    start: string,
    end: string,
    tag?: string,
    message: string
}