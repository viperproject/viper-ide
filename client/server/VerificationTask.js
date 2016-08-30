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
        this.lastSuccess = ViperProtocol_1.Success.None;
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
    }
    verify(manuallyTriggered) {
        if (!manuallyTriggered && this.lastSuccess == ViperProtocol_1.Success.Error) {
            Log_1.Log.log("After an internal error, reverification has to be triggered manually.", ViperProtocol_1.LogLevel.Info);
            return false;
        }
        //Initialization
        this.prepareVerification();
        this.manuallyTriggered = manuallyTriggered;
        let stage = ServerClass_1.Server.backend.stages[0];
        if (!stage) {
            Log_1.Log.error("backend " + ServerClass_1.Server.backend.name + " has no " + Settings_1.Settings.VERIFY + " stage, even though the settigns were checked.");
            return false;
        }
        ServerClass_1.Server.executedStages.push(stage);
        Log_1.Log.log(ServerClass_1.Server.backend.name + ' verification started', ViperProtocol_1.LogLevel.Info);
        VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.VerificationRunning });
        VerificationTask.uriToPath(this.fileUri).then((path) => {
            //Request the debugger to terminate it's session
            DebugServer_1.DebugServer.stopDebugging();
            //start verification of current file
            this.path = path;
            this.filename = pathHelper.basename(path);
            this.verifierProcess = this.nailgunService.startStageProcess(path, stage, this.stdOutHandler.bind(this), this.stdErrHadler.bind(this), this.completionHandler.bind(this));
        });
        return true;
    }
    resetDiagnostics() {
        this.diagnostics = [];
        VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
    }
    resetLastSuccess() {
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
        try {
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
                    Log_1.Log.error(ServerClass_1.Server.backend.name + "'s path is referencing the same class multiple times", ViperProtocol_1.LogLevel.Default);
                }
                else {
                    Log_1.Log.error(ServerClass_1.Server.backend.name + " error: " + data, ViperProtocol_1.LogLevel.Debug);
                }
            }
            else {
                Log_1.Log.error("Backend error message: " + stage.name + " " + data, ViperProtocol_1.LogLevel.Debug);
            }
        }
        catch (e) {
            Log_1.Log.error("Error handling stderr: " + e);
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
        switch (this.state) {
            case ViperProtocol_1.VerificationState.Stopped:
                if (line.startsWith("Command-line interface:")) {
                    Log_1.Log.error('Could not start verification -> fix customArguments for backend', ViperProtocol_1.LogLevel.Default);
                    this.state = ViperProtocol_1.VerificationState.VerificationPrintingHelp;
                }
                break;
            case ViperProtocol_1.VerificationState.VerificationRunning:
                line = line.trim();
                //progress message
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
                    this.model.extendModel(line);
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
                this.symbExLog = JSON.parse(content);
                Log_1.Log.log("Execution tree successfully loaded: " + this.symbExLog.length + " toplevel construct" + (this.symbExLog.length == 1 ? "" : "s") + " found", ViperProtocol_1.LogLevel.Info);
                //parse SymbexLog
                this.steps = [];
                this.verifiables = [];
                this.symbExLog.forEach(data => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmVyaWZpY2F0aW9uVGFzay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmVyaWZpY2F0aW9uVGFzay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFHYix3Q0FBNEQsdUJBQXVCLENBQUMsQ0FBQTtBQUNwRiwyQkFBdUIsWUFDdkIsQ0FBQyxDQURrQztBQUNuQyxnQ0FBaVAsaUJBQ2pQLENBQUMsQ0FEaVE7QUFDbFEsc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBRzFCLHdCQUFvQixTQUFTLENBQUMsQ0FBQTtBQUM5QixNQUFZLFVBQVUsV0FBTSxNQUFNLENBQUMsQ0FBQTtBQUNuQyxpQ0FBNkIsa0JBQWtCLENBQUMsQ0FBQTtBQUNoRCxnQ0FBNEIsaUJBQWlCLENBQUMsQ0FBQTtBQUM5Qyw4QkFBcUIsZUFBZSxDQUFDLENBQUE7QUFDckMsOEJBQTBCLGVBQWUsQ0FBQyxDQUFBO0FBQzFDLE1BQVksRUFBRSxXQUFNLElBQUksQ0FBQyxDQUFBO0FBQ3pCLDZCQUF5QixjQUFjLENBQUMsQ0FBQTtBQUV4QztJQWdDSSxZQUFZLE9BQWUsRUFBRSxjQUE4QixFQUFFLFVBQXVCO1FBeEJwRixnQkFBVyxHQUFZLHVCQUFPLENBQUMsSUFBSSxDQUFDO1FBRXBDLG9DQUFvQztRQUNwQyxZQUFPLEdBQVksS0FBSyxDQUFDO1FBQ3pCLGFBQVEsR0FBWSxLQUFLLENBQUM7UUFDMUIsVUFBSyxHQUFzQixpQ0FBaUIsQ0FBQyxPQUFPLENBQUM7UUFHckQsbUJBQW1CO1FBQ1gsVUFBSyxHQUFhLEVBQUUsQ0FBQztRQUNyQixnQkFBVyxHQUFZLEtBQUssQ0FBQztRQUM3QixnQkFBVyxHQUFXLEVBQUUsQ0FBQztRQUNqQyxzQkFBc0I7UUFDdEIsU0FBSSxHQUFXLENBQUMsQ0FBQztRQUlqQixVQUFLLEdBQVUsSUFBSSxhQUFLLEVBQUUsQ0FBQztRQUMzQixxQkFBZ0IsR0FBWSxLQUFLLENBQUM7UUFDbEMsMEJB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LFFBQVEsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1SCxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDZCxDQUFDO1FBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsU0FBUyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUM5RixNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEMsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNiLENBQUM7SUFDTCxDQUFDO0lBRU8sZUFBZSxDQUFDLENBQVcsRUFBRSxDQUFXO1FBQzVDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUN2QixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsQixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDakIsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLFNB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