/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2020 ETH Zurich.
  */
 
'use strict';

import * as vscode from "vscode";
import * as path from 'path';
import * as fs from 'fs';
import * as unusedFilename from 'unused-filename';
import { Progress, LogLevel } from './ViperProtocol';
import { Helper } from './Helper';
import { State } from './ExtensionState';
import { Settings } from "./Settings";

export class Log {
    static logFilePath: string;
    static logFile: fs.WriteStream;
    static outputChannel = vscode.window.createOutputChannel('Viper');
    static serverOutputChannel = vscode.window.createOutputChannel('ViperServer');
    static logLevel: LogLevel = null;
    static lastProgress: { msg: string, logLevel: LogLevel };
    private static START_TIME = new Date().getTime();

    static logTiming = true;


    public static initialize() {
        try {
            Log.updateSettings();
            if (!this.logFile) {
                const logDirectory = Helper.getLogDir();
                this.logFilePath = unusedFilename.sync(path.join(logDirectory, "viper.log"));
                Log.log('The logFile is located at: "' + this.logFilePath + '"', LogLevel.Info)
                try {
                    Log.createFile(this.logFilePath);
                    Log.logFile = fs.createWriteStream(this.logFilePath);
                    //the file is closed in dispose when the extension exits
                } catch (e) {
                    Log.error("Error creating logFile at: " + this.logFilePath + ", access denied. " + e)
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
        if (!this.serverOutputChannel) {
            Log.log("The server ouput channel was not set up correctly, no messages can be written to the output panel.", logLevel);
            initialized = false;
        }
        if (this.logLevel == null) {
            Log.log("The verbosity of the output is not set, all messages are output.", logLevel);
            initialized = false;
        }
        if (!initialized) {
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
        Log.logLevel = Settings.getLogLevel();
        if (State.unitTest) {
            // we want to keep output small during testing and in case log output matters,
            // it can be looked up in the log file. Thus, there is no reason to spam the
            // console.
            Log.logLevel = LogLevel.None;
        }
        if (oldLogLevel != Log.logLevel) {
            if (oldLogLevel == null) {
                Log.log(`The logLevel was set to ${LogLevel[Log.logLevel]}`, LogLevel.LowLevelDebug);
            } else {
                Log.log(`The logLevel was changed from ${LogLevel[oldLogLevel]} to ${LogLevel[Log.logLevel]}`, LogLevel.LowLevelDebug);
            }
        }
    }

    public static log(message: string, logLevel: LogLevel, fromServer: boolean = false) {
        if (this.lastProgress) {
            this.doLog(this.lastProgress.msg, this.lastProgress.logLevel, fromServer);
            this.lastProgress = null;
        }
        this.doLog(message, logLevel, fromServer);
    }

    private static doLog(message: string, logLevel: LogLevel, fromServer: boolean) {
        const timing = this.logTiming ? this.prettyUptime() + ' ' : '';
        const messageWithLogLevel = this.prefix(logLevel) + message;
        const messageWithTiming = timing + messageWithLogLevel;
        const serverPrefix = fromServer ? "Server: " : "";
        if (Log.logLevel == null || Log.logLevel >= logLevel) {
            console.log(serverPrefix + messageWithTiming);
            if (fromServer) {
                Log.serverOutputChannel.append(messageWithTiming + "\n");
            } else {
                Log.outputChannel.append(messageWithTiming + "\n");
            }
        }
        // write all output to the log file (independent of the configured log level):
        if (Log.logFile) {
            Log.logFile.write(serverPrefix + messageWithTiming + "\n");
        }
    }

    public static logWithOrigin(origin: string, message: string, logLevel: LogLevel) {
        if (message) {
            this.log((logLevel >= LogLevel.Debug ? "[" + origin + "]: " : "") + message, logLevel);
        }
    }

    public static progress(data: Progress, logLevel: LogLevel) {
        if (!data) return;

        let progress = (data.progress !== undefined) ? data.progress : 100.0 * data.current / data.total;
        let label = data.domain + ": " + Helper.formatProgress(progress) + (data.postfix ? ' ' + data.postfix : '');
        this.lastProgress = { msg: label, logLevel: logLevel };

        State.statusBarProgress.updateProgressBar(progress, null);
        State.statusBarItem.updateProgressLabel(data.domain, progress, data.postfix);
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
        const timing = this.logTiming ? this.prettyUptime() + ' ' : '';
        const msgWithTiming = timing + message;
        if (Log.logLevel == null || Log.logLevel >= logLevel) {
            Log.outputChannel.append(msgWithTiming + "\n");
            console.log(msgWithTiming);
        }
        if (Log.logFile) {
            Log.logFile.write(msgWithTiming + "\n");
        }
    }

    public static error(message: string, logLevel: LogLevel = LogLevel.Debug) {
        if (this.lastProgress) {
            this.log(this.lastProgress.msg, this.lastProgress.logLevel);
            this.lastProgress = null;
        }
        let timing = this.logTiming ? this.prettyUptime() + ' ' : '';
        message = "ERROR: " + message;
        // all errors should be printed independent of the log level
        console.error(timing + message);
        Log.outputChannel.append(message + "\n");
        if (Log.logFile) {
            Log.logFile.write(timing + message + "\n");
        }
    }

    public static dispose() {
        if (State.unitTest) {
            Log.log("Log: ignoring call to `dispose` because we are running in a unit test environment", LogLevel.Info);
        } else {
            Log.logFile.close();
            Log.logFile = null;
        }
    }

    public static hint(message: string, tag: string = "Viper", showSettingsButton = false, showViperToolsUpdateButton = false) {
        Log.log("H: " + tag + ": " + message, LogLevel.Debug);

        let settingsButton: vscode.MessageItem = { title: "Open Settings" };
        let updateButton: vscode.MessageItem = { title: "Update ViperTools" };
        let buttons: vscode.MessageItem[] = [];
        if (showSettingsButton) buttons.push(settingsButton);
        if (showViperToolsUpdateButton) buttons.push(updateButton);
        vscode.window.showInformationMessage(tag + ": " + message, ...buttons).then((choice) => {
            try {
                if (choice && choice.title === settingsButton.title) {
                    vscode.commands.executeCommand("workbench.action.openGlobalSettings")
                } else if (choice && choice.title === updateButton.title) {
                    vscode.commands.executeCommand("viper.updateViperTools")
                }
            } catch (e) {
                Log.error("Error accessing " + choice.title + " settings: " + e)
            }
        });
    }

    public static prettyUptime(): string {
        let uptime = new Date().getTime() - this.START_TIME;
        var hours = Math.floor(uptime / (1000 * 60 * 60));
        var minutes = Math.floor(uptime % (1000 * 60 * 60) / (1000 * 60));
        var seconds = uptime % (1000 * 60) / 1000;
        return (hours ? hours + ':' : '') +
            (minutes < 10 ? '0' : '') + minutes + ':' +
            (seconds < 10 ? '0' : '') + seconds.toFixed(3);
    }
}