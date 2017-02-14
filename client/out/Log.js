'use strict';
const vscode = require("vscode");
const path = require('path');
const fs = require('fs');
const ViperProtocol_1 = require('./ViperProtocol');
const Helper_1 = require('./Helper');
const os = require('os');
class Log {
    //    static MAX_DOT_FILES: number = 2;
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
    //NO LONGER NEEDED: since we use viz.js now:
    // static getSymbExLogPath(): string {
    //     return path.join(Log.tempDirectory, 'executionTreeData.js');
    // }
    // static getSymbExDotPath(): string {
    //     return path.join(Log.tempDirectory, 'dot_input.dot');
    // }
    // static getSymbExSvgPath(): string {
    //     return path.join(Log.tempDirectory, 'symbExLoggerOutput.svg');
    // }
    // public static getPartialExecutionTreeDotPath(index: number): string {
    //     let basePath = path.join(Log.tempDirectory, 'partialExecutionTree');
    //     if (index < 0 || index >= this.MAX_DOT_FILES) {
    //         return basePath + ".dot";
    //     }
    //     return basePath + index + ".dot";
    // }
    // public static getPartialExecutionTreeSvgPath(index: number): string {
    //     let basePath = path.join(Log.tempDirectory, 'partialExecutionTree');
    //     if (index < 0 || index >= this.MAX_DOT_FILES) {
    //         return basePath + ".svg";
    //     }
    //     return basePath + index + ".svg";
    // }
    ///return the path to the indexth dot file
    ///creates non existing files
    // public static dotFilePath(index: number, oldHeap: boolean): string {
    //     let basePath = path.join(Log.tempDirectory, 'heap');
    //     let old = oldHeap ? "_old" : "";
    //     if (index < 0) {
    //         Log.error("don't use negative indices for dotFilePath");
    //         return basePath + old + ".dot";
    //     }
    //     if (index >= this.MAX_DOT_FILES) {
    //         Log.error("don't use more than " + this.MAX_DOT_FILES + " dotFiles");
    //         return basePath + old + ".dot";
    //     }
    //     return basePath + index + old + ".dot";
    // }
    // public static svgFilePath(index: number, oldHeap: boolean): string {
    //     let basePath = path.join(Log.tempDirectory, 'heap');
    //     let old = oldHeap ? "_old" : "";
    //     if (index < 0) {
    //         Log.error("don't use negative indices for svgFilePath");
    //         return basePath + old + ".svg";
    //     }
    //     if (index >= this.MAX_DOT_FILES) {
    //         Log.error("don't use more than " + this.MAX_DOT_FILES + " svgFiles");
    //         return basePath + old + ".svg";
    //     }
    //     return basePath + index + old + ".svg";
    // }
    // public static writeToDotFile(graphDescription: string, dotFilePath: string) {
    //     //delete and recreate file to fix the problem of not being able to open the dot files      
    //     this.createFile(dotFilePath);
    //     let dotFile: fs.WriteStream = fs.createWriteStream(dotFilePath);
    //     dotFile.write(graphDescription);
    //     dotFile.close();
    // }
    // public static deleteDotFiles() {
    //     //delete all dotFiles
    //     for (let i = 0; i < this.MAX_DOT_FILES; i++) {
    //         this.deleteFile(this.dotFilePath(i, true));
    //         this.deleteFile(this.dotFilePath(i, false));
    //     }
    //     this._nofFiles = 0;
    // }
    static createFile(filePath) {
        if (!fs.existsSync(filePath)) {
            fs.closeSync(fs.openSync(filePath, 'w'));
            fs.accessSync(filePath);
        }
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
        if (oldLogLevel != Log.logLevel) {
            if (oldLogLevel) {
                Log.log(`The logLevel was changed from ${ViperProtocol_1.LogLevel[oldLogLevel]} to ${ViperProtocol_1.LogLevel[Log.logLevel]}`, ViperProtocol_1.LogLevel.LowLevelDebug);
            }
            else {
                Log.log(`The logLevel was set to ${ViperProtocol_1.LogLevel[Log.logLevel]}`, ViperProtocol_1.LogLevel.LowLevelDebug);
            }
        }
    }
    static log(message, logLevel = ViperProtocol_1.LogLevel.Default) {
        let messageNewLine = message + "\n";
        message = this.prefix(logLevel) + message;
        if (!Log.logLevel || Log.logLevel >= logLevel) {
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
exports.Log = Log;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0xvZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixNQUFZLE1BQU0sV0FBTSxRQUFRLENBQUMsQ0FBQTtBQUNqQyxNQUFZLElBQUksV0FBTSxNQUFNLENBQUMsQ0FBQTtBQUM3QixNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUN6QixnQ0FBeUIsaUJBQWlCLENBQUMsQ0FBQTtBQUMzQyx5QkFBdUIsVUFBVSxDQUFDLENBQUE7QUFDbEMsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBRXpCO0lBUUksdUNBQXVDO0lBRXZDLE9BQWMsVUFBVTtRQUNwQixJQUFJLENBQUM7WUFDRCxHQUFHLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDckIsNENBQTRDO1lBQzVDLHVCQUF1QjtZQUN2QixxRkFBcUY7WUFDckYsSUFBSTtZQUNKLHVCQUF1QjtZQUN2QixzQ0FBc0M7WUFDdEMsSUFBSTtZQUVKLDRDQUE0QztZQUM1QyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDckMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDckMsQ0FBQztZQUNELEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7Z0JBQ2hCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLFdBQVcsQ0FBQyxDQUFDO2dCQUU5RCxJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO2dCQUNqRSxHQUFHLENBQUMsR0FBRyxDQUFDLG1CQUFt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