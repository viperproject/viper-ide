'use strict';
const vscode_languageserver_1 = require('vscode-languageserver');
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
    constructor(fileUri, nailgunService, connection) {
        //state
        this.running = false;
        this.aborting = false;
        this.state = ViperProtocol_1.VerificationState.Stopped;
        //working variables
        this.lines = [];
        this.wrongFormat = false;
        this.partialData = "";
        this.linesToSkip = 0;
        this.inSymbExLoggerHierarchy = false;
        //isFromMethod: boolean = false;
        //verification results
        this.time = 0;
        this.model = new Model_1.Model();
        this.lastSuccess = ViperProtocol_1.Success.None;
        this.parsingCompleted = false;
        this.typeCheckingCompleted = false;
        //symbExLog: SymbExLogEntry[] = [];
        this.completeSymbExLog = [];
        this.fileUri = fileUri;
        this.nailgunService = nailgunService;
        VerificationTask.connection = connection;
    }
    getHeapGraphDescription(clientIndex) {
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
        return {
            heap: HeapVisualizer_1.HeapVisualizer.heapToDot(step, step.isErrorState || this.nailgunService.settings.showSymbolicState, step.isErrorState, this.model),
            state: step.decorationOptions.index,
            fileName: this.filename,
            fileUri: this.fileUri,
            position: step.position,
            stateInfos: (this.steps[serverIndex].isErrorState ? "Error State -> use the Counter Example\n" : "") + step.pretty(),
            methodName: step.verifiable.name,
            methodType: step.verifiable.typeString(),
            methodOffset: step.verifiable.startIndex - 1,
            conditions: step.prettyConditions()
        };
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
            this.steps.forEach((element, i) => {
                let clientNumber = element.decorationOptions ? "" + element.decorationOptions.numberToDisplay : "";
                let serverNumber = "" + i;
                let spacesToPut = 8 - clientNumber.length - serverNumber.length;
                spacesToPut = spacesToPut < 0 ? 0 : spacesToPut;
                res += `\n\t${clientNumber} ${"\t".repeat(spacesToPut)}(${serverNumber})|${"\t".repeat(element.depthLevel())} ${element.firstLine()}`;
            });
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
                    let options = {
                        hoverMessage: step.toToolTip(),
                        range: {
                            start: { line: step.position.line, character: 0 },
                            end: { line: step.position.line, character: 0 }
                        },
                        renderOptions: {
                            before: {
                                contentText: "(" + (decorationOptions.length + 1) + ")",
                                color: step.isErrorState ? ViperProtocol_1.StateColors.errorState(this.nailgunService.settings.darkGraphs) : ViperProtocol_1.StateColors.interestingState(this.nailgunService.settings.darkGraphs),
                            }
                        },
                        index: decorationOptions.length,
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
            let stepInfo = [];
            this.stateIndicesOrderedByPosition.forEach(idx => {
                let step = this.steps[idx.index];
                if (step.canBeShownAsDecoration) {
                    //let step = this.steps[idx.index];
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
            return {
                decorationOptions: decorationOptions,
                globalInfo: this.prettySteps() + "\n" + this.model.pretty(),
                uri: this.fileUri
            };
        }
        catch (e) {
            Log_1.Log.error("Error getting decoration options: " + e);
        }
    }
    verify(manuallyTriggered) {
        if (!manuallyTriggered && this.lastSuccess == ViperProtocol_1.Success.Error) {
            Log_1.Log.log("After an internal error, reverification has to be triggered manually.", ViperProtocol_1.LogLevel.Info);
            return false;
        }
        //Initialization
        this.manuallyTriggered = manuallyTriggered;
        this.running = true;
        ServerClass_1.Server.executedStages.push(Settings_1.Settings.getVerifyStage(ServerClass_1.Server.backend));
        this.aborting = false;
        this.state = ViperProtocol_1.VerificationState.Stopped;
        this.resetDiagnostics();
        this.wrongFormat = false;
        this.steps = [];
        this.lines = [];
        this.clientStepIndexToServerStep = [];
        this.model = new Model_1.Model();
        this.parsingCompleted = true;
        this.typeCheckingCompleted = true;
        this.inSymbExLoggerHierarchy = false;
        if (this.partialData.length > 0) {
            Log_1.Log.error("Some unparsed output was detected:\n" + this.partialData);
            this.partialData = "";
        }
        if (this.linesToSkip != 0) {
            Log_1.Log.error("missed lines to skip: " + this.linesToSkip);
            this.linesToSkip = 0;
        }
        Log_1.Log.log(ServerClass_1.Server.backend.name + ' verification started', ViperProtocol_1.LogLevel.Info);
        VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.VerificationRunning });
        VerificationTask.uriToPath(this.fileUri).then((path) => {
            //Request the debugger to terminate it's session
            DebugServer_1.DebugServer.stopDebugging();
            //start verification of current file
            this.path = path;
            this.filename = pathHelper.basename(path);
            let stage = Settings_1.Settings.getVerifyStage(ServerClass_1.Server.backend);
            if (!stage) {
                Log_1.Log.error("backend " + ServerClass_1.Server.backend.name + " has no " + Settings_1.Settings.VERIFY + " stage, even though the settigns were checked.");
                return false;
            }
            this.verifierProcess = this.nailgunService.startStageProcess(path, stage, this.stdOutHandler.bind(this), this.stdErrHadler.bind(this), this.completionHandler.bind(this));
        });
        return true;
    }
    resetDiagnostics() {
        this.diagnostics = [];
        VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
    }
    reset() {
        this.lastSuccess = ViperProtocol_1.Success.None;
    }
    completionHandler(code) {
        try {
            Log_1.Log.log(`Child process exited with code ${code}`, ViperProtocol_1.LogLevel.Debug);
            if (this.aborting) {
                this.running = false;
                return;
            }
            let success;
            let isVerifyingStage = ServerClass_1.Server.stage().isVerification;
            if (isVerifyingStage) {
                if (code != 0 && code != 1 && code != 899) {
                    Log_1.Log.log("Verification Backend Terminated Abnormaly: with code " + code, ViperProtocol_1.LogLevel.Default);
                    if (Settings_1.Settings.isWin && code == null) {
                        this.nailgunService.killNgDeamon();
                        this.nailgunService.restartNailgunServer(VerificationTask.connection, ServerClass_1.Server.backend);
                    }
                }
                if (this.partialData.length > 0) {
                    Log_1.Log.error("Some unparsed output was detected:\n" + this.partialData);
                    this.partialData = "";
                }
                success = this.determineSuccess(code);
            }
            //do we need to start onError tasks?
            if (!this.aborting) {
                let lastStage = ServerClass_1.Server.stage();
                let newStage;
                if (isVerifyingStage) {
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
                        VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { filename: this.filename, stage: newStage.name });
                        if (newStage.isVerification) {
                            Log_1.Log.log("Restart verifiacation after stage " + lastStage.name, ViperProtocol_1.LogLevel.Info);
                            this.verify(this.manuallyTriggered);
                        }
                        else {
                            let successMessage = ViperProtocol_1.Success[isVerifyingStage ? success : ViperProtocol_1.Success.Success];
                            Log_1.Log.log("Start stage " + newStage.name + " after stage " + lastStage.name + " success was: " + successMessage, ViperProtocol_1.LogLevel.Info);
                            ServerClass_1.Server.executedStages.push(newStage);
                            VerificationTask.uriToPath(this.fileUri).then((path) => {
                                ServerClass_1.Server.nailgunService.startStageProcess(path, newStage, this.stdOutHandler.bind(this), this.stdErrHadler.bind(this), this.completionHandler.bind(this));
                            });
                        }
                        return;
                    }
                }
            }
            if (isVerifyingStage) {
                // Send the computed diagnostics to VSCode.
                VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
                //inform client about postProcessing
                VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, {
                    newState: ViperProtocol_1.VerificationState.PostProcessing,
                    filename: this.filename,
                });
                //load the Execution trace from the SymbExLogFile
                this.loadSymbExLogFromFile();
                //complete the information about the method borders.
                //this can only be done at the end of the verification
                this.completeVerificationState();
                Log_1.Log.log("Number of Steps: " + this.steps.length, ViperProtocol_1.LogLevel.Info);
                //pass decorations to language client
                let decorations = this.getDecorationOptions();
                if (decorations.decorationOptions.length > 0) {
                    //Log.log(JSON.stringify(params),LogLevel.Debug);
                    Log_1.Log.log("Update the decoration options (" + decorations.decorationOptions.length + ")", ViperProtocol_1.LogLevel.Debug);
                    VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StepsAsDecorationOptions, decorations);
                }
                let stateChangeParams = {
                    newState: ViperProtocol_1.VerificationState.Ready,
                    success: success,
                    manuallyTriggered: this.manuallyTriggered,
                    filename: this.filename,
                    nofErrors: this.diagnostics.length,
                    time: this.time,
                    verificationCompleted: true,
                    uri: this.fileUri
                };
                VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, stateChangeParams);
                this.lastSuccess = success;
            }
            else {
                success = ViperProtocol_1.Success.Success;
                let stateChangeParams = {
                    newState: ViperProtocol_1.VerificationState.Ready,
                    success: success,
                    manuallyTriggered: this.manuallyTriggered,
                    filename: this.filename,
                    nofErrors: 0,
                    time: this.time,
                    verificationCompleted: false,
                    uri: this.fileUri
                };
                VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, stateChangeParams);
            }
            //reset for next verification
            this.time = 0;
            this.running = false;
        }
        catch (e) {
            this.running = false;
            VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.VerificationNotStarted, this.fileUri);
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
    stdErrHadler(data) {
        data = data.trim();
        if (data.length == 0)
            return;
        //hide stacktraces
        if (data.startsWith("at ")) {
            Log_1.Log.toLogFile(data, ViperProtocol_1.LogLevel.LowLevelDebug);
            return;
        }
        let stage = ServerClass_1.Server.stage();
        if (stage.isVerification) {
            if (data.startsWith("connect: No error")) {
                Log_1.Log.hint("No Nailgun server is running on port " + this.nailgunService.settings.nailgunPort);
            }
            else if (data.startsWith("java.lang.NullPointerException")) {
                Log_1.Log.error("A nullpointer exception happened in the verification backend.", ViperProtocol_1.LogLevel.Default);
            }
            else if (data.startsWith("java.lang.ClassNotFoundException:")) {
                Log_1.Log.error("Class " + ServerClass_1.Server.stage().mainMethod + " is unknown to Nailgun\nFix the backend settings for " + ServerClass_1.Server.backend.name, ViperProtocol_1.LogLevel.Default);
            }
            else if (data.startsWith("java.io.IOException: Stream closed")) {
                Log_1.Log.error("A concurrency error occured, try again.", ViperProtocol_1.LogLevel.Default);
            }
            else if (data.startsWith("java.lang.StackOverflowError")) {
                Log_1.Log.error("StackOverflowError in verification backend", ViperProtocol_1.LogLevel.Default);
            }
            else if (data.startsWith("SLF4J: Class path contains multiple SLF4J bindings")) {
                Log_1.Log.error(ServerClass_1.Server.backend.name + " is referencing two versions of the backend, fix its paths in the settings", ViperProtocol_1.LogLevel.Default);
            }
            else {
                Log_1.Log.error("Unknown backend error message: " + data, ViperProtocol_1.LogLevel.Debug);
            }
        }
        else {
            Log_1.Log.error("Backend error message: " + stage.name + " " + data, ViperProtocol_1.LogLevel.Debug);
        }
    }
    stdOutHandler(data) {
        if (data.trim().length == 0) {
            return;
        }
        let stage = ServerClass_1.Server.stage();
        if (this.aborting)
            return;
        if (stage.isVerification) {
            Log_1.Log.toLogFile(`[${ServerClass_1.Server.backend.name}:${stage.name}: stdout raw]: ${data}`, ViperProtocol_1.LogLevel.LowLevelDebug);
            let parts = data.split(/\r?\n/g);
            parts[0] = this.partialData + parts[0];
            for (var i = 0; i < parts.length; i++) {
                let line = parts[i];
                //handle start and end of verification
                if (line.startsWith('Silicon started') || line.startsWith('carbon started')) {
                    Log_1.Log.log("State -> Verification Running", ViperProtocol_1.LogLevel.Info);
                    this.state = ViperProtocol_1.VerificationState.VerificationRunning;
                }
                else if (line.startsWith('Silicon finished in') || line.startsWith('carbon finished in')) {
                    Log_1.Log.log("State -> Error Reporting", ViperProtocol_1.LogLevel.Info);
                    this.state = ViperProtocol_1.VerificationState.VerificationReporting;
                    this.time = this.extractNumber(line);
                }
                else if (line.trim().length > 0) {
                    if (i < parts.length - 1 || (this.state != ViperProtocol_1.VerificationState.VerificationRunning)) {
                        //only in VerificationRunning state, the lines are nicley split by newLine characters
                        //therefore, the partialData construct is only enabled during the verification;
                        //Log.toLogFile(`[${Server.backend.name}: stdout]: ${line}`, LogLevel.LowLevelDebug);
                        let linesToSkip = this.handleBackendOutputLine(line);
                        {
                            if (linesToSkip < 0) {
                                return;
                            }
                            else if (linesToSkip > 0) {
                                this.linesToSkip = linesToSkip;
                            }
                        }
                    }
                }
            }
            if (this.state == ViperProtocol_1.VerificationState.VerificationRunning) {
                this.partialData = parts[parts.length - 1];
            }
        }
        else {
            Log_1.Log.log(`${ServerClass_1.Server.backend.name}:${stage.name}: ${data}`, ViperProtocol_1.LogLevel.Debug);
        }
    }
    handleBackendOutputLine(line) {
        if (this.linesToSkip - 1 > 0) {
            this.linesToSkip--;
            return;
        }
        switch (this.state) {
            case ViperProtocol_1.VerificationState.Stopped:
                if (line.startsWith("Command-line interface:")) {
                    Log_1.Log.error('Could not start verification -> fix customArguments for backend', ViperProtocol_1.LogLevel.Default);
                    this.state = ViperProtocol_1.VerificationState.VerificationPrintingHelp;
                }
                break;
            case ViperProtocol_1.VerificationState.VerificationRunning:
                line = line.trim();
                if (line.startsWith("{\"") && line.endsWith("}")) {
                    try {
                        let progress = new TotalProgress_1.TotalProgress(JSON.parse(line));
                        Log_1.Log.log("Progress: " + progress.toPercent(), ViperProtocol_1.LogLevel.Info);
                        VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.VerificationRunning, progress: progress.toPercent(), filename: this.filename });
                    }
                    catch (e) {
                        Log_1.Log.error("Error reading progress: " + e);
                    }
                }
                else if (line.startsWith('Silicon finished in') || line.startsWith('carbon finished in')) {
                    Log_1.Log.log("WARNING: analyze the reason for this code to be executed", ViperProtocol_1.LogLevel.Debug);
                    this.state = ViperProtocol_1.VerificationState.VerificationReporting;
                    this.time = this.extractNumber(line);
                }
                else if (line.startsWith("\"")) {
                    // let moreThanOne = false;
                    // while (line.startsWith("\"") && line.indexOf("\"", 1) > 0 && line.indexOf("\"", 1) != line.lastIndexOf("\"")) {
                    //     //we have multiple objects in this line -> split them
                    //     moreThanOne = true;
                    //     this.handleBackendOutputLine(line.substring(0, line.indexOf("\"", 1) + 1));
                    //     line = line.substring(line.indexOf("\"", 1) + 1, line.length);
                    // }
                    // if (moreThanOne) {
                    //     this.handleBackendOutputLine(line);
                    // } else {
                    this.model.extendModel(line);
                }
                else if (line.startsWith("---------- FUNCTION") || line.startsWith("---------- PREDICATE") || line.startsWith("---------- METHOD")) {
                    /*if (this.methodBorders.length > 0) {
                        this.methodBorders[this.methodBorders.length - 1].lastStateIndex = this.steps.length - 1;
                    }

                    let nameParts = line.replace(/-/g, "").trim().split(" ");

                    this.methodBorders.push({ name: line, methodName: nameParts[1], methodType: nameParts[0].toLowerCase(), firstStateIndex: this.steps.length, lastStateIndex: -1, start: -1, end: -1 });
                    */
                    // if (line.startsWith("---------- METHOD ")) {
                    //     //this.isFromMethod = true;
                    // } else {
                    //     //this.isFromMethod = false;
                    //     //TODO: handle method predicate or function mention if needed
                    // }
                    return 0;
                }
                else if (line.startsWith("-----")) {
                }
                else if (line.startsWith("h = ") || line.startsWith("hLHS = ")) {
                    //TODO: handle if needed
                    return 0;
                }
                else if (line.startsWith("hR = ")) {
                    Log_1.Log.log("skip the next 3 lines", ViperProtocol_1.LogLevel.Info);
                    return 3;
                }
                else if (line.startsWith('PRODUCE') || line.startsWith('CONSUME') || line.startsWith('EVAL') || line.startsWith('EXECUTE')) {
                    if (this.lines.length > 0) {
                        let msg = "Warning: Ignore " + this.lines.length + " line(s):";
                        this.lines.forEach((line) => {
                            msg = msg + "\n\t" + line;
                        });
                        Log_1.Log.error(msg);
                        Log_1.Log.log("Next line: " + line, ViperProtocol_1.LogLevel.Debug);
                    }
                    this.lines = [];
                    this.lines.push(line);
                }
                else {
                    if (line.trim() == ')') {
                        if (this.lines.length != 6) {
                            Log_1.Log.error("error reading verification trace. Unexpected format.");
                            let msg = "Warning: Ignore " + this.lines.length + " line(s):";
                            this.lines.forEach((line) => {
                                msg = msg + "\n\t" + line;
                            });
                            Log_1.Log.error(msg);
                            this.lines = [];
                        }
                        else {
                            //this.steps.push(Statement.CreateFromTrace(this.lines[0], this.lines[2], this.lines[3], this.lines[4], this.lines[5], this.model, this.steps.length, this.methodBorders.length - 1));
                            this.lines = [];
                        }
                    }
                    else {
                        this.lines.push(line);
                    }
                }
                break;
            case ViperProtocol_1.VerificationState.VerificationReporting:
                if (line == 'No errors found.') {
                }
                else if (line.startsWith('The following errors were found')) {
                }
                else if (line.startsWith('  ')) {
                    let pos = /\s*(\d+):(\d+):\s(.*)/.exec(line);
                    if (!pos || pos.length != 4) {
                        Log_1.Log.error('could not parse error description: "' + line + '"');
                        return 0;
                    }
                    let lineNr = +pos[1] - 1;
                    let charNr = +pos[2] - 1;
                    let message = pos[3].trim();
                    //for Marktoberdorf
                    let tag;
                    if (line.indexOf("[") >= 0 && line.indexOf("]") >= 0) {
                        tag = line.substring(line.indexOf("[") + 1, line.indexOf("]"));
                        if (tag == "typechecker.error") {
                            this.typeCheckingCompleted = false;
                        }
                        else if (tag == "parser.error") {
                            this.parsingCompleted = false;
                            this.typeCheckingCompleted = false;
                        }
                    }
                    Log_1.Log.log(`Error: [${ServerClass_1.Server.backend.name}] ${tag ? "[" + tag + "] " : ""}${lineNr + 1}:${charNr + 1} ${message}`, ViperProtocol_1.LogLevel.Default);
                    this.diagnostics.push({
                        range: {
                            start: { line: lineNr, character: charNr },
                            end: { line: lineNr, character: 10000 } //Number.max does not work -> 10000 is an arbitrary large number that does the job
                        },
                        source: null,
                        severity: vscode_languageserver_1.DiagnosticSeverity.Error,
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
    extractNumber(s) {
        let regex = /^.*?(\d+)([\.,](\d+))?.*$/.exec(s);
        if (regex && regex[1] && regex[3]) {
            return Number.parseFloat(regex[1] + "." + regex[3]);
        }
        else if (regex && regex[1]) {
            return Number.parseInt(regex[1]);
        }
        Log_1.Log.error("Error extracting number from \"" + s + "\"");
        return 0;
    }
    completeVerificationState() {
        this.stateIndicesOrderedByPosition = [];
        let symbExLogIndex = 0;
        let lastMatchingLogIndex = -1;
        let methodIndex = -1;
        this.steps.forEach((element, i) => {
            if (element.canBeShownAsDecoration) {
                this.stateIndicesOrderedByPosition.push({ index: element.index, position: element.position });
            }
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
        if (!this.running)
            return;
        Log_1.Log.log('Abort running verification', ViperProtocol_1.LogLevel.Info);
        this.aborting = true;
        //remove impact of child_process to kill
        this.verifierProcess.removeAllListeners('close');
        this.verifierProcess.stdout.removeAllListeners('data');
        this.verifierProcess.stderr.removeAllListeners('data');
        //log the exit of the child_process to kill
        this.verifierProcess.on('exit', (code, signal) => {
            Log_1.Log.log(`Child process exited with code ${code} and signal ${signal}`, ViperProtocol_1.LogLevel.Debug);
        });
        this.verifierProcess.kill('SIGINT');
        let l = this.verifierProcess.listeners;
        this.running = false;
        this.lastSuccess = ViperProtocol_1.Success.Aborted;
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
            let symbExLogPath = pathHelper.join(ServerClass_1.Server.workspaceRoot, ".vscode", "executionTreeData.js");
            if (fs.existsSync(symbExLogPath)) {
                let content = fs.readFileSync(symbExLogPath).toString();
                content = content.substring(content.indexOf("["), content.length).replace(/\n/g, ' ');
                this.completeSymbExLog = JSON.parse(content);
                Log_1.Log.log("Execution tree successfully loaded: " + this.completeSymbExLog.length + " toplevel construct" + (this.completeSymbExLog.length == 1 ? "" : "s") + " found", ViperProtocol_1.LogLevel.Info);
                //parse SymbexLog
                this.steps = [];
                this.verifiables = [];
                this.completeSymbExLog.forEach(data => {
                    let index = this.verifiables.length;
                    this.verifiables.push(new Verifiable_1.Verifiable(index, data, this));
                });
            }
            else {
                Log_1.Log.log("No executionTreeData.js found");
            }
        }
        catch (e) {
            Log_1.Log.error("Error loading SymbExLog from file: " + e);
        }
    }
    //URI helper Methods
    static uriToPath(uri) {
        return new Promise((resolve, reject) => {
            //input check
            if (!uri.startsWith("file:")) {
                Log_1.Log.error("cannot convert uri to filepath, uri: " + uri);
                return resolve(uri);
            }
            VerificationTask.connection.sendRequest(ViperProtocol_1.Commands.UriToPath, uri).then((path) => {
                return resolve(path);
            });
        });
    }
    static pathToUri(path) {
        return new Promise((resolve, reject) => {
            //input check
            if (path.startsWith("file")) {
                Log_1.Log.error("cannot convert path to uri, path: " + path);
                return resolve(path);
            }
            VerificationTask.connection.sendRequest(ViperProtocol_1.Commands.PathToUri, path).then((uri) => {
                return resolve(uri);
            });
        });
    }
}
exports.VerificationTask = VerificationTask;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmVyaWZpY2F0aW9uVGFzay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmVyaWZpY2F0aW9uVGFzay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFHYix3Q0FBNEQsdUJBQXVCLENBQUMsQ0FBQTtBQUNwRiwyQkFBdUIsWUFDdkIsQ0FBQyxDQURrQztBQUNuQyxnQ0FBeVAsaUJBQ3pQLENBQUMsQ0FEeVE7QUFDMVEsc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBRzFCLHdCQUFvQixTQUFTLENBQUMsQ0FBQTtBQUM5QixNQUFZLFVBQVUsV0FBTSxNQUFNLENBQUMsQ0FBQTtBQUNuQyxpQ0FBNkIsa0JBQWtCLENBQUMsQ0FBQTtBQUNoRCxnQ0FBNEIsaUJBQWlCLENBQUMsQ0FBQTtBQUM5Qyw4QkFBcUIsZUFBZSxDQUFDLENBQUE7QUFDckMsOEJBQTBCLGVBQWUsQ0FBQyxDQUFBO0FBQzFDLE1BQVksRUFBRSxXQUFNLElBQUksQ0FBQyxDQUFBO0FBQ3pCLDZCQUF5QixjQUFjLENBQUMsQ0FBQTtBQVl4QztJQXlDSSxZQUFZLE9BQWUsRUFBRSxjQUE4QixFQUFFLFVBQXVCO1FBeENwRixPQUFPO1FBQ1AsWUFBTyxHQUFZLEtBQUssQ0FBQztRQUN6QixhQUFRLEdBQVksS0FBSyxDQUFDO1FBRTFCLFVBQUssR0FBc0IsaUNBQWlCLENBQUMsT0FBTyxDQUFDO1FBVXJELG1CQUFtQjtRQUNYLFVBQUssR0FBYSxFQUFFLENBQUM7UUFDckIsZ0JBQVcsR0FBWSxLQUFLLENBQUM7UUFDN0IsZ0JBQVcsR0FBVyxFQUFFLENBQUM7UUFDekIsZ0JBQVcsR0FBVyxDQUFDLENBQUM7UUFDeEIsNEJBQXVCLEdBQVksS0FBSyxDQUFDO1FBQ2pELGdDQUFnQztRQUVoQyxzQkFBc0I7UUFDdEIsU0FBSSxHQUFXLENBQUMsQ0FBQztRQUlqQixVQUFLLEdBQVUsSUFBSSxhQUFLLEVBQUUsQ0FBQztRQUMzQixnQkFB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TUFBTSxDQUFDLENBQUMsQ0FBQztRQUNqQixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVILE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNkLENBQUM7UUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxTQUFTLEtBQUssQ0FBQyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQzlGLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QyxDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ2IsQ0FBQztJQUNMLENBQUM7SUFFTyxlQUFlLENBQUMsQ0FBVyxFQUFFLENBQVc7UUFDNUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ3ZCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNqQixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxJQUFJLElB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