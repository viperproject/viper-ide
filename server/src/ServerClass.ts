/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
 
'use strict'
import { ViperServerService } from './ViperServerService'

import { IConnection, TextDocuments, PublishDiagnosticsParams } from 'vscode-languageserver'
import { Common, ProgressParams, LogParams, SettingsCheckedParams, Position, Range, StepsAsDecorationOptionsResult, StateChangeParams, BackendReadyParams, Stage, Backend, Commands, LogLevel, ViperSettings } from './ViperProtocol'
import { BackendService } from './BackendService'
import { VerificationTask } from './VerificationTask'
import { Log } from './Log'
import { Settings } from './Settings'
import * as pathHelper from 'path'
import * as os from 'os'
import * as globToRexep from 'glob-to-regexp'
import ViperTools, { BuildChannel, ViperToolsContext } from './ViperTools'
import { Location } from './vs-verification-toolbox'

export class Server {
    static backend: Backend;
    static backendOutputDirectory: string = os.tmpdir();
    static executedStages: Stage[];
    static connection: IConnection;
    static documents: TextDocuments = new TextDocuments();
    static backendService: BackendService = new ViperServerService();
    static debuggedVerificationTask: VerificationTask;
    static startingOrRestarting: boolean = false;
    static viperFileEndings: string[];

    /** do not access this field directly. Instead, use the getter `verificationTasks`; non-null */
    private static _verificationTasks: Map<string, VerificationTask> = new Map();
    /** returns a non-null map */
    static get verificationTasks(): Map<string, VerificationTask> {
        return this._verificationTasks;
    }

    static stage(): Stage {
        if (this.executedStages && this.executedStages.length > 0) {
            return this.executedStages[this.executedStages.length - 1];
        }
        else return null;
    }

    static refreshEndings(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            Server.connection.sendRequest(Commands.GetViperFileEndings).then((endings: string[]) => {
                this.viperFileEndings = endings;
                resolve(true);
            }, err => {
                Log.error("GetViperFileEndings request was rejected by the client: " + err);
            });
        });
    }

    static isViperSourceFile(uri: string, firstTry: boolean = true): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (!this.viperFileEndings) {
                if (firstTry) {
                    Log.log("Refresh the viper file endings.", LogLevel.Debug);
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
    // static sendBackendChangeNotification(name: string) {
    //     this.connection.sendNotification(Commands.BackendChange, name);
    // }
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

    static sendProgressMessage(params: ProgressParams) {
        this.connection.sendNotification(Commands.Progress, params);
    }

    static sendStartBackendMessage(backend: string, forceRestart: boolean, isViperServer: boolean) {
        this.connection.sendNotification(Commands.StartBackend, { backend: backend, forceRestart: forceRestart, isViperServer: isViperServer });
    }

    static containsNumber(s: string): boolean {
        if (!s || s.length == 0) return false;
        let pattern = new RegExp(/(\d+)\.(\d+)?/g);
        let match = pattern.exec(s);
        return (match && match[1] && match[2]) ? true : false;
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
                let regex = /^(.*?)(\(?[^ ]*?@(\d+)\.(\d+)\)?|(\d+):(\d+)|<un.*>):?(.*)$/.exec(s);
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
                regex = /@\[(\d+)[.:](\d+)-(\d+)[.:](\d+)]/.exec(s);
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

    private static getContext(): ViperToolsContext {
        function providerUrl(channel: BuildChannel): string {
            if (channel === BuildChannel.Nightly) {
                return Settings.settings.preferences.nightlyViperToolsProvider as string;
            } else {
                return Settings.settings.preferences.stableViperToolsProvider as string;
            }
        }

        let isFirstProgressReport: boolean = true;
        function reportProgress(fraction: number, step: string) {
            if (isFirstProgressReport) {
                isFirstProgressReport = false;
                Log.startProgress();
            }
            Log.progress(step, fraction, 1, LogLevel.Debug);
        }

        return {
            buildVersion: Settings.settings.buildVersion,
            localViperToolsPath: Settings.settings.paths.viperToolsPath as string,
            getViperToolsProviderUrl: providerUrl,
            getBoogiePath: (unzippedPath: string) => pathHelper.join(unzippedPath, "boogie", "Binaries", "Boogie"),
            getZ3Path: (unzippedPath: string) => pathHelper.join(unzippedPath, "z3", "bin", "z3"),
            confirm: Server.confirmViperToolsUpdate,
            progressListener: reportProgress
        };
    }

    /**
     * This is a temporary solution to compute the installation path based on the build channel without calling `ensureViperTools`
     */
    public static getInstalledViperToolsPath(): string {
        const context = this.getContext();
        return ViperTools.getInstalledViperToolsPath(context);
    }

    private static cacheInternalEnsureViperTools: Promise<Location> = null;
    public static async ensureViperTools(shouldUpdate: boolean): Promise<Location> {
        let cachedPromise: Promise<Location> = this.cacheInternalEnsureViperTools;
        if (cachedPromise != null) {
            // ensureViperTools is already ongoing, do not start it again but return the cached promise:
            return cachedPromise;
        }
        // ensureViperTools is not already ongoing, start it:
        cachedPromise = this.internalEnsureViperTools(shouldUpdate);
        this.cacheInternalEnsureViperTools = cachedPromise;
        // reset cache when operation is done:
        return cachedPromise.then(loc => {
            this.cacheInternalEnsureViperTools = null;
            return loc;
        });
    }

    private static async internalEnsureViperTools(shouldUpdate: boolean): Promise<Location> {
        try {
            // We assume here that the settings have been checked and are fine.
            // In particular, we do not check the path to the Java installation again.

            if (!Settings.upToDate()) {
                Log.hint("The settings are not up to date, refresh them before updating the Viper Tools. ", true)
                Server.connection.sendNotification(Commands.ViperUpdateComplete, false)  // update failed
                return
            }

            Log.log("Updating Viper Tools ...", LogLevel.Default);
            const context = this.getContext();
            const location = await ViperTools.update(context, shouldUpdate);
            
            // trigger a restart of the backend
            await Settings.initiateBackendRestartIfNeeded(null, null, true);
            // initiate backend restart before sending update complete notification
            // this is important as otherwise the client's state machine might continue, e.g. by verifying a file.
            // verifying a file will however not be possible as the backend is not yet ready and the client's state
            // machine will then send a backend start message. As `initiateBackendRestartIfNeeded` will also come
            // to the conclusion that the backend needs to be (re)started, this causes restarting the backend twice.
            Server.connection.sendNotification(Commands.ViperUpdateComplete, true);
            return location;
        } catch (e) {
            const errMsg = `Error installing Viper tools: ${e}`;
            Log.error(errMsg);
            Server.connection.sendNotification(Commands.ViperUpdateComplete, false); //update failed
            return Promise.reject(errMsg);
        }
    }

    private static confirmViperToolsUpdate(): Promise<boolean> {
        // note that `confirm` is unfortunately not available in the server environment.
        // as a hack to make users aware of Viper IDE installing something, we use execute "echo" as sudo.
        // after switching to the LSP frontend of ViperServer, the update routine will be triggered by the client and thus
        // we will have access to the vscode API and can show a proper confirmation dialog.
        const command = "echo"
        return Common.sudoExecuter(command, "ViperTools Installer")
            .then(() => true)
            .catch(() => {
                Log.log(`Administrator permissions have not been granted to Viper IDE for installing Viper tools.`, LogLevel.Info);
                return false;
            });
    }
}
