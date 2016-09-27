'use strict';
const vscode = require("vscode");
const path = require('path');
const fs = require('fs');
const ViperProtocol_1 = require('./ViperProtocol');
const Helper_1 = require('./Helper');
class Log {
    static initialize() {
        try {
            Log.updateSettings();
        }
        catch (e) {
            Log.error("Error initializing Log: " + e);
        }
    }
    static getSymbExLogPath() {
        if (!Log.tempDirectory) {
            Log.error("Don't try to access the symbExLogPath before the tempDirectory path is set");
            return;
        }
        return path.join(Log.tempDirectory, 'executionTreeData.js');
    }
    static getSymbExDotPath() {
        if (!Log.tempDirectory) {
            Log.error("Don't try to access the symbExDotPath before the tempDirectory path is set");
            return;
        }
        return path.join(Log.tempDirectory, 'dot_input.dot');
    }
    static getSymbExSvgPath() {
        if (!Log.tempDirectory) {
            Log.error("Don't try to access the symbExSvgPath before the tempDirectory path is set");
            return;
        }
        return path.join(Log.tempDirectory, 'symbExLoggerOutput.svg');
    }
    ///return the path to the indexth dot file
    ///creates non existing files
    static dotFilePath(index, oldHeap) {
        if (!Log.tempDirectory) {
            Log.error("Don't try to access the dotFiles before the tempDirectory path is set");
            return;
        }
        let basePath = path.join(Log.tempDirectory, 'heap');
        let old = oldHeap ? "_old" : "";
        if (index < 0) {
            Log.error("don't use negative indices for dotFilePath");
            return basePath + old + ".dot";
        }
        if (index >= this.MAX_DOT_FILES) {
            Log.error("don't use more than " + this.MAX_DOT_FILES + " dotFiles");
            return basePath + old + ".dot";
        }
        return basePath + index + old + ".dot";
    }
    static svgFilePath(index, oldHeap) {
        if (!Log.tempDirectory) {
            Log.error("Don't try to access the svgFiles before the tempDirectory path is set");
            return;
        }
        let basePath = path.join(Log.tempDirectory, 'heap');
        let old = oldHeap ? "_old" : "";
        if (index < 0) {
            Log.error("don't use negative indices for svgFilePath");
            return basePath + old + ".svg";
        }
        if (index >= this.MAX_DOT_FILES) {
            Log.error("don't use more than " + this.MAX_DOT_FILES + " svgFiles");
            return basePath + old + ".svg";
        }
        return basePath + index + old + ".svg";
    }
    static createFile(filePath) {
        if (!fs.existsSync(filePath)) {
            fs.closeSync(fs.openSync(filePath, 'w'));
            fs.accessSync(filePath);
        }
    }
    static writeToDotFile(graphDescription, oldHeap, index) {
        //delete and recreate file to fix the problem of not being able to open the dot files      
        let dotFilePath = this.dotFilePath(index, oldHeap);
        this.createFile(dotFilePath);
        let dotFile = fs.createWriteStream(dotFilePath);
        dotFile.write(graphDescription);
        dotFile.close();
    }
    static deleteDotFiles() {
        //delete all dotFiles
        for (let i = 0; i < this.MAX_DOT_FILES; i++) {
            this.deleteFile(this.dotFilePath(i, true));
            this.deleteFile(this.dotFilePath(i, false));
        }
        this._nofFiles = 0;
    }
    static deleteFile(fileName) {
        try {
            if (fs.existsSync(fileName)) {
                fs.unlinkSync(fileName);
            }
            ;
        }
        catch (e) {
            Log.error("Error deleting file " + fileName);
        }
    }
    static updateSettings() {
        let oldLogLevel = Log.logLevel;
        Log.logLevel = Helper_1.Helper.getConfiguration("preferences").logLevel || ViperProtocol_1.LogLevel.Default;
        if (oldLogLevel && oldLogLevel != Log.logLevel)
            Log.log(`The logLevel was changed from ${ViperProtocol_1.LogLevel[oldLogLevel]} to ${ViperProtocol_1.LogLevel[Log.logLevel]}`, ViperProtocol_1.LogLevel.LowLevelDebug);
    }
    static setTempDir(tempDirPath, context) {
        this.tempDirectory = tempDirPath;
        //create logfile if it wasn't created before
        if (!this.logFile) {
            let logFilePath = path.join(this.tempDirectory, Log.logFileName);
            Log.log('LogFilePath is: "' + logFilePath + '"', ViperProtocol_1.LogLevel.Info);
            try {
                Log.createFile(logFilePath);
                Log.logFile = fs.createWriteStream(logFilePath);
                //make sure the logFile is closed when the extension is closed
                context.subscriptions.push(new Log());
            }
            catch (e) {
                Log.error("cannot create logFile at: " + logFilePath + ", access denied. " + e);
            }
        }
    }
    static log(message, logLevel = ViperProtocol_1.LogLevel.Default) {
        let messageNewLine = message + "\n";
        message = this.prefix(logLevel) + message;
        if (Log.logLevel >= logLevel) {
            console.log(message);
            Log.outputChannel.append(messageNewLine);
        }
        if (Log.logFile) {
            Log.logFile.write(messageNewLine);
        }
    }
    static prefix(logLevel) {
        if (logLevel <= ViperProtocol_1.LogLevel.Info)
            return "";
        if (logLevel == ViperProtocol_1.LogLevel.Debug)
            return "> ";
        if (logLevel == ViperProtocol_1.LogLevel.Verbose)
            return "- ";
        if (logLevel == ViperProtocol_1.LogLevel.LowLevelDebug) {
            return ". ";
        }
    }
    static toLogFile(message, logLevel = ViperProtocol_1.LogLevel.Default) {
        if (Log.logLevel >= logLevel && Log.logFile) {
            let messageNewLine = message + "\n";
            Log.logFile.write(messageNewLine);
        }
    }
    static error(message, logLevel = ViperProtocol_1.LogLevel.Debug) {
        let messageNewLine = "ERROR: " + message + "\n";
        if (Log.logLevel >= logLevel && Log.logFile) {
            console.error(message);
            Log.outputChannel.append(messageNewLine);
        }
        if (Log.logFile) {
            Log.logFile.write(messageNewLine);
        }
    }
    dispose() {
        Log.logFile.close();
    }
    static hint(message) {
        Log.log("H: " + message, ViperProtocol_1.LogLevel.Debug);
        vscode.window.showInformationMessage("Viper: " + message);
    }
}
Log.logFileName = "viper.log";
Log.outputChannel = vscode.window.createOutputChannel('Viper');
Log._nofFiles = 0;
Log.MAX_DOT_FILES = 2;
exports.Log = Log;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0xvZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixNQUFZLE1BQU0sV0FBTSxRQUFRLENBQUMsQ0FBQTtBQUNqQyxNQUFZLElBQUksV0FBTSxNQUFNLENBQUMsQ0FBQTtBQUM3QixNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUN6QixnQ0FBdUIsaUJBQWlCLENBQUMsQ0FBQTtBQUN6Qyx5QkFBcUIsVUFBVSxDQUFDLENBQUE7QUFFaEM7SUFXSSxPQUFjLFVBQVU7UUFDcEIsSUFBSSxDQUFDO1lBQ0QsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBUXpCLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsR0FBRyxDQUFDLEtBQUssQ0FBQywwQkFBMEIsR0FBRyxDQUFDLENBQUMsQ0FBQTtRQUM3QyxDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQU8sZ0JBQWdCO1FBQ25CLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFDckIsR0FBRyxDQUFDLEtBQUssQ0FBQyw0RUFBNEUsQ0FBQyxDQUFDO1lBQ3hGLE1BQU0sQ0FBQztRQUNYLENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLHNCQUFzQixDQUFDLENBQUM7SUFDaEUsQ0FBQztJQUNELE9BQU8sZ0JBQWdCO1FBQ25CLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFDckIsR0FBRyxDQUFDLEtBQUssQ0FBQyw0RUFBNEUsQ0FBQyxDQUFDO1lBQ3hGLE1BQU0sQ0FBQztRQUNYLENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLGVBQWUsQ0FBQyxD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