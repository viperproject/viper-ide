'use strict';
const vscode_languageserver_1 = require('vscode-languageserver');
const Settings_1 = require('./Settings');
const ViperProtocol_1 = require('./ViperProtocol');
const Log_1 = require('./Log');
const Statement_1 = require('./Statement');
const Model_1 = require('./Model');
const pathHelper = require('path');
const HeapVisualizer_1 = require('./HeapVisualizer');
const TotalProgress_1 = require('./TotalProgress');
const server_1 = require('./server');
class VerificationTask {
    constructor(fileUri, nailgunService, connection) {
        //state
        this.running = false;
        this.aborting = false;
        this.state = ViperProtocol_1.VerificationState.Stopped;
        //working variables
        this.lines = [];
        this.wrongFormat = false;
        this.isFromMethod = false;
        //verification results
        this.time = 0;
        this.model = new Model_1.Model();
        this.lastSuccess = ViperProtocol_1.Success.None;
        this.parsingCompleted = false;
        this.typeCheckingCompleted = false;
        this.fileUri = fileUri;
        this.nailgunService = nailgunService;
        VerificationTask.connection = connection;
    }
    getHeapGraphDescription(index) {
        if (index < 0 || index >= this.steps.length) {
            Log_1.Log.error("Cannot show heap at step " + index + " only states 0 - " + this.steps.length + " are valid");
            return;
        }
        let step = this.steps[index];
        if (!step) {
            Log_1.Log.error("Cannot show heap at step " + index + " step is null");
            return;
        }
        return {
            heap: HeapVisualizer_1.HeapVisualizer.heapToDot(step),
            state: index,
            fileName: this.filename,
            fileUri: this.fileUri,
            position: step.position,
            stateInfos: (this.steps[index].isErrorState ? "Error State -> use the Counter Example\n" : "") + step.pretty() + this.prettySteps()
        };
    }
    prettySteps() {
        let res = "";
        let methodIndex = 0;
        let maxLine = 0;
        let indent = "";
        let currentMethod;
        this.steps.forEach((element, i) => {
            if (i === this.methodBorders[methodIndex].firstStateIndex) {
                currentMethod = this.methodBorders[methodIndex];
                res += "\n" + currentMethod.methodName;
                if (methodIndex + 1 < this.methodBorders.length)
                    methodIndex++;
            }
            res += `\n\t${i}${"\t".repeat(element.depthLevel())} ${element.firstLine()}`;
        });
        return res;
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
        let result = [];
        //working variables
        let currDecoration = null;
        let prevStep = null;
        let label = "";
        let toolTip = "";
        let states = [];
        let stateIndexToDecorationIndex = [];
        let depths = [];
        let methodIndices = [];
        let stepInfo = [];
        this.stateIndicesOrderedByPosition.forEach(idx => {
            let step = this.steps[idx.index];
            if (!currDecoration || this.comparePosition(step.position, prevStep.position) != 0) {
                //we need a new decoration
                if (currDecoration) {
                    currDecoration.renderOptions.before.contentText = label + "⚫";
                    currDecoration.hoverMessage = toolTip;
                    currDecoration.states = states;
                    result.push(currDecoration);
                    label = "";
                    toolTip = "";
                    states = [];
                }
                currDecoration = {
                    hoverMessage: "",
                    range: {
                        start: step.position,
                        end: { line: step.position.line, character: step.position.character + 1 }
                    },
                    renderOptions: {
                        before: {
                            contentText: "⚫",
                            color: "orange",
                        }
                    },
                    states: []
                };
            }
            label += `(${step.index})`;
            toolTip += step.toToolTip() + "\n";
            states.push(step.index);
            prevStep = step;
            stepInfo[step.index] = { depth: step.depthLevel(), methodIndex: step.methodIndex, index: result.length, isErrorState: step.isErrorState };
        });
        //add the last decoration;
        if (currDecoration) {
            currDecoration.renderOptions.before.contentText = label + "⚫";
            currDecoration.hoverMessage = toolTip;
            currDecoration.states = states;
            result.push(currDecoration);
        }
        return {
            decorationOptions: result,
            stepInfo: stepInfo,
            methodBorders: this.methodBorders,
        };
    }
    verify(onlyTypeCheck, manuallyTriggered) {
        if (!manuallyTriggered && this.lastSuccess == ViperProtocol_1.Success.Error) {
            Log_1.Log.log("After an internal error, reverification has to be triggered manually.", ViperProtocol_1.LogLevel.Info);
            return;
        }
        //Initialization
        this.manuallyTriggered = manuallyTriggered;
        this.running = true;
        this.aborting = false;
        this.state = ViperProtocol_1.VerificationState.Stopped;
        this.resetDiagnostics();
        this.wrongFormat = false;
        this.steps = [];
        this.lines = [];
        this.methodBorders = [];
        this.model = new Model_1.Model();
        this.parsingCompleted = true;
        this.typeCheckingCompleted = true;
        Log_1.Log.log(server_1.Server.backend.name + ' verification started', ViperProtocol_1.LogLevel.Info);
        VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.VerificationRunning, firstTime: false });
        VerificationTask.uriToPath(this.fileUri).then((path) => {
            //start verification of current file
            this.path = path;
            this.filename = pathHelper.basename(path);
            this.verifierProcess = this.nailgunService.startVerificationProcess(path, true, onlyTypeCheck, server_1.Server.backend);
            //subscribe handlers
            this.verifierProcess.stdout.on('data', this.stdOutHandler.bind(this));
            this.verifierProcess.stderr.on('data', this.stdErrHadler.bind(this));
            this.verifierProcess.on('close', this.verificationCompletionHandler.bind(this));
            this.verifierProcess.on('exit', (code, msg) => {
                Log_1.Log.log("verifierProcess onExit: " + code + " and " + msg, ViperProtocol_1.LogLevel.Debug);
            });
        });
    }
    resetDiagnostics() {
        this.diagnostics = [];
        VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
    }
    verificationCompletionHandler(code) {
        Log_1.Log.log(`Child process exited with code ${code}`, ViperProtocol_1.LogLevel.Debug);
        if (this.aborting)
            return;
        if (code != 0 && code != 1 && code != 899) {
            Log_1.Log.log("Verification Backend Terminated Abnormaly: with code " + code, ViperProtocol_1.LogLevel.Default);
            if (Settings_1.Settings.isWin && code == null) {
                this.nailgunService.killNgDeamon();
                this.nailgunService.restartNailgunServer(VerificationTask.connection, server_1.Server.backend);
            }
        }
        //complete the information about the method borders.
        //this can only be done at the end of the verification
        this.completeVerificationState();
        // Send the computed diagnostics to VSCode.
        VerificationTask.connection.sendDiagnostics({ uri: this.fileUri, diagnostics: this.diagnostics });
        let success = ViperProtocol_1.Success.None;
        if (this.diagnostics.length == 0 && code == 0) {
            success = ViperProtocol_1.Success.Success;
        }
        else if (this.diagnostics.length > 0) {
            //use tag and backend trace as indicators for completed parsing
            if (!this.parsingCompleted && this.steps.length == 0) {
                success = ViperProtocol_1.Success.ParsingFailed;
            }
            else if (this.parsingCompleted && !this.typeCheckingCompleted) {
                success = ViperProtocol_1.Success.TypecheckingFailed;
            }
            else {
                success = ViperProtocol_1.Success.VerificationFailed;
            }
        }
        else {
            success = this.aborting ? ViperProtocol_1.Success.Aborted : ViperProtocol_1.Success.Error;
        }
        this.lastSuccess = success;
        VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, {
            newState: ViperProtocol_1.VerificationState.Ready,
            success: success,
            manuallyTriggered: this.manuallyTriggered,
            filename: this.filename,
            nofErrors: this.diagnostics.length,
            time: this.time,
            firstTime: false
        });
        this.time = 0;
        this.running = false;
        Log_1.Log.log("Number of Steps: " + this.steps.length, ViperProtocol_1.LogLevel.Info);
        //show last state
        VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StepsAsDecorationOptions, { uri: this.fileUri, decorations: this.getDecorationOptions() });
        //let allSteps = "";
        this.steps.forEach((step) => {
            Log_1.Log.toLogFile(step.pretty(), ViperProtocol_1.LogLevel.LowLevelDebug);
            //allSteps  += "\n" +step.firstLine();
        });
        Log_1.Log.toLogFile("Model: " + this.model.pretty(), ViperProtocol_1.LogLevel.LowLevelDebug);
        //Log.toLogFile("All Steps: " + allSteps,LogLevel.LowLevelDebug);
    }
    stdErrHadler(data) {
        data = data.trim();
        if (data.length == 0)
            return;
        if (data.startsWith("at ")) {
            Log_1.Log.toLogFile(data, ViperProtocol_1.LogLevel.LowLevelDebug);
            return;
        }
        Log_1.Log.error(data, ViperProtocol_1.LogLevel.Debug);
        if (data.startsWith("connect: No error")) {
            Log_1.Log.hint("No Nailgun server is running on port " + this.nailgunService.settings.nailgunPort);
        }
        else if (data.startsWith("java.lang.NullPointerException")) {
            Log_1.Log.error("A nullpointer exception happened in the verification backend.", ViperProtocol_1.LogLevel.Default);
        }
        else if (data.startsWith("java.lang.ClassNotFoundException:")) {
            Log_1.Log.error("Class " + server_1.Server.backend.mainMethod + " is unknown to Nailgun\nFix the backend settings for " + server_1.Server.backend.name, ViperProtocol_1.LogLevel.Default);
        }
        else if (data.startsWith("java.io.IOException: Stream closed")) {
            Log_1.Log.error("A concurrency error occured, try again.", ViperProtocol_1.LogLevel.Default);
        }
        else if (data.startsWith("java.lang.StackOverflowError")) {
            Log_1.Log.error("StackOverflowError in verification backend", ViperProtocol_1.LogLevel.Default);
        }
        else if (data.startsWith("SLF4J: Class path contains multiple SLF4J bindings")) {
            Log_1.Log.error(server_1.Server.backend.name + " is referencing two versions of the backend, fix its paths in the settings", ViperProtocol_1.LogLevel.Default);
        }
    }
    stdOutHandler(data) {
        if (data.trim().length == 0) {
            return;
        }
        Log_1.Log.toLogFile(`[${server_1.Server.backend.name}: stdout]: ${data}`, ViperProtocol_1.LogLevel.LowLevelDebug);
        if (this.aborting)
            return;
        let stringData = data;
        let parts = stringData.split(/\r?\n/g);
        for (var i = 0; i < parts.length; i++) {
            let part = parts[i];
            //skip empty lines
            if (part.trim().length > 0) {
                switch (this.state) {
                    case ViperProtocol_1.VerificationState.Stopped:
                        if (part.startsWith("Command-line interface:")) {
                            Log_1.Log.error('Could not start verification -> fix customArguments for backend', ViperProtocol_1.LogLevel.Default);
                            this.state = ViperProtocol_1.VerificationState.VerificationPrintingHelp;
                        }
                        if (part.startsWith("(c) ") && part.indexOf("ETH") > 0) {
                            this.state = ViperProtocol_1.VerificationState.VerificationRunning;
                        }
                        break;
                    case ViperProtocol_1.VerificationState.VerificationRunning:
                        part = part.trim();
                        if (part.startsWith('Silicon finished in') || part.startsWith('carbon finished in')) {
                            this.state = ViperProtocol_1.VerificationState.VerificationReporting;
                            this.time = Number.parseFloat(/.*?(\d*\.\d*).*/.exec(part)[1]);
                        }
                        else if (part.startsWith('Silicon started') || part.startsWith('carbon started')) {
                        }
                        else if (part.startsWith("{\"") && part.endsWith("}")) {
                            try {
                                let progress = new TotalProgress_1.TotalProgress(JSON.parse(part));
                                Log_1.Log.log("Progress: " + progress.toPercent(), ViperProtocol_1.LogLevel.Info);
                                VerificationTask.connection.sendNotification(ViperProtocol_1.Commands.StateChange, { newState: ViperProtocol_1.VerificationState.VerificationRunning, progress: progress.toPercent(), filename: this.filename });
                            }
                            catch (e) {
                                Log_1.Log.error("Error reading progress: " + e);
                            }
                        }
                        else if (part.startsWith("\"")) {
                            if (!part.endsWith("\"")) {
                                //TODO: it can also be that the model is split among multiple stdout pieces
                                while (i + 1 < parts.length && !part.endsWith("\"")) {
                                    part += parts[++i];
                                }
                            }
                            this.model.extendModel(part);
                        }
                        else if (part.startsWith("----")) {
                            if (this.methodBorders.length > 0) {
                                this.methodBorders[this.methodBorders.length - 1].lastStateIndex = this.steps.length - 1;
                            }
                            this.methodBorders.push({ methodName: part, firstStateIndex: this.steps.length, lastStateIndex: -1, start: -1, end: -1 });
                            if (part.startsWith("---------- METHOD ")) {
                                this.isFromMethod = true;
                                continue;
                            }
                            else {
                                this.isFromMethod = false;
                                //TODO: handle method predicate or function mention if needed
                                continue;
                            }
                        }
                        else if (part.startsWith("h = ") || part.startsWith("hLHS = ")) {
                            //TODO: handle if needed
                            continue;
                        }
                        else if (part.startsWith("hR = ")) {
                            i = i + 3;
                        }
                        else if (part.startsWith('PRODUCE') || part.startsWith('CONSUME') || part.startsWith('EVAL') || part.startsWith('EXECUTE')) {
                            if (this.lines.length > 0) {
                                let msg = "Warning: Ignore " + this.lines.length + " line(s):";
                                this.lines.forEach((line) => {
                                    msg = msg + "\n\t" + line;
                                });
                                Log_1.Log.error(msg);
                                Log_1.Log.log("Next line: " + part, ViperProtocol_1.LogLevel.Debug);
                            }
                            this.lines = [];
                            this.lines.push(part);
                        }
                        else {
                            if (part.trim() == ')') {
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
                                    this.steps.push(new Statement_1.Statement(this.lines[0], this.lines[2], this.lines[3], this.lines[4], this.lines[5], this.model, this.steps.length, this.methodBorders.length - 1));
                                    this.lines = [];
                                }
                            }
                            else {
                                this.lines.push(part);
                            }
                        }
                        break;
                    case ViperProtocol_1.VerificationState.VerificationReporting:
                        if (part == 'No errors found.') {
                        }
                        else if (part.startsWith('The following errors were found')) {
                        }
                        else if (part.startsWith('  ')) {
                            let pos = /\s*(\d+):(\d+):\s(.*)/.exec(part);
                            if (pos.length != 4) {
                                Log_1.Log.error('could not parse error description: "' + part + '"');
                                continue;
                            }
                            let lineNr = +pos[1] - 1;
                            let charNr = +pos[2] - 1;
                            let message = pos[3].trim();
                            //for Marktoberdorf
                            let tag;
                            if (part.indexOf("[") >= 0 && part.indexOf("]") >= 0) {
                                tag = part.substring(part.indexOf("[") + 1, part.indexOf("]"));
                                if (tag == "typechecker.error") {
                                    this.typeCheckingCompleted = false;
                                }
                                else if (tag == "parser.error") {
                                    this.parsingCompleted = false;
                                    this.typeCheckingCompleted = false;
                                }
                            }
                            Log_1.Log.log(`Error: [${server_1.Server.backend.name}] ${tag ? "[" + tag + "] " : ""}${lineNr + 1}:${charNr + 1} ${message}`, ViperProtocol_1.LogLevel.Default);
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
                            Log_1.Log.error("Unexpected message during VerificationReporting: " + part);
                        }
                        break;
                    case ViperProtocol_1.VerificationState.VerificationPrintingHelp:
                        return;
                }
            }
        }
    }
    completeVerificationState() {
        this.methodBorders.forEach(element => {
            element.start = this.steps[element.firstStateIndex].position.line;
            if (element.lastStateIndex < 0) {
                element.lastStateIndex = this.steps.length - 1;
            }
            element.end = this.steps[element.lastStateIndex].position.line;
        });
        let methodIndex = 0;
        let maxLine = 0;
        let indent = "";
        let currentMethod;
        this.stateIndicesOrderedByPosition = [];
        this.steps.forEach((element, i) => {
            this.stateIndicesOrderedByPosition.push({ index: element.index, position: element.position });
            if (i === this.methodBorders[methodIndex].firstStateIndex) {
                currentMethod = this.methodBorders[methodIndex];
                if (methodIndex + 1 < this.methodBorders.length)
                    methodIndex++;
            }
            let isInMethod = currentMethod && element.position.line >= currentMethod.start && element.position.line <= currentMethod.end;
            if (isInMethod) {
                element.isInMethod = isInMethod;
            }
            //determine if the state is an error state
            for (let j = 0; j < this.diagnostics.length; j++) {
                let diagnostic = this.diagnostics[j];
                if (this.comparePosition(diagnostic.range.start, element.position) == 0) {
                    element.isErrorState = true;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmVyaWZpY2F0aW9uVGFzay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmVyaWZpY2F0aW9uVGFzay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFHYix3Q0FBNEQsdUJBQXVCLENBQUMsQ0FBQTtBQUNwRiwyQkFBdUIsWUFDdkIsQ0FBQyxDQURrQztBQUNuQyxnQ0FBd0gsaUJBQ3hILENBQUMsQ0FEd0k7QUFDekksc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBRTFCLDRCQUF1QyxhQUFhLENBQUMsQ0FBQTtBQUNyRCx3QkFBb0IsU0FBUyxDQUFDLENBQUE7QUFDOUIsTUFBWSxVQUFVLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFDbkMsaUNBQTZCLGtCQUFrQixDQUFDLENBQUE7QUFDaEQsZ0NBQTRCLGlCQUFpQixDQUFDLENBQUE7QUFDOUMseUJBQXFCLFVBQVUsQ0FBQyxDQUFBO0FBRWhDO0lBZ0NJLFlBQVksT0FBZSxFQUFFLGNBQThCLEVBQUUsVUFBdUI7UUEvQnBGLE9BQU87UUFDUCxZQUFPLEdBQVksS0FBSyxDQUFDO1FBQ3pCLGFBQVEsR0FBWSxLQUFLLENBQUM7UUFFMUIsVUFBSyxHQUFzQixpQ0FBaUIsQ0FBQyxPQUFPLENBQUM7UUFVckQsbUJBQW1CO1FBQ25CLFVBQUssR0FBYSxFQUFFLENBQUM7UUFDckIsZ0JBQVcsR0FBWSxLQUFLLENBQUM7UUFDN0IsaUJBQVksR0FBWSxLQUFLLENBQUM7UUFFOUIsc0JBQXNCO1FBQ3RCLFNBQUksR0FBVyxDQUFDLENBQUM7UUFHakIsVUFBSyxHQUFVLElBQUksYUFBSyxFQUFFLENBQUM7UUFDM0IsZ0JBQVcsR0FBWSx1QkFBTyxDQUFDLElBQUksQ0FBQztRQUNwQyxxQkFBZ0IsR0FBWSxLQUFLLENBQUM7UUFDbEMsMEJBQXFCLEdBQVksS0FBSyxDQUFDO1FBTW5DLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLElBQUks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