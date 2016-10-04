'use strict';
const vscode = require("vscode");
const path = require('path');
const fs = require('fs');
const ViperProtocol_1 = require('./ViperProtocol');
const Helper_1 = require('./Helper');
const os = require('os');
class Log {
    static initialize() {
        try {
            Log.updateSettings();
            // Log.rootPath = vscode.workspace.rootPath;
            // if (!Log.rootPath) {
            //     Log.rootPath = path.dirname(vscode.window.activeTextEditor.document.fileName);
            // }
            // if (!Log.rootPath) {
            //     Log.error("No rootPath found");
            // }
            //create logfile if it wasn't created before
            if (!fs.existsSync(this.tempDirectory)) {
                fs.mkdirSync(this.tempDirectory);
            }
            if (!this.logFile) {
                this.logFilePath = path.join(this.tempDirectory, "viper.log");
                let logFilePath = path.join(this.tempDirectory, Log.logFileName);
                Log.log('LogFilePath is: "' + logFilePath + '"', ViperProtocol_1.LogLevel.Info);
                try {
                    Log.createFile(logFilePath);
                    Log.logFile = fs.createWriteStream(logFilePath);
                }
                catch (e) {
                    Log.error("cannot create logFile at: " + logFilePath + ", access denied. " + e);
                }
            }
        }
        catch (e) {
            Log.error("Error initializing Log: " + e);
        }
    }
    static getSymbExLogPath() {
        return path.join(Log.tempDirectory, 'executionTreeData.js');
    }
    static getSymbExDotPath() {
        return path.join(Log.tempDirectory, 'dot_input.dot');
    }
    static getSymbExSvgPath() {
        return path.join(Log.tempDirectory, 'symbExLoggerOutput.svg');
    }
    static getPartialExecutionTreeDotPath(index) {
        let basePath = path.join(Log.tempDirectory, 'partialExecutionTree');
        if (index < 0 || index >= this.MAX_DOT_FILES) {
            return basePath + ".dot";
        }
        return basePath + index + ".dot";
    }
    static getPartialExecutionTreeSvgPath(index) {
        let basePath = path.join(Log.tempDirectory, 'partialExecutionTree');
        if (index < 0 || index >= this.MAX_DOT_FILES) {
            return basePath + ".svg";
        }
        return basePath + index + ".svg";
    }
    ///return the path to the indexth dot file
    ///creates non existing files
    static dotFilePath(index, oldHeap) {
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
    static writeToDotFile(graphDescription, dotFilePath) {
        //delete and recreate file to fix the problem of not being able to open the dot files      
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
            Log.error("Error deleting file " + fileName + ": " + e);
        }
    }
    static updateSettings() {
        let oldLogLevel = Log.logLevel;
        Log.logLevel = Helper_1.Helper.getConfiguration("preferences").logLevel || ViperProtocol_1.LogLevel.Default;
        if (oldLogLevel && oldLogLevel != Log.logLevel)
            Log.log(`The logLevel was changed from ${ViperProtocol_1.LogLevel[oldLogLevel]} to ${ViperProtocol_1.LogLevel[Log.logLevel]}`, ViperProtocol_1.LogLevel.LowLevelDebug);
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
    static dispose() {
        Log.logFile.close();
    }
    static hint(message) {
        Log.log("H: " + message, ViperProtocol_1.LogLevel.Debug);
        vscode.window.showInformationMessage("Viper: " + message);
    }
}
Log.logFileName = "viper.log";
Log.tempDirectory = path.join(os.tmpDir(), ".vscode");
Log.outputChannel = vscode.window.createOutputChannel('Viper');
Log._nofFiles = 0;
Log.MAX_DOT_FILES = 2;
exports.Log = Log;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0xvZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixNQUFZLE1BQU0sV0FBTSxRQUFRLENBQUMsQ0FBQTtBQUNqQyxNQUFZLElBQUksV0FBTSxNQUFNLENBQUMsQ0FBQTtBQUM3QixNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUN6QixnQ0FBdUIsaUJBQWlCLENBQUMsQ0FBQTtBQUN6Qyx5QkFBcUIsVUFBVSxDQUFDLENBQUE7QUFDaEMsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBRXpCO0lBVUksT0FBYyxVQUFVO1FBQ3BCLElBQUksQ0FBQztZQUNELEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNyQiw0Q0FBNEM7WUFDNUMsdUJBQXVCO1lBQ3ZCLHFGQUFxRjtZQUNyRixJQUFJO1lBQ0osdUJBQXVCO1lBQ3ZCLHNDQUFzQztZQUN0QyxJQUFJO1lBRUosNENBQTRDO1lBQzVDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNyQyxFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUNyQyxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDaEIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsV0FBVyxDQUFDLENBQUM7Z0JBRTlELElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ2pFLEdBQUcsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEdBQUcsV0FBVyxH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