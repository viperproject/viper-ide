import * as vscode from 'vscode';
import { Z_UNKNOWN } from "zlib";
import { State } from './ExtensionState';
import { ViperFileState } from './ViperFileState';


export enum ViperApiEvent {
    VerificationTerminated = 'VerificationTerminated',
    SomethingElse = 'SomethingElse'
}

class ViperConfiguration {
    public get(id: string): any {
        return vscode.workspace.getConfiguration('viperSettings').get(id);
    }
}

export class ViperApi {
    private static knownEvents = ['VerificationTerminated'];
    private callbacks: Map<string, Array<any>> = new Map();
    public configuration: ViperConfiguration;

    public constructor() {
        this.configuration = new ViperConfiguration();
    }

    public registerApiCallback(event: string, callback: any) {
        if (!ViperApi.knownEvents.some(e => e === event)) {
            let events = ViperApi.knownEvents.join(", ");
            throw new Error(`Unknown ViperApi event key '${event}'. Events are: ${events}`);
        }

        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, []);
        }

        this.callbacks.get(event).push(callback);
    }

    public notify(event: ViperApiEvent, value: any) {
        let callbacks = this.callbacks.get(event.toString());
        if (callbacks) {
            callbacks.forEach((callback, index, array) => callback(value));
        }
    }

    // TODO: Don't like this, maybe refactor
    public getLastActiveFile(): ViperFileState {
        return State.getLastActiveFile();
    }

    public isBackendReady(): boolean {
        return State.isBackendReady;
    }

    public isVerifying(): boolean {
        return State.isVerifying;
    }
}
