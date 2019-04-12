/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
 
'use strict';

import * as vscode from "vscode";
import * as path from 'path';
import * as fs from 'fs';
import { Progress, LogLevel } from './ViperProtocol';
import { Helper } from './Helper';
import { State } from './ExtensionState';
const os = require('os');
const unusedFilename = require('unused-filename');

export class Log {
    static tempDirectory = path.join(os.tmpdir(), ".vscode");
    static logFilePath: string;
    static logFile: fs.WriteStream;
    static outputChannel = vscode.window.createOutputChannel('Viper');
    static logLevel: LogLevel;
    static lastProgress: { msg: string, logLevel: LogLevel };
    private static START_TIME = new Date().getTime();

    static logTiming = true;

    public static initialize() {
        try {
            Log.updateSettings();
            //create logfile's directory if it wasn't created before
            if (!fs.existsSync(this.tempDirectory)) {
                fs.mkdirSync(this.tempDirectory);
            }
            if (!this.logFile) {
                this.logFilePath = unusedFilename.sync(path.join(this.tempDirectory, "viper.log"));
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
        if (!this.logLevel) {
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
        Log.logLevel = Helper.getConfiguration("preferences").logLevel || LogLevel.Default;
        if (State.unitTest) {
            Log.logLevel = LogLevel.LowLevelDebug;
        }
        if (oldLogLevel != Log.logLevel) {
            if (oldLogLevel) {
                Log.log(`The logLevel was changed from ${LogLevel[oldLogLevel]} to ${LogLevel[Log.logLevel]}`, LogLevel.LowLevelDebug);
            } else {
                Log.log(`The logLevel was set to ${LogLevel[Log.logLevel]}`, LogLevel.LowLevelDebug);
            }
        }
    }

    public static log(message: string, logLevel: LogLevel) {
        if (this.lastProgress) {
            this.doLog(this.lastProgress.msg, this.lastProgress.logLevel);
            this.lastProgress = null;
        }
        this.doLog(message, logLevel);
    }

    private static doLog(message: string, logLevel: LogLevel) {
        let timing = this.logTiming ? this.prettyUptime() + ' ' : '';
        message = this.prefix(logLevel) + message;
        if (!Log.logLevel || Log.logLevel >= logLevel) {
            console.log(timing + message);
            Log.outputChannel.append(message + "\n");
        }
        if (Log.logFile) {
            Log.logFile.write(timing + message + "\n");
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
        if (Log.logLevel >= logLevel && Log.logFile) {
            let timing = this.logTiming ? this.prettyUptime() + ' ' : '';
            message = timing + message;
            console.log(message);
            Log.logFile.write(message + "\n");
        }
    }

    public static error(message: string, logLevel: LogLevel = LogLevel.Debug) {
        if (this.lastProgress) {
            this.log(this.lastProgress.msg, this.lastProgress.logLevel);
            this.lastProgress = null;
        }
        let timing = this.logTiming ? this.prettyUptime() + ' ' : '';
        message = "ERROR: " + message;
        if (Log.logLevel >= logLevel && Log.logFile) {
            console.error(timing + message);
            Log.outputChannel.append(message + "\n");
        }
        if (Log.logFile) {
            Log.logFile.write(timing + message + "\n");
        }
    }

    public static dispose() {
        Log.logFile.close();
        Log.logFile = null;
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