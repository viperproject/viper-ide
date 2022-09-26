/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2020 ETH Zurich.
  */
 

import * as vscode from 'vscode';
import { State } from './ExtensionState';
import { ViperFileState } from './ViperFileState';
import { Success } from './ViperProtocol';
import { LanguageClient } from 'vscode-languageclient/lib/main';

export class VerificationTerminatedEvent {
    status: Success;
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
    private languageClient: LanguageClient;
    public configuration: ViperConfiguration;

    public constructor(client: LanguageClient) {
        this.configuration = new ViperConfiguration();
        this.languageClient = client;
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

    public getViperServerUrl(): Thenable<string> {
        return this.sendServerMessage<string>("GetViperServerUrl");
    }

    private sendServerMessage<R>(key: string, param?: any): Thenable<R> {
        if (param) {
            return this.languageClient.sendRequest(key, param);
        } else {
            return this.languageClient.sendRequest(key);
        }
    }

    // TODO: Don't like this, maybe refactor
    public getLastActiveFile(): ViperFileState {
        return State.getLastActiveFile();
    }

    public getBackendName(): string {
        return State.activeBackend.name
    }

    public isBackendReady(): boolean {
        return State.isBackendReady;
    }

    public isVerifying(): boolean {
        return State.isVerifying;
    }
}
