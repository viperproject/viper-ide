'use strict'

import { IConnection, TextDocuments, PublishDiagnosticsParams } from 'vscode-languageserver';
import { Command, LogParams, SettingsCheckedParams, Position, Range, StepsAsDecorationOptionsResult, StateChangeParams, BackendReadyParams, Stage, Backend, Commands, LogLevel } from './ViperProtocol'
import { NailgunService } from './NailgunService';
import { VerificationTask } from './VerificationTask';
import { Log } from './Log';
import * as pathHelper from 'path';
const os = require('os');
const globToRexep = require ('glob-to-regexp');

export class Server {
    static backend: Backend;
    static tempDirectory: string = pathHelper.join(os.tmpDir(), ".vscode");
    static backendOutputDirectory: string = os.tmpDir();
    static executedStages: Stage[];
    static stage(): Stage {
        if (this.executedStages && this.executedStages.length > 0) {
            return this.executedStages[this.executedStages.length - 1];
        }
        else return null;
    }
    static connection: IConnection;
    static documents: TextDocuments = new TextDocuments();
    static verificationTasks: Map<string, VerificationTask> = new Map();
    static nailgunService: NailgunService;
    static debuggedVerificationTask: VerificationTask;
    static usedNailgunPort: string;

    static viperFileEndings: string[];

    static refreshEndings(): Thenable<boolean> {
        return new Promise((resolve, reject) => {
            Server.connection.sendRequest(Commands.GetViperFileEndings).then((endings: string[]) => {
                this.viperFileEndings = endings;
                resolve(true);
            });
        });
    }

    static isViperSourceFile(uri: string, firstTry: boolean = true): Thenable<boolean> {
        return new Promise((resolve, reject) => {
            if (!this.viperFileEndings) {
                if (firstTry) {
                    Log.log("Refresh the viper file endings.");
                    this.refreshEndings().then(() => {
                        this.isViperSourceFile(uri, false).then(success => {
                            resolve(success)
                        });
                    })
                } else {
                    resolve(false);
                }
            } else {
                resolve(this.viperFileEndings.some(globPattern => {
                    let regex = globToRexep(globPattern);
                    return regex.test(uri);
                }));
            }
        });
    }

    static showHeap(task: VerificationTask, clientIndex: number, isHeapNeeded: boolean) {
        Server.connection.sendRequest(Commands.HeapGraph, task.getHeapGraphDescription(clientIndex, isHeapNeeded));
    }

    //Communication requests and notifications sent to language client
    static sendStateChangeNotification(params: StateChangeParams, task?: VerificationTask) {
        if (task) {
            task.state = params.newState;
        }
        this.connection.sendNotification(Commands.StateChange, params);
    }
    static sendBackendReadyNotification(params: BackendReadyParams) {
        this.connection.sendNotification(Commands.BackendReady, params);
    }
    static sendStopDebuggingNotification() {
        this.connection.sendNotification(Commands.StopDebugging);
    }
    static sendBackendChangeNotification(name: string) {
        this.connection.sendNotification(Commands.BackendChange, name);
    }
    static sendSettingsCheckedNotification(errors: SettingsCheckedParams) {
        this.connection.sendNotification(Commands.SettingsChecked, errors);
    }
    static sendDiagnostics(params: PublishDiagnosticsParams) {
        this.connection.sendDiagnostics(params);
    }
    static sendStepsAsDecorationOptions(decorations: StepsAsDecorationOptionsResult) {
        Log.log("Update the decoration options (" + decorations.decorationOptions.length + ")", LogLevel.Debug);
        this.connection.sendNotification(Commands.StepsAsDecorationOptions, decorations);
    }
    static sendVerificationNotStartedNotification(uri: string) {
        this.connection.sendNotification(Commands.VerificationNotStarted, uri);
    }
    static sendFileOpenedNotification(uri: string) {
        this.connection.sendNotification(Commands.FileOpened, uri);
    }
    static sendFileClosedNotification(uri: string) {
        this.connection.sendNotification(Commands.FileClosed, uri);
    }

    static sendLogMessage(command: string, params: LogParams) {
        this.connection.sendNotification(command, params);
    }

    static containsNumber(s: string): boolean {
        if (!s || s.length == 0) return false;
        let match = s.match("^.*?(\d).*$");
        return (match && match[1]) ? true : false;
    }

    //regex helper methods
    static extractNumber(s: string): number {
        try {
            let match = /^.*?(\d+)([\.,](\d+))?.*$/.exec(s);
            if (match && match[1] && match[3]) {
                return Number.parseFloat(match[1] + "." + match[3]);
            } else if (match && match[1]) {
                return Number.parseInt(match[1]);
            }
            Log.error(`Error extracting number from  "${s}"`);
            return 0;
        } catch (e) {
            Log.error(`Error extracting number from  "${s}": ${e}`);
        }
    }

    public static extractPosition(s: string): { before: string, pos: Position, range: Range, after: string } {
        let before = "";
        let after = "";
        if (!s) return { before: before, pos: null, range: null, after: after };
        let pos: Position;
        let range: Range;
        try {
            if (s) {

                //parse position:
                let regex = /^(.*?)(\([^ ]*?@(\d+)\.(\d+)\)|(\d+):(\d+)|<un.*>):?(.*)$/.exec(s);
                if (regex && regex[3] && regex[4]) {
                    //subtract 1 to confirm with VS Codes 0-based numbering
                    let lineNr = Math.max(0, +regex[3] - 1);
                    let charNr = Math.max(0, +regex[4] - 1);
                    pos = { line: lineNr, character: charNr };
                }
                else if (regex && regex[5] && regex[6]) {
                    //subtract 1 to confirm with VS Codes 0-based numbering
                    let lineNr = Math.max(0, +regex[5] - 1);
                    let charNr = Math.max(0, +regex[6] - 1);
                    pos = { line: lineNr, character: charNr };
                }
                if (regex && regex[1]) {
                    before = regex[1].trim();
                }
                if (regex && regex[7]) {
                    after = regex[7].trim();
                }

                //parse range
                regex = /@\[(\d+)\.(\d+)-(\d+)\.(\d+)]/.exec(s);
                if (regex && regex[1] && regex[2] && regex[3] && regex[4]) {
                    range = {
                        start: {
                            line: Math.max(0, +regex[1] - 1),
                            character: Math.max(0, +regex[2] - 1)
                        },
                        end: {
                            line: Math.max(0, +regex[3] - 1),
                            character: Math.max(0, +regex[4] - 1)
                        }
                    }
                    if (pos) {
                        if (pos.line != range.start.line || pos.character != range.start.character) {
                            Log.log("Warning: parsed message has contradicting position information", LogLevel.Debug);
                        }
                    }
                    else {
                        pos = range.start;
                    }
                }
            }
        } catch (e) {
            Log.error("Error extracting number out of: " + s);
        }
        return { before: before, pos: pos, range: range, after: after };
    }

    public static extractRange(startString: string, endString: string) {
        let start = Server.extractPosition(startString).pos;
        let end = Server.extractPosition(endString).pos;
        //handle uncomplete positions
        if (!end && start) {
            end = start;
        } else if (!start && end) {
            start = end;
        } else if (!start && !end) {
            start = { line: 0, character: 0 };
            end = start
        }
        return { start: start, end: end };
    }
}