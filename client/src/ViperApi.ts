import * as vscode from 'vscode';
import { Z_UNKNOWN } from "zlib";
import { State } from './ExtensionState';
import { ViperFileState } from './ViperFileState';

export class VerificationTerminatedEvent {
    filename: vscode.Uri;
    message: string; 
}

class ViperConfiguration {
    public get(id: string): any {
        return vscode.workspace.getConfiguration('viperSettings').get(id);
    }
}

export class ViperApi {
    private verificationTerminatedObservers: ((VerificationTerminatedEvent) => void)[] = []
    private serverMessageCallbacks: Map<string, Array<(string, any) => void>> = new Map();
    public configuration: ViperConfiguration;

    public constructor() {
        this.configuration = new ViperConfiguration();
    }

    /** Register an observer for a VerificationTerminated event */
    public onVerificationTerminated(callback: (VerificationTerminatedEvent) => void) {
        this.verificationTerminatedObservers.push(callback);
    }

    /** Notify a VerificationTermianted event to all observers. */
    public notifyVerificationTerminated(event: VerificationTerminatedEvent) {
        this.verificationTerminatedObservers.forEach(callback => callback(event))
    }

    /** Register a callback for some _ViperServer_ message type.
     *  
     *  Via the [ViperApi] we allow passing additional options to the configured
     *  backends. This means that they can also be configured to send additional
     *  messages to the IDE. This method allows setting up handlers for message
     *  types that are not recognized by the Viper IDE by default.
     */
    public registerServerMessageCallback(messageType: string, callback: (any) => void) {
        if (!this.serverMessageCallbacks.has(messageType)) {
            this.serverMessageCallbacks.set(messageType, []);
        }

        this.serverMessageCallbacks.get(messageType).push(callback);
    }

    /** Notify the receipt of some `messageType` message.
     * 
     *  This will be called by the client when an unhandled message type is
     *  received by the language server.
     */
    public notifyServerMessage(messageType: string, message: any) {
        let callbacks = this.serverMessageCallbacks.get(messageType);

        if (callbacks) {
            callbacks.forEach((cb) => cb(messageType, message));
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
