'use strict';

import {IConnection} from 'vscode-languageserver';
import {Commands, LogLevel} from './ViperProtocol';
import child_process = require('child_process'); 

export class Log {
    static logLevel: LogLevel = LogLevel.Default;
    static connection: IConnection;

    static log(message: string, logLevel: LogLevel = LogLevel.Default) {
        if (Log.logLevel >= logLevel)
            this.connection.sendNotification(Commands.Log, message);
    }

    static toLogFile(message: string, logLevel: LogLevel = LogLevel.Default) {
        if (Log.logLevel >= logLevel)
            this.connection.sendNotification(Commands.ToLogFile, message);
    }

    static error(message: string, logLevel: LogLevel = LogLevel.Debug) {
        if (Log.logLevel >= logLevel)
            this.connection.sendNotification(Commands.Error, message);
    }

    static logWithOrigin(origin: string, message: string, logLevel: LogLevel = LogLevel.Default) {
        if (Log.logLevel >= logLevel)
            this.connection.sendNotification(Commands.Log, (logLevel >= LogLevel.Debug ? "["+origin + "]: " : "") + message);
    }

    static hint(message: string) {
        this.connection.sendNotification(Commands.Hint, message);
    }

    static logOutput(process: child_process.ChildProcess,label:string) {
        process.stdout.on('data', (data) => {
            Log.logWithOrigin(label, data, LogLevel.LowLevelDebug);
        });
        process.stdout.on('data', (data) => {
            Log.logWithOrigin(label+" error", data, LogLevel.LowLevelDebug);
        });
    }
} 