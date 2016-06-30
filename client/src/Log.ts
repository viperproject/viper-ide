'use strict';

import * as vscode from "vscode";
import * as path from 'path';
import * as fs from 'fs';

export class Log {

    static logFilePath = "./viper_log";
    static logFile: fs.WriteStream;
    static outputChannel = vscode.window.createOutputChannel('Viper');

    public static initialize(context: vscode.ExtensionContext) {
        Log.logFilePath = context.asAbsolutePath(Log.logFilePath);
        Log.log("LogFilePath is: " + Log.logFilePath)
        try {
            fs.closeSync(fs.openSync(Log.logFilePath, 'w'));
            fs.accessSync(Log.logFilePath);
            Log.logFile = fs.createWriteStream(Log.logFilePath);
            //make sure the logFile is closed when the extension is closed
            context.subscriptions.push(new Log());
        } catch (e) {
            Log.log("cannot write to LogFile, access denied. " + e)
        }
    }

    public static log(message: string) {
        console.log(message);
        let messageNewLine = message + "\n";
        Log.outputChannel.append(messageNewLine);
        if (Log.logFile) {
            Log.logFile.write(messageNewLine);
        }
    }

    public static toLogFile(message: string) {
        let messageNewLine = message + "\n";
        if (Log.logFile) {
            Log.logFile.write(messageNewLine);
        }
    }

    public static error(message: string) {
        console.error(message);
        let messageNewLine = "ERROR: " + message + "\n";
        Log.outputChannel.append(messageNewLine);
        if (Log.logFile) {
            Log.logFile.write(messageNewLine);
        }
    }

    public dispose() {
        Log.logFile.close();
    }

    public static hint(message:string){
        vscode.window.showInformationMessage("Viper: "+ message);
    }
}