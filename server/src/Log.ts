'use strict';

import {Commands, LogLevel} from './ViperProtocol';
import child_process = require('child_process');
import {Server} from './ServerClass';

export class Log {
    static logLevel: LogLevel = LogLevel.Default;

    static log(message: string, logLevel: LogLevel = LogLevel.Default) {
        if (Log.logLevel >= logLevel)
            Server.connection.sendNotification(Commands.Log, { data: message, logLevel: logLevel });
    }

    static toLogFile(message: string, logLevel: LogLevel = LogLevel.Default) {
        if (Log.logLevel >= logLevel)
            Server.connection.sendNotification(Commands.ToLogFile, { data: message, logLevel: logLevel });
    }

    static error(message: string, logLevel: LogLevel = LogLevel.Debug) {
        if (Log.logLevel >= logLevel)
            Server.connection.sendNotification(Commands.Error, { data: message, logLevel: logLevel });
    }

    static logWithOrigin(origin: string, message: string, logLevel: LogLevel = LogLevel.Default) {
        if (Log.logLevel >= logLevel)
            Server.connection.sendNotification(Commands.Log, { data: (logLevel >= LogLevel.Debug ? "[" + origin + "]: " : "") + message, logLevel: logLevel });
    }

    static hint(message: string) {
        Server.connection.sendNotification(Commands.Hint, message);
    }

    static logOutput(process: child_process.ChildProcess, label: string) {
        process.stdout.on('data', (data) => {
            Log.logWithOrigin(label, data, LogLevel.LowLevelDebug);
        });
        process.stdout.on('data', (data) => {
            Log.logWithOrigin(label + " error", data, LogLevel.LowLevelDebug);
        });
    }
} 