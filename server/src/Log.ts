/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
 
'use strict';

import { Progress, Commands, LogLevel } from './ViperProtocol';
import child_process = require('child_process');
import { Server } from './ServerClass';

export class Log {
    static logLevel: LogLevel = LogLevel.Default;

    static log(message: string, logLevel: LogLevel) {
        Server.sendLogMessage(Commands.Log, { data: message, logLevel: logLevel });
    }

    static startProgress() {
        this.lastProgress = 0;
    }

    private static lastProgress: number;

    static progress(domain: string, cur, len, logLevel: LogLevel) {
        let progress = 100.0 * cur / len
        if (Math.floor(progress) > this.lastProgress) {
            this.lastProgress = progress;
            let data: Progress = { domain: domain, current: cur, total: len }
            Server.sendProgressMessage({ data: data, logLevel: logLevel });
        }
    }

    static toLogFile(message: string, logLevel: LogLevel = LogLevel.Default) {
        Server.sendLogMessage(Commands.ToLogFile, { data: message, logLevel: logLevel });
    }

    static error(message: string, logLevel: LogLevel = LogLevel.Debug) {
        Server.sendLogMessage(Commands.Error, { data: message, logLevel: logLevel });
    }

    static logWithOrigin(origin: string, message: string, logLevel: LogLevel) {
        if (message) {
            Server.sendLogMessage(Commands.Log, { data: (logLevel >= LogLevel.Debug ? "[" + origin + "]: " : "") + message, logLevel: logLevel });
        }
    }

    static hint(message: string, showSettingsButton = false, showViperToolsUpdateButton = false) {
        Server.connection.sendNotification(Commands.Hint, { message: message, showSettingsButton: showSettingsButton, showViperToolsUpdateButton: showViperToolsUpdateButton });
    }

    static logOutput(process: child_process.ChildProcess, label: string) {
        process.stdout.on('data', (data: string) => {
            Log.logWithOrigin(label, data, LogLevel.LowLevelDebug);
        });
        process.stdout.on('data', (data: string) => {
            Log.logWithOrigin(label + " error", data, LogLevel.LowLevelDebug);
        });
    }
} 