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
    static dotFilePath: string;
    static svgFilePath: string;
    static rootPath: string;

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

        Log.dotFilePath = path.join(Log.rootPath, '.vscode', 'heap.dot');
        Log.svgFilePath = path.join(Log.rootPath, '.vscode', 'heap.svg');

        Log.log("LogFilePath is: " + Log.logFilePath, LogLevel.Debug)
        try {
            Log.createFile(Log.logFilePath);
            Log.logFile = fs.createWriteStream(Log.logFilePath);

            Log.createFile(Log.dotFilePath);
            //make sure the logFile is closed when the extension is closed
            context.subscriptions.push(new Log());
        } catch (e) {
            Log.error("cannot write to LogFile, access denied. " + e)
        }
    }

    private static createFile(filePath: string) {
        fs.closeSync(fs.openSync(filePath, 'w'));
        fs.accessSync(filePath);
    }

    public static writeToDotFile(graphDescription: string) {
        let dotFile: fs.WriteStream = fs.createWriteStream(Log.dotFilePath);
        dotFile.write(graphDescription);
        dotFile.close();
    }

    public static updateSettings() {
        let oldLogLevel = Log.logLevel;
        let settings = vscode.workspace.getConfiguration("viperSettings");
        Log.logLevel = settings.get<number>("logLevel", LogLevel.Default);
        if (oldLogLevel != Log.logLevel)
            Log.log(`The logLevel was changed from ${LogLevel[oldLogLevel]} to ${LogLevel[Log.logLevel]}`, LogLevel.Debug);
    }

    public static log(message: string, logLevel: LogLevel = LogLevel.Default) {
        let messageNewLine = message + "\n";
        if (Log.logLevel >= logLevel) {
            console.log(message);
            Log.outputChannel.append(messageNewLine);
        }
        if (Log.logFile) {
            Log.logFile.write(messageNewLine);
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