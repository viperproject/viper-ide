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
            //create logfile if it wasn't created before
            if (!fs.existsSync(this.tempDirectory)) {
                fs.mkdirSync(this.tempDirectory);
            }
            if (!this.logFile) {
                this.logFilePath = path.join(this.tempDirectory, "viper.log");
                let logFilePath = path.join(this.tempDirectory, Log.logFileName);
                Log.log('The logFile is located at: "' + logFilePath + '"', ViperProtocol_1.LogLevel.Info);
                try {
                    Log.createFile(logFilePath);
                    Log.logFile = fs.createWriteStream(logFilePath);
                }
                catch (e) {
                    Log.error("Error creating logFile at: " + logFilePath + ", access denied. " + e);
                }
            }
        }
        catch (e) {
            Log.error("Error initializing Log: " + e);
        }
        this.selfCheck();
    }
    static selfCheck(logLevel = ViperProtocol_1.LogLevel.Debug) {
        let initialized = true;
        if (!this.logFilePath) {
            Log.log("The path to the logFile is not known.", logLevel);
            initialized = false;
        }
        if (!this.logFile) {
            Log.log("There is no logFile, no messages can be written to the file.", logLevel);
            initialized = false;
        }
        if (!this.outputChannel) {
            Log.log("The ouput channel was not set up correctly, no messages can be written to the output panel.", logLevel);
            initialized = false;
        }
        if (!this.logLevel) {
            Log.log("The verbosity of the output is not set, all messages are output.", logLevel);
            initialized = false;
        }
        if (!initialized) {
            Log.error("There were problems initializing the logging system.");
        }
        return initialized;
    }
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
exports.Log = Log;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0xvZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixNQUFZLE1BQU0sV0FBTSxRQUFRLENBQUMsQ0FBQTtBQUNqQyxNQUFZLElBQUksV0FBTSxNQUFNLENBQUMsQ0FBQTtBQUM3QixNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUN6QixnQ0FBeUIsaUJBQWlCLENBQUMsQ0FBQTtBQUMzQyx5QkFBdUIsVUFBVSxDQUFDLENBQUE7QUFDbEMsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBRXpCO0lBUUksT0FBYyxVQUFVO1FBQ3BCLElBQUksQ0FBQztZQUNELEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNyQiw0Q0FBNEM7WUFDNUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JDLEVBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ3JDLENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUNoQixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxXQUFXLENBQUMsQ0FBQztnQkFFOUQsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztnQkFDakUsR0FBRyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsR0FBRyxXQUFXLEdBQUcsR0FBRyxFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUE7Z0JBQzFFLElBQUksQ0FBQztvQkFDRCxHQUFHLENBQUMsVUFBVSxDQUFDLFdB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