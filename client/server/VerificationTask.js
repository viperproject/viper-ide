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
                        this.nailgunService.killNgDeamon().then(resolve => {
                            this.nailgunService.restartNailgunServer(VerificationTask.connection, ServerClass_1.Server.backend);
                        });
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
                        VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.Stage, stage: newStage.name, filename: this.filename });
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
                if (data.startsWith("NailGun v")) {
                    Log_1.Log.hint("Fix the customArguments in the settings of backend: " + ServerClass_1.Server.backend.name + " stage: " + ServerClass_1.Server.stage().name);
                }
                else if (data.startsWith("connect: No error")) {
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
                    Log_1.Log.error(ServerClass_1.Server.backend.name + "'s path is referencing the same class multiple times", ViperProtocol_1.LogLevel.Info);
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
                    Log_1.Log.log("State -> Error_Reporting", ViperProtocol_1.LogLevel.Info);
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
                Log_1.Log.log("No executionTreeData.js found", ViperProtocol_1.LogLevel.Debug);
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