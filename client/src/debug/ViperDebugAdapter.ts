/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2025 ETH Zurich.
  */

import { createRequire } from 'node:module';
import type {
    CancellationToken, DebugAdapterDescriptor, DebugAdapterDescriptorFactory, DebugConfiguration,
    DebugConfigurationProvider, DebugSession, ProviderResult, TextDocument, WorkspaceFolder,
} from 'vscode';
const require = createRequire(import.meta.url);
const vscode = require('vscode') as typeof import('vscode');

import * as semver from 'semver';
import { Location } from 'vs-verification-toolbox';

import { State } from '../ExtensionState.js';
import { Log } from '../Log.js';
import { Settings } from '../Settings.js';
import { Commands, LogLevel } from '../ViperProtocol.js';

export const DEBUG_TYPE = 'viper';

/**
 * The verification debugger runs inside ViperServer and speaks the Debug Adapter Protocol on a socket of its
 * own, which ViperServer opens on request. VS Code then talks to it directly; the extension is not involved in
 * the protocol at all.
 */
export class ViperDebugAdapterDescriptorFactory implements DebugAdapterDescriptorFactory {

    public async createDebugAdapterDescriptor(_session: DebugSession): Promise<DebugAdapterDescriptor | undefined> {
        if (!State.isReady()) {
            throw new Error('The Viper extension is not ready yet.');
        }
        // The debug adapter does not exist in older servers, which would answer with "method not found".
        if (State.serverVersion && semver.lt(State.serverVersion, State.MIN_SERVER_VERSION_FOR_DEBUGGER)) {
            throw new Error(`The verification debugger requires ViperServer ${State.MIN_SERVER_VERSION_FOR_DEBUGGER} `
                + `or newer, but the running server is ${State.serverVersion}.`);
        }
        const response = await State.client.sendRequest(Commands.StartDebugAdapter);
        if (response.error || response.port < 0) {
            throw new Error(response.error ?? 'ViperServer could not start the verification debugger.');
        }
        // When the extension attaches to a running ViperServer, the debug adapter runs on that server's host.
        const policy = Settings.getServerPolicy();
        const host = policy.create ? '127.0.0.1' : policy.address;
        Log.log(`Connecting to the verification debugger at ${host ?? 'localhost'}:${response.port}`, LogLevel.Debug);
        return new vscode.DebugAdapterServer(response.port, host);
    }
}

/**
 * Completes launch configurations: the file to debug defaults to the active Viper file, and the backend
 * arguments and the debugger's settings are taken from the extension's configuration, so that a launch.json
 * is not needed at all.
 */
export class ViperDebugConfigurationProvider implements DebugConfigurationProvider {

    constructor(private readonly location: Location) {}

    /** Fills in a configuration for F5 without a launch.json: debug the active Viper file. */
    public resolveDebugConfiguration(_folder: WorkspaceFolder | undefined, config: DebugConfiguration,
                                     _token?: CancellationToken): ProviderResult<DebugConfiguration> {
        if (!config.type && !config.request && !config.name) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'viper') {
                config.type = DEBUG_TYPE;
                config.request = 'launch';
                config.name = 'Debug the current Viper file';
                config.program = editor.document.uri.fsPath;
            }
        }
        return config;
    }

    /** Completes the configuration; variables such as `${file}` have been substituted at this point. */
    public resolveDebugConfigurationWithSubstitutedVariables(_folder: WorkspaceFolder | undefined,
                                                             config: DebugConfiguration,
                                                             _token?: CancellationToken): ProviderResult<DebugConfiguration> {
        return this.complete(config);
    }

    private async complete(config: DebugConfiguration): Promise<DebugConfiguration | undefined> {
        if (!config.uri && !config.program) {
            await vscode.window.showInformationMessage('Open a Viper file to debug it.');
            return undefined;
        }
        if (State.activeBackend && State.activeBackend.type !== 'silicon') {
            await vscode.window.showInformationMessage(
                `The verification debugger only supports Silicon, but the active backend is ${State.activeBackend.type}.`);
            return undefined;
        }

        // ViperServer identifies files by the URIs VS Code uses, which are not the same as the ones a path
        // would be turned into on the server (e.g. the drive letter on Windows).
        const document = this.findDocument(config);
        if (!config.uri) {
            config.uri = (document?.uri ?? vscode.Uri.file(config.program as string)).toString();
        }
        const settings = vscode.workspace.getConfiguration('viper.debugger');
        config.backend = State.activeBackend?.type ?? 'silicon';
        config.customArgs = await this.customArgs(vscode.Uri.parse(config.uri as string));
        if (config.restrictToMember === undefined) {
            config.restrictToMember = settings.get<boolean>('restrictToFailingMember', true);
        }
        if (config.counterexample === undefined) {
            config.counterexample = settings.get<boolean>('counterexample', true);
        }
        return config;
    }

    private findDocument(config: DebugConfiguration): TextDocument | undefined {
        return vscode.workspace.textDocuments.find(d =>
            (config.uri && d.uri.toString() === config.uri)
            || (config.program && d.uri.fsPath.toLowerCase() === (config.program as string).toLowerCase()));
    }

    private async customArgs(uri: import('vscode').Uri): Promise<string> {
        try {
            const backend = State.activeBackend;
            if (!backend) return '';
            const args = await Settings.getCustomArgsForBackend(this.location, backend, uri);
            return args.isRight ? (args.right ?? '') : '';
        } catch (e) {
            Log.log(`Could not determine the backend arguments for the debugger: ${e}`, LogLevel.Debug);
            return '';
        }
    }
}
