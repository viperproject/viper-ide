import * as vscode from "vscode";


export enum LogLevel {
    DEBUG,
    INFO,
    WARNING,
    ERROR
}


// TODO: Implement proper logging
export class Logger {

    private static outputChannel = vscode.window.createOutputChannel("Viper Debugger");
    private static logLevel: LogLevel = LogLevel.INFO;

    private static log(message: string, level: LogLevel) {
        if (level >= Logger.logLevel) {
            Logger.outputChannel.appendLine(message);
        }
    }

    public static setLogLevel(logLevel: LogLevel) {
        if (logLevel > LogLevel.WARNING) {
            vscode.window.showWarningMessage(
                `Setting Viper Debugger log level to ${logLevel}, warning messages will not be printed.`
            );
        }
    }

    public static info(message: string): void {
        Logger.log(message, LogLevel.INFO);
    }

    public static debug(message: string): void {
        Logger.log(message, LogLevel.DEBUG);
    }

    public static error(message: string): void {
        Logger.log('[ERROR] ' + message, LogLevel.ERROR);
    }

    public static warn(message: string): void {
        Logger.log('[WARNING] ' + message, LogLevel.WARNING);
    }
}