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
    static tempDirectory = path.join(os.tmpDir(), ".vscode");
    static logFilePath: string;
    static logFile: fs.WriteStream;
    static outputChannel = vscode.window.createOutputChannel('Viper');
    static logLevel: LogLevel;

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
        let messageNewLine = message + "\n";
        message = this.prefix(logLevel) + message;
        if (!Log.logLevel || Log.logLevel >= logLevel) {
            console.log(message);
            Log.outputChannel.append(messageNewLine);
        }
        if (Log.logFile) {
            Log.logFile.write(messageNewLine);
        }
    }

    public static progress(data: Progress, logLevel: LogLevel) {
        if (!data) return;
        let progress = 100.0 * data.current / data.total;
        let label = data.domain + ": " + Helper.formatProgress(progress);
        this.log(label, logLevel);
        State.statusBarProgress.updateProgressBar(progress);
        State.statusBarItem.updateProgressLabel(data.domain, progress);
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
            console.log(message);
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
        Log.logFile = null;
    }

    public static hint(message: string, tag: string = "Viper", showSettingsButton = false, showViperToolsUpdateButton = false) {
        Log.log("H: " + tag + ": "+ message, LogLevel.Debug);

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
}