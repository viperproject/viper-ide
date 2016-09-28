'use strict';

import * as vscode from "vscode";
import * as path from 'path';
import * as fs from 'fs';
import {LogLevel} from './ViperProtocol';
import {Helper} from './Helper';
const os = require('os');

export class Log {
    static logFileName = "viper.log";
    static tempDirectory = path.join(os.tmpDir(), ".vscode");
    static logFilePath: string;
    static logFile: fs.WriteStream;
    static outputChannel = vscode.window.createOutputChannel('Viper');
    static logLevel: LogLevel;
    private static _nofFiles: number = 0;
    static MAX_DOT_FILES: number = 2;

    public static initialize() {
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
                Log.log('LogFilePath is: "' + logFilePath + '"', LogLevel.Info)
                try {
                    Log.createFile(logFilePath);
                    Log.logFile = fs.createWriteStream(logFilePath);
                    //make sure the logFile is closed when the extension is closed
                } catch (e) {
                    Log.error("cannot create logFile at: " + logFilePath + ", access denied. " + e)
                }
            }
        } catch (e) {
            Log.error("Error initializing Log: " + e)
        }
    }

    static getSymbExLogPath(): string {
        return path.join(Log.tempDirectory, 'executionTreeData.js');
    }
    static getSymbExDotPath(): string {
        return path.join(Log.tempDirectory, 'dot_input.dot');
    }
    static getSymbExSvgPath(): string {
        return path.join(Log.tempDirectory, 'symbExLoggerOutput.svg');
    }

    ///return the path to the indexth dot file
    ///creates non existing files
    public static dotFilePath(index: number, oldHeap: boolean): string {
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

    public static svgFilePath(index: number, oldHeap: boolean): string {
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

    private static createFile(filePath: string) {
        if (!fs.existsSync(filePath)) {
            fs.closeSync(fs.openSync(filePath, 'w'));
            fs.accessSync(filePath);
        }
    }

    public static writeToDotFile(graphDescription: string, oldHeap: boolean, index: number) {
        //delete and recreate file to fix the problem of not being able to open the dot files      
        let dotFilePath = this.dotFilePath(index, oldHeap);
        this.createFile(dotFilePath);
        let dotFile: fs.WriteStream = fs.createWriteStream(dotFilePath);
        dotFile.write(graphDescription);
        dotFile.close();
    }

    public static deleteDotFiles() {
        //delete all dotFiles
        for (let i = 0; i < this.MAX_DOT_FILES; i++) {
            this.deleteFile(this.dotFilePath(i, true));
            this.deleteFile(this.dotFilePath(i, false));
        }
        this._nofFiles = 0;
    }

    public static deleteFile(fileName: string) {
        try {
            if (fs.existsSync(fileName)) {
                fs.unlinkSync(fileName);
            };
        } catch (e) {
            Log.error("Error deleting file " + fileName + ": "+ e);
        }
    }

    public static updateSettings() {
        let oldLogLevel = Log.logLevel;
        Log.logLevel = Helper.getConfiguration("preferences").logLevel || LogLevel.Default;
        if (oldLogLevel && oldLogLevel != Log.logLevel)
            Log.log(`The logLevel was changed from ${LogLevel[oldLogLevel]} to ${LogLevel[Log.logLevel]}`, LogLevel.LowLevelDebug);
    }

    public static log(message: string, logLevel: LogLevel = LogLevel.Default) {
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