'use strict'

import {IConnection, TextDocuments} from 'vscode-languageserver';
import {Stage, HeapGraph, Backend, ViperSettings, Commands, VerificationState, VerifyRequest, LogLevel, ShowHeapParams} from './ViperProtocol'
import {NailgunService} from './NailgunService';
import {VerificationTask} from './VerificationTask';

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
}