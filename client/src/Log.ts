'use strict';

import * as vscode from "vscode";
import * as path from 'path';
import * as fs from 'fs';
import {LogLevel} from './ViperProtocol';

export class Log {

    static logFilePath = "viper_log";
    static logFile: fs.WriteStream;
    static outputChannel = vscode.window.createOutputChannel('Viper');
    static logLevel: LogLevel;
    static _dotBasePath: string;
    static _svgBasePath: string;
    private static _nofFiles: number = 0;
    static rootPath: string;

    static MAX_DOT_FILES: number = 2;

    public static initialize(context: vscode.ExtensionContext) {
        Log.updateSettings();
        Log.rootPath = vscode.workspace.rootPath;
        if (!Log.rootPath) {
            Log.rootPath = path.dirname(vscode.window.activeTextEditor.document.fileName);
        }
        Log.logFilePath = path.join(Log.rootPath, '.vscode', Log.logFilePath);
        //create .vscode folder if not there yet
        if (!fs.existsSync(path.join(Log.rootPath, '.vscode'))) {
            fs.mkdirSync(path.join(Log.rootPath, '.vscode'));
        }

        Log._dotBasePath = path.join(Log.rootPath, '.vscode', 'heap');
        Log._svgBasePath = path.join(Log.rootPath, '.vscode', 'heap');

        Log.log("LogFilePath is: " + Log.logFilePath, LogLevel.LowLevelDebug)
        try {
            Log.createFile(Log.logFilePath);
            Log.logFile = fs.createWriteStream(Log.logFilePath);

            //make sure the logFile is closed when the extension is closed
            context.subscriptions.push(new Log());
        } catch (e) {
            Log.error("cannot write to LogFile, access denied. " + e)
        }
    }

    ///return the path to the indexth dot file
    ///creates non existing files
    public static dotFilePath(index: number): string {
        if (index < 0) {
            Log.error("don't use negative indices for dotFilePath");
            return this._dotBasePath + ".dot";
        }
        if (index >= this.MAX_DOT_FILES) {
            Log.error("don't use more than " + this.MAX_DOT_FILES + " dotFiles");
            return this._dotBasePath + ".dot";
        }
        return this._dotBasePath + index + ".dot";
    }

    public static svgFilePath(index: number): string {
        if (index < 0) {
            Log.error("don't use negative indices for svgFilePath");
            return this._svgBasePath + ".svg";
        }
        if (index >= this.MAX_DOT_FILES) {
            Log.error("don't use more than " + this.MAX_DOT_FILES + " svgFiles");
            return this._svgBasePath + ".svg";
        }
        return this._svgBasePath + index + ".svg";
    }

    private static createFile(filePath: string) {
        if (!fs.existsSync(filePath)) {
            fs.closeSync(fs.openSync(filePath, 'w'));
            fs.accessSync(filePath);
        }
    }

    public static writeToDotFile(graphDescription: string, index: number) {
        //delete and recreate file to fix the problem of not being able to open the dot files      
        let dotFilePath = this.dotFilePath(index);
        this.createFile(dotFilePath);
        let dotFile: fs.WriteStream = fs.createWriteStream(dotFilePath);
        dotFile.write(graphDescription);
        dotFile.close();
    }

    public static deleteDotFiles() {
        //delete all dotFiles
        for (let i = 0; i < this.MAX_DOT_FILES; i++) {
            this.deleteDotFile(i);
        }
        this._nofFiles = 0;
    }

    public static deleteDotFile(index: number) {
        let dotFile = this.dotFilePath(index);
        if (fs.existsSync(dotFile)) {
            fs.unlinkSync(dotFile);
        };
    }

    public static updateSettings() {
        let oldLogLevel = Log.logLevel;
        let settings = vscode.workspace.getConfiguration("viperSettings");
        Log.logLevel = settings.get<number>("logLevel", LogLevel.Default);
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
        if(logLevel == LogLevel.Debug)
            return "> ";
        if(logLevel > LogLevel.Debug){
            return "- ";
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

    public dispose() {
        Log.logFile.close();
    }

    public static hint(message: string) {
        Log.log("H: " + message, LogLevel.Debug);
        vscode.window.showInformationMessage("Viper: " + message);
    }
}