//Global interfaces:
"use strict";
//These commands are used to distinguish the different message types
class Commands {
}
//SERVER TO CLIENT
//Server notifies client about the result of the settings check
Commands.SettingsChecked = { method: "SettingsChecked" }; //SettingsCheckedParams
//Server asks client to transform a uri to a file path
Commands.UriToPath = { method: "UriToPath" }; //uri: string
//Server asks client to transform a file path to a uri
Commands.PathToUri = { method: "PathToUri" }; //path: string
//The language server requests what version is required for the settings
Commands.RequestRequiredVersion = { method: "RequestRequiredVersion" }; //void -> requiredVersionString: string
//Server notifies client about a state change
Commands.StateChange = { method: "StateChange" }; //StateChangeParams
//LOGGING
//Log a message to the output
Commands.Log = { method: "Log" }; //LogParams
//Log an error message to the output
Commands.Error = { method: "Error" }; //LogParams
//Log a message to the log file
Commands.ToLogFile = { method: "ToLogFile" }; //LogParams
//Server tells client to show an information message to the user
Commands.Hint = { method: "Hint" }; //message: string
//Server informs client about ongoing backend change
Commands.BackendChange = { method: "BackendChange" }; //name: string
//Server is informing client about opened file
Commands.FileOpened = { method: "FileOpened" }; //uri: string
//Server is informing client about closed file
Commands.FileClosed = { method: "FileClosed" }; //uri: string
//Server is notifying client that the verification could not be started
Commands.VerificationNotStarted = { method: "VerificationNotStarted" }; //uri: string
//Either server or client request debugging to be stopped
Commands.StopDebugging = { method: "StopDebugging" }; //void
//Server informs client about started backend
Commands.BackendReady = { method: "BackendReady" }; //BackendReadyParams
Commands.StepsAsDecorationOptions = { method: "StepsAsDecorationOptions" }; //StepsAsDecorationOptionsResult
Commands.HeapGraph = { method: "HeapGraph" }; //HeapGraph
//static StateSelected = { method: "StateSelected" };
//CLIENT TO SERVER
//static SelectBackend = { method: "SelectBackend" };
//Client asks server for the list of backend names
Commands.RequestBackendNames = { method: "RequestBackendNames" }; //void
//Client tells server to dispose itself
Commands.Dispose = { method: "Dispose" }; //void
//Client requests verification for a file
Commands.Verify = { method: "Verify" }; //VerifyParams
//Client tells server to abort the running verification
Commands.StopVerification = { method: "StopVerification" }; //filePath:string
Commands.ShowHeap = { method: "ShowHeap" }; //ShowHeapParams
//Client tells Server to start backends
Commands.StartBackend = { method: "StartBackend" }; //backendName:string
//Request a list of all states that led to the current state
Commands.GetExecutionTrace = { method: "GetExecutionTrace" }; //GetExecutionTraceParams -> trace:ExecutionTrace[]
//Request the path to the dot executable from the language server
Commands.GetDotExecutable = { method: "GetDotExecutable" }; //void -> dotExecutable:string
exports.Commands = Commands;
(function (VerificationState) {
    VerificationState[VerificationState["Stopped"] = 0] = "Stopped";
    VerificationState[VerificationState["Starting"] = 1] = "Starting";
    VerificationState[VerificationState["VerificationRunning"] = 2] = "VerificationRunning";
    VerificationState[VerificationState["VerificationPrintingHelp"] = 3] = "VerificationPrintingHelp";
    VerificationState[VerificationState["VerificationReporting"] = 4] = "VerificationReporting";
    VerificationState[VerificationState["PostProcessing"] = 5] = "PostProcessing";
    VerificationState[VerificationState["Ready"] = 6] = "Ready";
    VerificationState[VerificationState["Stopping"] = 7] = "Stopping";
    VerificationState[VerificationState["Stage"] = 8] = "Stage";
})(exports.VerificationState || (exports.VerificationState = {}));
var VerificationState = exports.VerificationState;
(function (LogLevel) {
    //No output
    LogLevel[LogLevel["None"] = 0] = "None";
    //Only verification specific output
    LogLevel[LogLevel["Default"] = 1] = "Default";
    //Some info about internal state, critical errors
    LogLevel[LogLevel["Info"] = 2] = "Info";
    //More info about internal state
    LogLevel[LogLevel["Verbose"] = 3] = "Verbose";
    //Detailed information about internal state, non critical errors
    LogLevel[LogLevel["Debug"] = 4] = "Debug";
    //all output of used tools is written to logFile,
    //some of it also to the console
    LogLevel[LogLevel["LowLevelDebug"] = 5] = "LowLevelDebug";
})(exports.LogLevel || (exports.LogLevel = {}));
var LogLevel = exports.LogLevel;
//Verification Success
(function (Success) {
    //Used for initialization
    Success[Success["None"] = 0] = "None";
    Success[Success["Success"] = 1] = "Success";
    Success[Success["ParsingFailed"] = 2] = "ParsingFailed";
    Success[Success["TypecheckingFailed"] = 3] = "TypecheckingFailed";
    Success[Success["VerificationFailed"] = 4] = "VerificationFailed";
    //Manually aborted verification
    Success[Success["Aborted"] = 5] = "Aborted";
    //Caused by internal error
    Success[Success["Error"] = 6] = "Error";
})(exports.Success || (exports.Success = {}));
var Success = exports.Success;
//colors of states shown in the source code during debugging for both viper light and viper dark theme
class StateColors {
    //currently selected state
    static currentState(dark) {
        return dark ? "red" : "red";
    }
    ;
    //previously selected state
    static previousState(dark) {
        return dark ? "green" : "green";
    }
    ;
    //state in which an error was reported by the backend
    static errorState(dark) {
        return dark ? "yellow" : "orange";
    }
    ;
    //state in same method as current state
    static interestingState(dark) {
        return dark ? "yellow" : "orange";
    }
    ;
    //state in other method
    static uninterestingState(dark) {
        return dark ? "grey" : "grey";
    }
    ;
}
exports.StateColors = StateColors;
//Communication between Language Server and Debugger:
(function (StepType) {
    StepType[StepType["Stay"] = 0] = "Stay";
    StepType[StepType["Next"] = 1] = "Next";
    StepType[StepType["Back"] = 2] = "Back";
    StepType[StepType["In"] = 3] = "In";
    StepType[StepType["Out"] = 4] = "Out";
    StepType[StepType["Continue"] = 5] = "Continue";
})(exports.StepType || (exports.StepType = {}));
var StepType = exports.StepType;
//Language Server Internal:
(function (StatementType) {
    StatementType[StatementType["EXECUTE"] = 0] = "EXECUTE";
    StatementType[StatementType["EVAL"] = 1] = "EVAL";
    StatementType[StatementType["CONSUME"] = 2] = "CONSUME";
    StatementType[StatementType["PRODUCE"] = 3] = "PRODUCE";
    StatementType[StatementType["UNKONWN"] = 4] = "UNKONWN";
})(exports.StatementType || (exports.StatementType = {}));
var StatementType = exports.StatementType;
;
(function (SettingsErrorType) {
    SettingsErrorType[SettingsErrorType["Error"] = 0] = "Error";
    SettingsErrorType[SettingsErrorType["Warning"] = 1] = "Warning";
})(exports.SettingsErrorType || (exports.SettingsErrorType = {}));
var SettingsErrorType = exports.SettingsErrorType;
class BackendOutputType {
}
BackendOutputType.Start = "Start";
BackendOutputType.End = "End";
BackendOutputType.VerificationStart = "VerificationStart";
BackendOutputType.MethodVerified = "MethodVerified";
BackendOutputType.FunctionVerified = "FunctionVerified";
BackendOutputType.PredicateVerified = "PredicateVerified";
BackendOutputType.Error = "Error";
BackendOutputType.Success = "Success";
exports.BackendOutputType = BackendOutputType;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJQcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmlwZXJQcm90b2NvbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxvQkFBb0I7O0FBRXBCLG9FQUFvRTtBQUNwRTtBQXNEQSxDQUFDO0FBckRHLGtCQUFrQjtBQUNsQiwrREFBK0Q7QUFDeEQsd0JBQWUsR0FBRyxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsRUFBRSxDQUFDLENBQUEsdUJBQXVCO0FBQzlFLHNEQUFzRDtBQUMvQyxrQkFBUyxHQUFHLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUEsYUFBYTtBQUN4RCxzREFBc0Q7QUFDL0Msa0JBQVMsR0FBRyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFBLGNBQWM7QUFDekQsd0VBQXdFO0FBQ2pFLCtCQUFzQixHQUFHLEVBQUUsTUFBTSxFQUFFLHdCQUF3QixFQUFFLENBQUMsQ0FBQSx1Q0FBdUM7QUFDNUcsNkNBQTZDO0FBQ3RDLG9CQUFXLEdBQUcsRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLENBQUMsQ0FBQSxtQkFBbUI7QUFDbEUsU0FBUztBQUNULDZCQUE2QjtBQUN0QixZQUFHLEdBQUcsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQSxXQUFXO0FBQzFDLG9DQUFvQztBQUM3QixjQUFLLEdBQUcsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQSxXQUFXO0FBQzlDLCtCQUErQjtBQUN4QixrQkFBUyxHQUFHLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUEsV0FBVztBQUN0RCxnRUFBZ0U7QUFDekQsYUFBSSxHQUFHLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUEsaUJBQWlCO0FBQ2xELG9EQUFvRDtBQUM3QyxzQkFBYSxHQUFHLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUEsY0FB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