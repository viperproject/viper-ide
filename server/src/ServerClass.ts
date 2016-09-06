'use strict'

import {IConnection, TextDocuments, PublishDiagnosticsParams} from 'vscode-languageserver';
import {StepsAsDecorationOptionsResult, StateChangeParams, BackendStartedParams, Stage, HeapGraph, Backend, ViperSettings, Commands, VerificationState, VerifyRequest, LogLevel, ShowHeapParams} from './ViperProtocol'
import {NailgunService} from './NailgunService';
import {VerificationTask} from './VerificationTask';
import {Log} from './Log';

export class Server {
    static backend: Backend;
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
    static workspaceRoot: string;
    static debuggedVerificationTask: VerificationTask;

    static isViperSourceFile(uri: string): boolean {
        return uri.endsWith(".sil") || uri.endsWith(".vpr");
    }

    static showHeap(task: VerificationTask, clientIndex: number) {
        Server.connection.sendRequest(Commands.HeapGraph, task.getHeapGraphDescription(clientIndex));
    }

    //Communication requests and notifications sent to language client
    static sendStateChangeNotification(params: StateChangeParams) {
        this.connection.sendNotification(Commands.StateChange, params);
    }
    static sendBackendStartedNotification(params: BackendStartedParams) {
        this.connection.sendNotification(Commands.BackendStarted, params);
    }
    static sendStopDebuggingNotification() {
        this.connection.sendNotification(Commands.StopDebugging);
    }
    static sendBackendChangeNotification(name: string) {
        this.connection.sendNotification(Commands.BackendChange, name);
    }
    static sendInvalidSettingsNotification(reason: string) {
        this.connection.sendNotification(Commands.InvalidSettings, reason);
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
    static uriToPath(uri: string): Thenable<string> {
        return this.connection.sendRequest(Commands.UriToPath, uri)
    }
    static pathToUri(path: string): Thenable<string> {
        return this.connection.sendRequest(Commands.PathToUri, path)
    }
    static askUserToSelectBackend(backendNames: string[]): Thenable<string> {
        return this.connection.sendRequest(Commands.AskUserToSelectBackend, backendNames)
    }
    static sendFileOpenedNotification(uri: string) {
        this.connection.sendNotification(Commands.FileOpened, uri);
    }
    static sendFileClosedNotification(uri: string) {
        this.connection.sendNotification(Commands.FileClosed, uri);
    }
}