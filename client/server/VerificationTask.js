'use strict';
const Settings_1 = require('./Settings');
const ViperProtocol_1 = require('./ViperProtocol');
const Log_1 = require('./Log');
const Model_1 = require('./Model');
const pathHelper = require('path');
const HeapVisualizer_1 = require('./HeapVisualizer');
const TotalProgress_1 = require('./TotalProgress');
const ServerClass_1 = require('./ServerClass');
const DebugServer_1 = require('./DebugServer');
const fs = require('fs');
const Verifiable_1 = require('./Verifiable');
class VerificationTask {
    constructor(fileUri, nailgunService) {
        this.verificationCount = 0;
        this.lastSuccess = ViperProtocol_1.Success.None;
        this.internalErrorMessage = "";
        //state specific to one verification
        this.running = false;
        this.aborting = false;
        this.state = ViperProtocol_1.VerificationState.Stopped;
        //working variables
        this.lines = [];
        this.wrongFormat = false;
        this.partialData = "";
        //verification results
        this.time = 0;
        this.model = new Model_1.Model();
        this.parsingCompleted = false;
        this.typeCheckingCompleted = false;
        this.symbExLog = [];
        this.fileUri = fileUri;
        this.nailgunService = nailgunService;
    }
    getHeapGraphDescription(clientIndex, isHeapNeeded) {
        //convert client index to server index
        let serverIndex = this.clientStepIndexToServerStep[clientIndex].index;
        if (!this.steps) {
            Log_1.Log.error("Cannot show heap: no steps avaliable, a reverification is needed.");
        }
        if (serverIndex < 0 || serverIndex >= this.steps.length) {
            Log_1.Log.error("Cannot show heap at step " + clientIndex + " only states 0 - " + (this.clientStepIndexToServerStep.length - 1) + " are valid");
            return;
        }
        let step = this.steps[serverIndex];
        if (!step) {
            Log_1.Log.error("Cannot show heap at step " + clientIndex + " step is null");
            return;
        }
        //inform debug server about selected State
        DebugServer_1.DebugServer.moveDebuggerToPos(step.position, clientIndex);
        return isHeapNeeded ? {
            heap: HeapVisualizer_1.HeapVisualizer.heapToDotUsingOwnDotGraph(step, false, Settings_1.Settings.settings.advancedFeatures.showSymbolicState, step.isErrorState, this.model),
            oldHeap: HeapVisualizer_1.HeapVisualizer.heapToDotUsingOwnDotGraph(step, true, Settings_1.Settings.settings.advancedFeatures.showSymbolicState, step.isErrorState, this.model),
            partialExecutionTree: HeapVisualizer_1.HeapVisualizer.executionTreeAroundStateToDot(step),
            state: step.decorationOptions.index,
            fileName: this.filename,
            fileUri: this.fileUri,
            position: step.position,
            stateInfos: (this.steps[serverIndex].isErrorState ? "Error State -> use the Counter Example\n" : "") + step.pretty(),
            methodName: step.verifiable.name,
            methodType: step.verifiable.typeString(),
            methodOffset: step.verifiable.startIndex - 1,
            conditions: step.prettyConditions()
        } : null;
    }
    prettySteps() {
        try {
            let res = "";
            let methodIndex = -1;
            let currentMethodOffset = -1;
            let maxLine = 0;
            let indent = "";
            let allBordersPrinted = false;
            let currentMethod;
            let numberOfClientSteps = 0;
            this.steps.forEach((element, i) => {
                let clientNumber = element.decorationOptions ? "" + element.decorationOptions.numberToDisplay : "";
                if (element.canBeShownAsDecoration) {
                    numberOfClientSteps++;
                }
                let parent = element.getClientParent();
                if (parent && element.decorationOptions) {
                    clientNumber += " " + parent.decorationOptions.numberToDisplay;
                }
                let serverNumber = "" + i;
                let spacesToPut = 8 - clientNumber.length - serverNumber.length;
                spacesToPut = spacesToPut < 0 ? 0 : spacesToPut;
                res += `\n\t${clientNumber} ${"\t".repeat(spacesToPut)}(${serverNumber})|${"\t".repeat(element.depthLevel())} ${element.firstLine()}`;
            });
            res += '\nNumberOfClientSteps: ' + numberOfClientSteps;
            //Log.log("Steps:\n" + res, LogLevel.LowLevelDebug);
            return res;
        }
        catch (e) {
            Log_1.Log.error("Runtime Error in Pretty Steps: " + e);
        }
    }
    comparePositionAndIndex(a, b) {
        if (!a && !b)
            return 0;
        if (!a)
            return -1;
        if (!b)
            return 1;
        if (a.position.line < b.position.line || (a.position.line === b.position.line && a.position.character < b.position.character)) {
            return -1;
        }
        else if (a.position.line === b.position.line && a.position.character === b.position.character) {
            return (a.index < b.index) ? -1 : 1;
        }
        else {
            return 1;
        }
    }
    comparePosition(a, b) {
        if (!a && !b)
            return 0;
        if (!a)
            return -1;
        if (!b)
            return 1;
        if (a.line < b.line || (a.line === b.line && a.character < b.character)) {
            return -1;
        }
        else if (a.line === b.line && a.character === b.character) {
            return 0;
        }
        else {
            return 1;
        }
    }
    compareByIndex(a, b) {
        if (!a && !b)
            return 0;
        if (!a)
            return -1;
        if (!b)
            return 1;
        if (a.index < b.index) {
            return -1;
        }
        else if (a.index === b.index) {
            return 0;
        }
        else {
            return 1;
        }
    }
    getDecorationOptions() {
        try {
            let decorationOptions = [];
            let count = 0;
            this.steps.forEach((step) => {
                //is it Top level Statement?
                if (step.verifiable.root === step) {
                    count = 1;
                }
                if (step.canBeShownAsDecoration) {
                    let parent = step.getClientParent();
                    let options = {
                        hoverMessage: (step.kind ? step.kind + ": " : "") + ViperProtocol_1.StatementType[step.type] + " " + step.formula,
                        range: {
                            start: { line: step.position.line, character: 0 },
                            end: { line: step.position.line, character: 0 }
                        },
                        renderOptions: {
                            before: {
                                contentText: "" /*"(" + (decorationOptions.length + 1) + ")"*/,
                                color: step.isErrorState ? ViperProtocol_1.StateColors.errorState(Settings_1.Settings.settings.advancedFeatures.darkGraphs) : ViperProtocol_1.StateColors.interestingState(Settings_1.Settings.settings.advancedFeatures.darkGraphs),
                            }
                        },
                        index: decorationOptions.length,
                        parent: parent ? parent.decorationOptions.index : -1,
                        numberToDisplay: count++,
                        originalPosition: step.position,
                        depth: step.depthLevel(),
                        methodIndex: step.verifiable.index,
                        isErrorState: step.isErrorState,
                    };
                    decorationOptions.push(options);
                    this.clientStepIndexToServerStep.push(step);
                    //add decorationOptions to step
                    step.decorationOptions = options;
                }
            });
            let optionsInLine = -1;
            let line = 0;
            this.stateIndicesOrderedByPosition.forEach(idx => {
                let step = this.steps[idx.index];
                if (step.canBeShownAsDecoration) {
                    if (step.position.line === line) {
                        optionsInLine++;
                    }
                    else {
                        line = step.position.line;
                        optionsInLine = 0;
                    }
                    step.decorationOptions.range.start.character = step.position.character + optionsInLine + 1;
                    step.decorationOptions.range.end.character = step.position.character + optionsInLine + 2;
                }
            });
            let model = this.model.pretty();
            return {
                decorationOptions: decorationOptions,
                globalInfo: this.prettySteps() + "\n" + (model ? model : "no model"),
                uri: this.fileUri
            };
        }
        catch (e) {
            Log_1.Log.error("Error getting decoration options: " + e);
        }
    }
    prepareVerification() {
        this.running = true;
        this.aborting = false;
        this.state = ViperProtocol_1.VerificationState.Stopped;
        this.lines = [];
        this.wrongFormat = false;
        if (this.partialData.length > 0) {
            Log_1.Log.error("Some unparsed output was detected:\n" + this.partialData);
            this.partialData = "";
        }
        this.time = 0;
        this.resetDiagnostics();
        this.steps = [];
        this.verifiables = [];
        this.model = new Model_1.Model();
        this.parsingCompleted = true;
        this.typeCheckingCompleted = true;
        this.clientStepIndexToServerStep = [];
        this.symbExLog = [];
        this.stateIndicesOrderedByPosition = [];
        this.internalErrorMessage = "";
    }
    verify(manuallyTriggered) {
        //Initialization
        this.prepareVerification();
        this.manuallyTriggered = manuallyTriggered;
        let stage = ServerClass_1.Server.backend.stages[0];
        if (!stage) {
            Log_1.Log.error("backend " + ServerClass_1.Server.backend.name + " has no " + Settings_1.Settings.VERIFY + " stage, even though the settigns were checked.");
            return false;
        }
        Log_1.Log.log("verify " + pathHelper.basename(this.fileUri));
        ServerClass_1.Server.executedStages.push(stage);
        Log_1.Log.log(ServerClass_1.Server.backend.name + ' verification started', ViperProtocol_1.LogLevel.Info);
        let path = ViperProtocol_1.Common.uriToPath(this.fileUri);
        //Request the debugger to terminate it's session
        DebugServer_1.DebugServer.stopDebugging();
        //start verification of current file
        this.path = path;
        this.filename = pathHelper.basename(path);
        this.verificationCount++;
        //notify client
        ServerClass_1.Server.sendStateChangeNotification({
            newState: ViperProtocol_1.VerificationState.VerificationRunning,
            filename: this.filename
        }, this);
        this.startVerificationTimeout(this.verificationCount);
        this.verifierProcess = this.nailgunService.startStageProcess(path, stage, this.stdOutHandler.bind(this), this.stdErrHandler.bind(this), this.completionHandler.bind(this));
        return true;
    }
    resetDiagnostics() {
        this.diagnostics = [];
        ServerClass_1.Server.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
    }
    resetLastSuccess() {
        this.lastSuccess = ViperProtocol_1.Success.None;
    }
    startVerificationTimeout(verificationCount) {
        if (this.nailgunService.activeBackend.timeout) {
            setTimeout(() => {
                //Log.log("check for verification timeout", LogLevel.Debug);
                if (this.running && this.verificationCount == verificationCount) {
                    Log_1.Log.hint("The verification timed out after " + this.nailgunService.activeBackend.timeout + "ms");
                    this.abortVerification().then(() => {
                        //wait for verification to terminate
                        ServerClass_1.Server.sendStateChangeNotification({
                            newState: ViperProtocol_1.VerificationState.Ready,
                            verificationCompleted: false,
                            success: ViperProtocol_1.Success.Timeout,
                            verificationNeeded: false,
                            uri: this.fileUri
                        }, this);
                    });
                }
                this.running = false;
            }, this.nailgunService.activeBackend.timeout);
        }
    }
    completionHandler(code) {
        try {
            Log_1.Log.log(`Child process exited with code ${code}`, ViperProtocol_1.LogLevel.Debug);
            if (code == null) {
                this.internalErrorMessage = "Possibly the backend generated to much output.";
            }
            if (this.aborting) {
                this.running = false;
                return;
            }
            let success;
            let isVerifyingStage = ServerClass_1.Server.stage().isVerification;
            //do we need to start a followUp Stage?
            if (!this.aborting) {
                let lastStage = ServerClass_1.Server.stage();
                let newStage;
                if (isVerifyingStage) {
                    success = this.determineSuccess(code);
                    newStage = Settings_1.Settings.getStageFromSuccess(ServerClass_1.Server.backend, lastStage, success);
                }
                else {
                    newStage = Settings_1.Settings.getStage(ServerClass_1.Server.backend, lastStage.onSuccess);
                }
                if (newStage) {
                    //only continue if no cycle
                    //only verifications are allowed to be repeated twice if the preceeding operation was no verification
                    let newStageExecutions = ServerClass_1.Server.executedStages.filter(stage => stage.name === newStage.name).length;
                    if (newStageExecutions <= 0 ||
                        (newStage.isVerification && !lastStage.isVerification && newStageExecutions <= 1)) {
                        ServerClass_1.Server.sendStateChangeNotification({ newState: ViperProtocol_1.VerificationState.Stage, stage: newStage.name, filename: this.filename }, this);
                        if (newStage.isVerification) {
                            Log_1.Log.log("Restart verifiacation after stage " + lastStage.name, ViperProtocol_1.LogLevel.Info);
                            this.verify(this.manuallyTriggered);
                        }
                        else {
                            let successMessage = ViperProtocol_1.Success[isVerifyingStage ? success : ViperProtocol_1.Success.Success];
                            Log_1.Log.log("Start stage " + newStage.name + " after stage " + lastStage.name + " success was: " + successMessage, ViperProtocol_1.LogLevel.Info);
                            ServerClass_1.Server.executedStages.push(newStage);
                            let path = ViperProtocol_1.Common.uriToPath(this.fileUri);
                            ServerClass_1.Server.nailgunService.startStageProcess(path, newStage, this.stdOutHandler.bind(this), this.stdErrHandler.bind(this), this.completionHandler.bind(this));
                        }
                        return;
                    }
                }
            }
            if (isVerifyingStage) {
                if (this.partialData.length > 0) {
                    Log_1.Log.error("Some unparsed output was detected:\n" + this.partialData);
                    this.partialData = "";
                }
                // Send the computed diagnostics to VSCode.
                ServerClass_1.Server.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
                //inform client about postProcessing
                ServerClass_1.Server.sendStateChangeNotification({
                    newState: ViperProtocol_1.VerificationState.PostProcessing,
                    filename: this.filename,
                }, this);
                //load the Execution trace from the SymbExLogFile
                this.loadSymbExLogFromFile();
                //complete the information about the method borders.
                //this can only be done at the end of the verification
                this.completeVerificationState();
                Log_1.Log.log("Number of Steps: " + this.steps.length, ViperProtocol_1.LogLevel.Info);
                //pass decorations to language client
                let decorations = this.getDecorationOptions();
                if (decorations.decorationOptions.length > 0) {
                    ServerClass_1.Server.sendStepsAsDecorationOptions(decorations);
                }
                //notify client about outcome of verification
                ServerClass_1.Server.sendStateChangeNotification({
                    newState: ViperProtocol_1.VerificationState.Ready,
                    success: success,
                    manuallyTriggered: this.manuallyTriggered,
                    filename: this.filename,
                    nofErrors: this.diagnostics.length,
                    time: this.time,
                    verificationCompleted: true,
                    uri: this.fileUri,
                    error: this.internalErrorMessage
                }, this);
                //is there the need to restart nailgun?
                if (code != 0 && code != 1 && code != 899) {
                    Log_1.Log.log("Verification Backend Terminated Abnormaly: with code " + code, ViperProtocol_1.LogLevel.Debug);
                    if (code == null) {
                        //this.nailgunService.setStopping();
                        this.nailgunService.killNGAndZ3();
                    }
                }
            }
            else {
                success = ViperProtocol_1.Success.Success;
                ServerClass_1.Server.sendStateChangeNotification({
                    newState: ViperProtocol_1.VerificationState.Ready,
                    success: success,
                    manuallyTriggered: this.manuallyTriggered,
                    filename: this.filename,
                    nofErrors: 0,
                    time: this.time,
                    verificationCompleted: false,
                    uri: this.fileUri,
                    error: this.internalErrorMessage
                }, this);
            }
            //reset for next verification
            this.lastSuccess = success;
            this.time = 0;
            this.running = false;
            this.verifierProcess = null;
        }
        catch (e) {
            this.running = false;
            this.verifierProcess = null;
            ServerClass_1.Server.sendVerificationNotStartedNotification(this.fileUri);
            Log_1.Log.error("Error handling verification completion: " + e);
        }
    }
    determineSuccess(code) {
        let result = ViperProtocol_1.Success.None;
        if (this.diagnostics.length == 0 && code == 0) {
            result = ViperProtocol_1.Success.Success;
        }
        else if (this.diagnostics.length > 0) {
            //use tag and backend trace as indicators for completed parsing
            if (!this.parsingCompleted && this.steps.length == 0) {
                result = ViperProtocol_1.Success.ParsingFailed;
            }
            else if (this.parsingCompleted && !this.typeCheckingCompleted) {
                result = ViperProtocol_1.Success.TypecheckingFailed;
            }
            else {
                result = ViperProtocol_1.Success.VerificationFailed;
            }
        }
        else {
            result = this.aborting ? ViperProtocol_1.Success.Aborted : ViperProtocol_1.Success.Error;
        }
        return result;
    }
    stdErrHandler(data) {
        try {
            data = data.trim();
            if (data.length == 0)
                return;
            //hide scala/java stacktraces
            if (data.startsWith("at ")) {
                Log_1.Log.toLogFile(data, ViperProtocol_1.LogLevel.LowLevelDebug);
                return;
            }
            this.internalErrorMessage = data;
            let stage = ServerClass_1.Server.stage();
            let message;
            let backendAndStage = "backend: " + ServerClass_1.Server.backend.name + " stage: " + ServerClass_1.Server.stage().name;
            if (data.startsWith("NailGun v")) {
                let hintMessage = "Wrong arguments for nailgun: Fix the customArguments in the settings of " + backendAndStage;
                Log_1.Log.hint(hintMessage);
            }
            else if (data.startsWith("connect: No error")) {
                let hintMessage = "No Nailgun server is running on port " + Settings_1.Settings.settings.nailgunSettings.port + ": is your nailgun correctly linked in the settings?";
                Log_1.Log.hint(hintMessage);
            }
            if (data.startsWith("java.lang.NullPointerException")) {
                message = "A nullpointer exception happened in " + backendAndStage;
            }
            else if (data.startsWith("java.lang.ClassNotFoundException:")) {
                message = "Class " + ServerClass_1.Server.stage().mainMethod + " is unknown to Nailgun\nFix the backend settings for " + ServerClass_1.Server.backend.name;
            }
            else if (data.startsWith("java.io.IOException: Stream closed")) {
                message = "A concurrency error occured, try again. Original Error message: " + data;
            }
            else if (data.startsWith("java.lang.StackOverflowError")) {
                message = "StackOverflowError in verification backend";
            }
            else if (data.startsWith("SLF4J: Class path contains multiple SLF4J bindings")) {
                Log_1.Log.error(ServerClass_1.Server.backend.name + "'s path is referencing the same class multiple times", ViperProtocol_1.LogLevel.Info);
            }
            else if (data.startsWith("SLF4J:")) {
                Log_1.Log.error("Error in " + backendAndStage + ": " + data, ViperProtocol_1.LogLevel.LowLevelDebug);
            }
            else {
                Log_1.Log.error("Error in " + backendAndStage + ": " + data, ViperProtocol_1.LogLevel.Debug);
            }
            if (message) {
                Log_1.Log.error(message, ViperProtocol_1.LogLevel.Default);
                this.internalErrorMessage = message;
            }
        }
        catch (e) {
            let message = "Error handling stderr: " + e;
            Log_1.Log.error(message);
            this.internalErrorMessage = message;
        }
    }
    isMessageComplete(json) {
        let error;
        if (!json || !json.type) {
            error = "Message has no type, raw: " + JSON.stringify(json);
        }
        else {
            switch (json.type) {
                case ViperProtocol_1.BackendOutputType.Start:
                    //backendType;
                    if (!json.backendType) {
                        error = "The Start message needs to contain the backendType";
                    }
                    break;
                case ViperProtocol_1.BackendOutputType.VerificationStart:
                    //nofPredicates,nofMethods,nofFunctions;
                    if (json.nofFunctions == undefined || json.nofMethods == undefined || json.nofPredicates == undefined) {
                        error = "The VerificationStart message needs to contain nofPredicates, nofMethods, and nofFunctions.";
                    }
                    break;
                case ViperProtocol_1.BackendOutputType.Success:
                case ViperProtocol_1.BackendOutputType.FunctionVerified:
                case ViperProtocol_1.BackendOutputType.MethodVerified:
                case ViperProtocol_1.BackendOutputType.PredicateVerified:
                    //nothing
                    break;
                case ViperProtocol_1.BackendOutputType.Error:
                    //errors, err.tag, err.start, err.end, err.message
                    if (!json.errors) {
                        error = "Error message needs to contain errors";
                    }
                    else {
                        json.errors.forEach(err => {
                            if (!err.tag || !err.start || !err.end || !err.message) {
                                error = "each error in error message needs to be of type {start: string, end: string, tag: string, message: string}";
                            }
                        });
                    }
                    break;
                case ViperProtocol_1.BackendOutputType.End:
                    //time
                    if (!ServerClass_1.Server.containsNumber(json.time)) {
                        error = "End message needs to contain the time";
                    }
                    break;
                default:
                    error = "Unknown message type: " + json.type;
            }
            if (error) {
                Log_1.Log.error("Malformed backend message: " + error);
                return false;
            }
            else {
                return true;
            }
        }
    }
    stdOutHandler(data) {
        try {
            if (data.trim().length == 0) {
                return;
            }
            let stage = ServerClass_1.Server.stage();
            if (this.aborting)
                return;
            if (stage.isVerification) {
                let parts = data.split(/\r?\n/g);
                parts[0] = this.partialData + parts[0];
                for (var i = 0; i < parts.length; i++) {
                    let line = parts[i];
                    if (line.length == 0)
                        continue;
                    //json message
                    if (line.startsWith("{\"") && line.endsWith("}")) {
                        Log_1.Log.toLogFile(`[${ServerClass_1.Server.backend.name}: ${stage.name}: stdout]: ${line}`, ViperProtocol_1.LogLevel.LowLevelDebug);
                        try {
                            let json = JSON.parse(line);
                            if (!this.isMessageComplete(json)) {
                                return;
                            }
                            switch (json.type) {
                                case ViperProtocol_1.BackendOutputType.Start:
                                    this.backendType = json.backendType;
                                    break;
                                case ViperProtocol_1.BackendOutputType.VerificationStart:
                                    this.progress = new TotalProgress_1.Progress(json);
                                    ServerClass_1.Server.sendStateChangeNotification({
                                        newState: ViperProtocol_1.VerificationState.VerificationRunning,
                                        progress: 0,
                                        filename: this.filename
                                    }, this);
                                    break;
                                case ViperProtocol_1.BackendOutputType.FunctionVerified:
                                case ViperProtocol_1.BackendOutputType.MethodVerified:
                                case ViperProtocol_1.BackendOutputType.PredicateVerified:
                                    if (!this.progress) {
                                        Log_1.Log.error("The backend must send a VerificationStart message before the ...Verified message.");
                                        return;
                                    }
                                    this.progress.updateProgress(json);
                                    let progressInPercent = this.progress.toPercent();
                                    ServerClass_1.Server.sendStateChangeNotification({
                                        newState: ViperProtocol_1.VerificationState.VerificationRunning,
                                        progress: progressInPercent,
                                        filename: this.filename
                                    }, this);
                                    break;
                                case ViperProtocol_1.BackendOutputType.Error:
                                    json.errors.forEach(err => {
                                        if (err.tag && err.tag == "typechecker.error") {
                                            this.typeCheckingCompleted = false;
                                        }
                                        else if (err.tag && err.tag == "parser.error") {
                                            this.parsingCompleted = false;
                                            this.typeCheckingCompleted = false;
                                        }
                                        let range = ServerClass_1.Server.extractRange(err.start, err.end);
                                        Log_1.Log.log(`Error: [${ServerClass_1.Server.backend.name}] ${err.tag ? "[" + err.tag + "] " : ""}${range.start.line + 1}:${range.start.character + 1} ${err.message}`, ViperProtocol_1.LogLevel.Default);
                                        this.diagnostics.push({
                                            range: range,
                                            source: null,
                                            severity: 1 /* Error */,
                                            message: err.message
                                        });
                                    });
                                    break;
                                case ViperProtocol_1.BackendOutputType.End:
                                    this.state = ViperProtocol_1.VerificationState.VerificationReporting;
                                    this.time = ServerClass_1.Server.extractNumber(json.time);
                                    break;
                            }
                        }
                        catch (e) {
                            Log_1.Log.error("Error handling json message: " + e + " raw: " + line);
                        }
                        //no need to handle old ouput, if it is in json format
                        continue;
                    }
                    else if (line.startsWith('"')) {
                        while (i + 1 < parts.length && !line.endsWith('"')) {
                            line += parts[++i];
                        }
                        if (line.endsWith('"')) {
                            this.model.extendModel(line);
                            this.partialData = "";
                        }
                        else {
                            this.partialData = line;
                        }
                        //no need to handle old ouput
                        continue;
                    }
                    //non json output handling:
                    //handle start and end of verification
                    if ((line.startsWith('Silicon') && !line.startsWith('Silicon finished')) || line.startsWith('carbon started')) {
                        Log_1.Log.toLogFile(`[${ServerClass_1.Server.backend.name}: ${stage.name}: stdout]: ${line}`, ViperProtocol_1.LogLevel.LowLevelDebug);
                        if (this.state != ViperProtocol_1.VerificationState.VerificationRunning)
                            Log_1.Log.log("State -> Verification Running", ViperProtocol_1.LogLevel.Info);
                        this.state = ViperProtocol_1.VerificationState.VerificationRunning;
                        continue;
                    }
                    else if (line.startsWith('Silicon finished') || line.startsWith('carbon finished in')) {
                        Log_1.Log.toLogFile(`[${ServerClass_1.Server.backend.name}: ${stage.name}: stdout]: ${line}`, ViperProtocol_1.LogLevel.LowLevelDebug);
                        Log_1.Log.log("State -> Error Reporting", ViperProtocol_1.LogLevel.Info);
                        this.state = ViperProtocol_1.VerificationState.VerificationReporting;
                        this.time = ServerClass_1.Server.extractNumber(line);
                    }
                    else if (line.trim().length > 0) {
                        Log_1.Log.toLogFile(`[${ServerClass_1.Server.backend.name}: ${stage.name}: stdout]: ${line}`, ViperProtocol_1.LogLevel.LowLevelDebug);
                        if (i < parts.length - 1 || (this.state != ViperProtocol_1.VerificationState.VerificationRunning)) {
                            //only in VerificationRunning state, the lines are nicley split by newLine characters
                            //therefore, the partialData construct is only enabled during the verification;
                            //Log.toLogFile(`[${Server.backend.name}: stdout]: ${line}`, LogLevel.LowLevelDebug);
                            let linesToSkip = this.handleBackendOutputLine(line);
                            {
                            }
                        }
                    }
                }
            }
            else {
                Log_1.Log.log(`${ServerClass_1.Server.backend.name}:${stage.name}: ${data}`, ViperProtocol_1.LogLevel.Debug);
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling the std output of the backend: " + e);
        }
    }
    handleBackendOutputLine(line) {
        switch (this.state) {
            case ViperProtocol_1.VerificationState.Stopped:
                if (line.startsWith("Command-line interface:")) {
                    Log_1.Log.error('Could not start verification -> fix customArguments for backend', ViperProtocol_1.LogLevel.Default);
                    this.state = ViperProtocol_1.VerificationState.VerificationPrintingHelp;
                }
                break;
            case ViperProtocol_1.VerificationState.VerificationRunning:
                line = line.trim();
                //detect vetification end, get time
                if (line.startsWith('Silicon finished in') || line.startsWith('carbon finished in')) {
                    Log_1.Log.log("WARNING: analyze the reason for this code to be executed", ViperProtocol_1.LogLevel.Debug);
                    this.state = ViperProtocol_1.VerificationState.VerificationReporting;
                    this.time = ServerClass_1.Server.extractNumber(line);
                }
                break;
            case ViperProtocol_1.VerificationState.VerificationReporting:
                if (line == 'No errors found.') {
                }
                else if (line.startsWith('The following errors were found')) {
                }
                else if (line.startsWith('  ')) {
                    let parsedPosition = ServerClass_1.Server.extractPosition(line);
                    let message = parsedPosition.after.length > 0 ? parsedPosition.after : parsedPosition.before;
                    //read in error tags
                    let tag;
                    if (line.indexOf("[") >= 0 && line.indexOf("]") >= 0) {
                        tag = line.substring(line.indexOf("[") + 1, line.indexOf("]")).trim();
                        if (tag == "typechecker.error") {
                            this.typeCheckingCompleted = false;
                        }
                        else if (tag == "parser.error") {
                            this.parsingCompleted = false;
                            this.typeCheckingCompleted = false;
                        }
                    }
                    tag = tag ? "[" + tag + "] " : "";
                    let pos = parsedPosition.pos || { line: 0, character: 0 };
                    let posString = parsedPosition.range ? this.prettyRange(parsedPosition.range) : this.prettyPos(pos);
                    //either pick range or pos to show diagnostics.
                    let range = parsedPosition.range ? parsedPosition.range : {
                        start: pos,
                        end: { line: pos.line, character: 10000 } //Number.max does not work -> 10000 is an arbitrary large number that does the job
                    };
                    Log_1.Log.log(`Error: [${ServerClass_1.Server.backend.name}] ${tag}${posString} ${message}`, ViperProtocol_1.LogLevel.Default);
                    this.diagnostics.push({
                        range: range,
                        source: null,
                        severity: 1 /* Error */,
                        message: message
                    });
                }
                else {
                    Log_1.Log.error("Unexpected message during VerificationReporting: " + line);
                }
                break;
            case ViperProtocol_1.VerificationState.VerificationPrintingHelp:
                return -1;
        }
    }
    prettyRange(range) {
        return `${this.prettyPos(range.start)}-${this.prettyPos(range.end)}`;
    }
    prettyPos(pos) {
        return `${pos.line + 1}:${pos.character + 1}`;
    }
    completeVerificationState() {
        this.stateIndicesOrderedByPosition = [];
        let symbExLogIndex = 0;
        let lastMatchingLogIndex = -1;
        let methodIndex = -1;
        this.steps.forEach((element, i) => {
            if (element.canBeShownAsDecoration) {
                this.stateIndicesOrderedByPosition.push({ index: element.index, position: element.position });
                let statement = element;
            }
            //check trivial states
            if (element.isTrivialState) {
                if (element.children && element.hasNonTrivialChildren()) {
                    Log_1.Log.log("Warning: server state " + element.index + " is a trivial state with a non trivial child");
                }
            }
            //determine if the state is an error state
            //TODO: is the detection right?
            for (let j = 0; j < this.diagnostics.length; j++) {
                let diagnostic = this.diagnostics[j];
                if (this.comparePosition(diagnostic.range.start, element.position) == 0) {
                    element.isErrorState = true;
                    element.fillInConcreteValues(this.model);
                    break;
                }
            }
        });
        this.stateIndicesOrderedByPosition.sort(this.comparePositionAndIndex);
    }
    getPositionOfState(index) {
        if (index >= 0 && index < this.steps.length) {
            if (this.steps[index].position) {
                return this.steps[index].position;
            }
            else {
                return { line: 0, character: 0 };
            }
        }
        else {
            return { line: -1, character: -1 };
        }
    }
    abortVerification() {
        return new Promise((resolve, reject) => {
            try {
                if (!this.running) {
                    resolve(true);
                    return;
                }
                Log_1.Log.log('Abort running verification', ViperProtocol_1.LogLevel.Info);
                this.aborting = true;
                //remove impact of child_process to kill
                this.verifierProcess.removeAllListeners('close');
                this.verifierProcess.stdout.removeAllListeners('data');
                this.verifierProcess.stderr.removeAllListeners('data');
                //log the exit of the child_process to kill
                let ngClientEndPromise = new Promise((res, rej) => {
                    this.verifierProcess.on('exit', (code, signal) => {
                        Log_1.Log.log(`Child process exited with code ${code} and signal ${signal}`, ViperProtocol_1.LogLevel.Debug);
                        res(true);
                    });
                });
                //try {
                //HOW TO kill the verifier process and all its children?
                //-> this worked so far: kill the process and all ng.exe and z3.exe instances
                //this.verifierProcess.kill('SIGINT'); //TODO: not working on mac, linux?
                //let deamonKillerPromise = Server.nailgunService.killNGAndZ3Deamon();
                //only after the verification really ended we can continue;
                //experiments:
                //process.kill(this.verifierProcess.pid);
                //let k = child_process.exec("pkill -TERM -P " +this.verifierProcess.pid);
                let deamonKillerPromise = ServerClass_1.Server.nailgunService.killNGAndZ3(this.verifierProcess.pid);
                Promise.all([ngClientEndPromise, deamonKillerPromise]).then(() => {
                    resolve(true);
                });
                //let killcommand = "taskkill /pid "+this.verifierProcess.pid+" /T /F";
                //Log.log("kill command:" + killcommand);
                //child_process.exec(killcommand);
                //process.kill(this.verifierProcess.pid, 'SIGINT');
                //} catch (e) {}// if stopping does not work, there is nothing we can do about it.
                let l = this.verifierProcess.listeners;
                this.verifierProcess = null;
                this.running = false;
                this.lastSuccess = ViperProtocol_1.Success.Aborted;
            }
            catch (e) {
                Log_1.Log.error("Error aborting verification of " + this.filename + ": " + e);
                resolve(false);
            }
        });
    }
    getStepsOnLine(line) {
        let result = [];
        this.steps.forEach((step) => {
            if (step.position.line == line) {
                result.push(step);
            }
        });
        return result;
    }
    loadSymbExLogFromFile() {
        try {
            let symbExLogPath = pathHelper.join(ServerClass_1.Server.tempDirectory, "executionTreeData.js");
            Log_1.Log.log("Loading The symbexLog from: " + symbExLogPath, ViperProtocol_1.LogLevel.Debug);
            if (fs.existsSync(symbExLogPath)) {
                let content = fs.readFileSync(symbExLogPath).toString();
                content = content.substring(content.indexOf("["), content.length).replace(/\n/g, ' ');
                this.symbExLog = JSON.parse(content);
                Log_1.Log.log("Execution tree successfully loaded: " + this.symbExLog.length + " toplevel construct" + (this.symbExLog.length == 1 ? "" : "s") + " found", ViperProtocol_1.LogLevel.Info);
                //parse SymbexLog
                this.steps = [];
                this.verifiables = [];
                this.symbExLog.forEach(data => {
                    let index = this.verifiables.length;
                    this.verifiables.push(new Verifiable_1.Verifiable(this.steps, index, data, this));
                });
            }
            else {
                Log_1.Log.log("No executionTreeData.js found", ViperProtocol_1.LogLevel.Debug);
            }
        }
        catch (e) {
            Log_1.Log.error("Error loading SymbExLog from file: " + e);
            Log_1.Log.hint("Error reading backend output: please update the extension and the backend to the newest version.");
        }
    }
    static stopAllRunningVerifications() {
        return new Promise((resolve, reject) => {
            try {
                if (ServerClass_1.Server.verificationTasks && ServerClass_1.Server.verificationTasks.size > 0) {
                    Log_1.Log.log("Stop all running verificationTasks", ViperProtocol_1.LogLevel.Debug);
                    let promises = [];
                    ServerClass_1.Server.verificationTasks.forEach(task => {
                        promises.push(new Promise((res, rej) => {
                            task.abortVerification().then(() => { res(true); });
                        }));
                    });
                    Promise.all(promises).then(() => {
                        resolve(true);
                    });
                }
                else {
                    resolve(true);
                }
            }
            catch (e) {
                Log_1.Log.error("Error stopping all running verifications: " + e);
                reject();
            }
        });
    }
}
exports.VerificationTask = VerificationTask;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmVyaWZpY2F0aW9uVGFzay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmVyaWZpY2F0aW9uVGFzay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFJYiwyQkFBeUIsWUFDekIsQ0FBQyxDQURvQztBQUNyQyxnQ0FBMlAsaUJBQzNQLENBQUMsQ0FEMlE7QUFDNVEsc0JBQW9CLE9BQU8sQ0FBQyxDQUFBO0FBRzVCLHdCQUFzQixTQUFTLENBQUMsQ0FBQTtBQUNoQyxNQUFZLFVBQVUsV0FBTSxNQUFNLENBQUMsQ0FBQTtBQUNuQyxpQ0FBK0Isa0JBQWtCLENBQUMsQ0FBQTtBQUNsRCxnQ0FBeUIsaUJBQWlCLENBQUMsQ0FBQTtBQUMzQyw4QkFBdUIsZUFBZSxDQUFDLENBQUE7QUFDdkMsOEJBQTRCLGVBQWUsQ0FBQyxDQUFBO0FBQzVDLE1BQVksRUFBRSxXQUFNLElBQUksQ0FBQyxDQUFBO0FBQ3pCLDZCQUEyQixjQUFjLENBQUMsQ0FBQTtBQUUxQztJQXVDSSxZQUFZLE9BQWUsRUFBRSxjQUE4QjtRQXBDM0Qsc0JBQWlCLEdBQVcsQ0FBQyxDQUFDO1FBSzlCLGdCQUFXLEdBQVksdUJBQU8sQ0FBQyxJQUFJLENBQUM7UUFDcEMseUJBQW9CLEdBQVcsRUFBRSxDQUFDO1FBRWxDLG9DQUFvQztRQUNwQyxZQUFPLEdBQVksS0FBSyxDQUFDO1FBQ3pCLGFBQVEsR0FBWSxLQUFLLENBQUM7UUFDMUIsVUFBSyxHQUFzQixpQ0FBaUIsQ0FBQyxPQUFPLENBQUM7UUFHckQsbUJBQW1CO1FBQ1gsVUFBSyxHQUFhLEVBQUUsQ0FBQztRQUNyQixnQkFBVyxHQUFZLEtBQUssQ0FBQztRQUM3QixnQkFBVyxHQUFXLEVBQUUsQ0FBQztRQUNqQyxzQkFBc0I7UUFDdEIsU0FBSSxHQUFXLENBQUMsQ0FBQztRQUlqQixVQUFLLEdBQVUsSUFBSSxhQUFLLEVBQUUsQ0FBQztRQUMzQixxQkFBZ0IsR0FBWSxLQUFL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