'use strict';

import * as vscode from "vscode";
import * as path from 'path';
import * as fs from 'fs';
import { LogLevel } from './ViperProtocol';
import { Helper } from './Helper';
const os = require('os');

export class Log {
    static logFileName = "viper.log";
    static tempDirectory = path.join(os.tmpDir(), ".vscode");
    static logFilePath: string;
    static logFile: fs.WriteStream;
    static outputChannel = vscode.window.createOutputChannel('Viper');
    static logLevel: LogLevel;

    public static initialize() {
        try {
            Log.updateSettings();
            //create logfile if it wasn't created before
            if (!fs.existsSync(this.tempDirectory)) {
                fs.mkdirSync(this.tempDirectory);
            }
            if (!this.logFile) {
                this.logFilePath = path.join(this.tempDirectory, "viper.log");

                let logFilePath = path.join(this.tempDirectory, Log.logFileName);
                Log.log('The logFile is located at: "' + logFilePath + '"', LogLevel.Info)
                try {
                    Log.createFile(logFilePath);
                    Log.logFile = fs.createWriteStream(logFilePath);
                    //make sure the logFile is closed when the extension is closed
                } catch (e) {
                    Log.error("Error creating logFile at: " + logFilePath + ", access denied. " + e)
                }
            }
        } catch (e) {
            Log.error("Error initializing Log: " + e)
        }
        this.selfCheck();
    }

    public static selfCheck(logLevel: LogLevel = LogLevel.Debug): boolean {
        let initialized = true;
        if (!this.logFilePath) {
            Log.log("The path to the logFile is not known.",logLevel);
            initialized = false;
        }
        if (!this.logFile) {
            Log.log("There is no logFile, no messages can be written to the file.",logLevel);
            initialized = false;
        }
        if (!this.outputChannel) {
            Log.log("The ouput channel was not set up correctly, no messages can be written to the output panel.",logLevel);
            initialized = false;
        }
        if(!this.logLevel){
            Log.log("The verbosity of the output is not set, all messages are output.",logLevel);
            initialized = false;
        }
        if(!initialized){
            Log.error("There were problems initializing the logging system.");
        }
        return initialized;
    }

    private static createFile(filePath: string) {
        if (!fs.existsSync(filePath)) {
            fs.closeSync(fs.openSync(filePath, 'w'));
            fs.accessSync(filePath);
        }
    }

    public static deleteFile(fileName: string) {
        try {
            if (fs.existsSync(fileName)) {
                fs.unlinkSync(fileName);
            };
        } catch (e) {
            Log.error("Error deleting file " + fileName + ": " + e);
        }
    }

    public static updateSettings() {
        let oldLogLevel = Log.logLevel;
        Log.logLevel = Helper.getConfiguration("preferences").logLevel || LogLevel.Default;
        if (oldLogLevel != Log.logLevel) {
            if (oldLogLevel) {
                Log.log(`The logLevel was changed from ${LogLevel[oldLogLevel]} to ${LogLevel[Log.logLevel]}`, LogLevel.LowLevelDebug);
            } else {
                Log.log(`The logLevel was set to ${LogLevel[Log.logLevel]}`, LogLevel.LowLevelDebug);
            }
        }
    }

    public static log(message: string, logLevel: LogLevel = LogLevel.Default) {
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

    private static prefix(logLevel: LogLevel): string {
        if (logLevel <= LogLevel.Info)
            return "";
        if (logLevel == LogLevel.Debug)
            return "> ";
        if (logLevel == LogLevel.Verbose)
            return "- ";
        if (logLevel == LogLevel.LowLevelDebug) {
            return ". ";
        }

    }

    public static toLogFile(message: string, logLevel: LogLevel = LogLevel.Default) {
        if (Log.logLevel >= logLevel && Log.logFile) {
            let messageNewLine = message + "\n";
            Log.logFile.write(messageNewLine);
        }
    }

    public static error(message: string, logLevel: LogLevel = LogLevel.Debug) {
        let messageNewLine = "ERROR: " + message + "\n";
        if (Log.logLevel >= logLevel && Log.logFile) {
            console.error(message);
            Log.outputChannel.append(messageNewLine);
        }
        if (Log.logFile) {
            Log.logFile.write(messageNewLine);
        }
    }

    public static dispose() {
        Log.logFile.close();
    }

    public static hint(message: string) {
        Log.log("H: " + message, LogLevel.Debug);
        vscode.window.showInformationMessage("Viper: " + message);
    }
}