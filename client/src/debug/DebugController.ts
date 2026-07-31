/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2025 ETH Zurich.
  */

import { createRequire } from 'node:module';
import type { Disposable, Position, StatusBarItem, TextEditorDecorationType, Uri } from 'vscode';
const require = createRequire(import.meta.url);
const vscode = require('vscode') as typeof import('vscode');

import * as semver from 'semver';
import { Location } from 'vs-verification-toolbox';

import { State } from '../ExtensionState.js';
import { Log } from '../Log.js';
import { Settings } from '../Settings.js';
import {
    Commands, DebugCommandResponse, DebugCounterexample, DebugFailure, DebugMessage, DebugNode,
    DebugObligation, DebugPrintConfig, DebugSessionClosedParams, DebugSessionStateParams, DebugStartResponse,
    LogLevel,
} from '../ViperProtocol.js';
import { CounterexampleTreeProvider } from './CounterexampleTreeProvider.js';
import { DebugTreeProvider } from './DebugTreeProvider.js';

const VIEW_ID = 'viperProofObligation';
const COUNTEREXAMPLE_VIEW_ID = 'viperCounterexample';

/** The fields of the print configuration that can simply be toggled. */
export type BooleanPrintConfigField =
    'printInternal' | 'printAxioms' | 'printInternalTermRepresentation' | 'printOldHeaps';
const CONTEXT_ACTIVE = 'viper.debugSessionActive';
const CONTEXT_HAS_COUNTEREXAMPLE = 'viper.debugHasCounterexample';

/**
 * Drives the verification debugger from the IDE.
 *
 * A debug session is started on demand for a single verification error: the server re-verifies the file with
 * debugging enabled and keeps that verifier alive, which is expensive, so exactly one session exists at a time
 * and the server closes it as soon as a normal verification starts.
 */
export class DebugController {

    private sessionId: string | null = null;
    private failures: DebugFailure[] = [];
    private obligation: DebugObligation | null = null;
    private busy = false;

    private readonly treeProvider = new DebugTreeProvider();
    private readonly counterexampleProvider = new CounterexampleTreeProvider();
    private readonly statusBarItem: StatusBarItem;
    private readonly highlight: TextEditorDecorationType;
    private readonly disposables: Disposable[] = [];

    constructor(private readonly location: Location) {
        this.treeProvider.expandNode = node => this.fetchChildren(node);
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9);
        this.statusBarItem.command = 'viper.debugProve';
        this.highlight = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.rangeHighlightBackground'),
            isWholeLine: false,
        });
        this.disposables.push(
            vscode.window.registerTreeDataProvider(VIEW_ID, this.treeProvider),
            vscode.window.registerTreeDataProvider(COUNTEREXAMPLE_VIEW_ID, this.counterexampleProvider),
            this.statusBarItem,
            this.highlight,
        );
        void vscode.commands.executeCommand('setContext', CONTEXT_ACTIVE, false);
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }

    public get isActive(): boolean {
        return this.sessionId != null;
    }

    /** For the extension tests. */
    public get currentObligation(): DebugObligation | null {
        return this.obligation;
    }

    public get currentFailures(): DebugFailure[] {
        return this.failures;
    }

    /** For the extension tests. */
    public get currentCounterexample(): DebugCounterexample | null {
        return this.obligation?.counterexample ?? null;
    }

    // --- Starting and stopping ---------------------------------------------------------------------------

    /**
     * Starts a debug session for a verification error. Without arguments, the error under the cursor is used,
     * which is how the command palette entry works.
     */
    public async debugError(uri?: Uri, position?: Position, message?: string): Promise<void> {
        if (!State.isReady()) {
            Log.hint('The Viper extension is not ready yet.', 'Viper');
            return;
        }
        const target = this.resolveTarget(uri, position, message);
        if (!target) {
            Log.hint('Place the cursor on a verification error to debug it.', 'Viper');
            return;
        }
        if (State.activeBackend && State.activeBackend.type !== 'silicon') {
            Log.hint(`The verification debugger only supports Silicon, but the active backend is ${State.activeBackend.type}.`, 'Viper');
            return;
        }
        // The debugger's messages do not exist in older servers, which would answer with "method not found".
        if (State.serverVersion && semver.lt(State.serverVersion, State.MIN_SERVER_VERSION_FOR_DEBUGGER)) {
            Log.hint(`The verification debugger requires ViperServer ${State.MIN_SERVER_VERSION_FOR_DEBUGGER} `
                + `or newer, but the running server is ${State.serverVersion}.`, 'Viper');
            return;
        }

        await this.stopSession(false);
        const customArgs = await this.customArgs(target.uri);
        const settings = vscode.workspace.getConfiguration('viper.debugger');

        this.busy = true;
        this.updateStatusBar('starting the debugger...');
        let response: DebugStartResponse;
        try {
            response = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Viper: starting the verification debugger',
                cancellable: false,
            }, () => State.client.sendRequest(Commands.StartDebugSession, {
                uri: target.uri.toString(),
                backend: State.activeBackend ? State.activeBackend.type : 'silicon',
                customArgs,
                position: { line: target.position.line, character: target.position.character },
                message: target.message,
                restrictToMember: settings.get<boolean>('restrictToFailingMember', true),
                withCounterexample: settings.get<boolean>('counterexample', true),
            }));
        } catch (e) {
            Log.error(`Starting the verification debugger failed: ${e}`);
            Log.hint(`Starting the verification debugger failed: ${e}`, 'Viper');
            this.clear();
            return;
        } finally {
            // Release the lock before handling the response, which may issue further commands.
            this.busy = false;
        }
        await this.handleStartResponse(response);
    }

    /** Starts a session for an error and goes straight to the counterexample. */
    public async debugErrorWithCounterexample(uri?: Uri, position?: Position, message?: string): Promise<void> {
        await this.debugError(uri, position, message);
        if (this.isActive) {
            await this.showCounterexample();
        }
    }

    private async handleStartResponse(response: DebugStartResponse): Promise<void> {
        if (response.error) {
            Log.hint(`Cannot debug this error: ${response.error}`, 'Viper');
            this.clear();
            return;
        }
        this.sessionId = response.sessionId;
        this.failures = response.failures ?? [];
        this.logMessages(response.messages);
        await vscode.commands.executeCommand('setContext', CONTEXT_ACTIVE, true);

        if (response.selected < 0 || !response.obligation) {
            // The server could not tell which failure the user meant; let them choose.
            Log.hint('Select the verification error you want to debug.', 'Viper');
            await this.selectFailure();
        } else {
            this.setObligation(response.obligation);
        }
        await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    }

    public async stopSession(notify = true): Promise<void> {
        const sessionId = this.sessionId;
        this.clear();
        if (sessionId == null) return;
        try {
            await State.client.sendRequest(Commands.StopDebugSession, { sessionId });
            if (notify) Log.log('The verification debug session was stopped.', LogLevel.Info);
        } catch (e) {
            Log.error(`Stopping the debug session failed: ${e}`);
        }
    }

    /** Called when the server tells us that it closed the session. */
    public onSessionClosed(params: DebugSessionClosedParams): void {
        if (this.sessionId != null && this.sessionId === params.sessionId) {
            Log.log(`The verification debug session was closed: ${params.reason}`, LogLevel.Info);
            this.clear();
        }
    }

    public onSessionState(params: DebugSessionStateParams): void {
        Log.log(`Debugger: ${params.message}`, LogLevel.Info);
        if (params.state !== 'ready') this.updateStatusBar(params.message);
    }

    // --- Commands on an open session ---------------------------------------------------------------------

    public async prove(): Promise<void> {
        await this.command(sessionId => State.client.sendRequest(Commands.DebugProve, { sessionId }), response => {
            if (response.proved === true) {
                this.updateStatusBar('the obligation holds');
                Log.hint('The proof obligation holds.', 'Viper');
            } else if (response.proved === false) {
                this.updateStatusBar('the obligation does not hold');
                Log.hint('The proof obligation could not be proved.', 'Viper');
            }
        });
    }

    public async reset(): Promise<void> {
        await this.command(sessionId => State.client.sendRequest(Commands.DebugReset, { sessionId }));
    }

    public async addAssumption(free: boolean): Promise<void> {
        const expression = await vscode.window.showInputBox({
            prompt: free
                ? 'Assume this expression without proving it'
                : 'Prove this expression and then assume it',
            placeHolder: 'e.g. x.f > 0',
            ignoreFocusOut: true,
        });
        if (!expression) return;
        await this.command(sessionId =>
            State.client.sendRequest(Commands.DebugAddAssumption, { sessionId, expression, free }));
    }

    public async removeAssumption(element?: { node?: DebugNode }): Promise<void> {
        let ids: number[] = [];
        if (element && element.node && element.node.id >= 0) {
            ids = [element.node.id];
        } else {
            const input = await vscode.window.showInputBox({
                prompt: 'Ids of the assumptions to remove, separated by commas',
                ignoreFocusOut: true,
            });
            if (!input) return;
            ids = input.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        }
        if (ids.length === 0) return;
        await this.command(sessionId =>
            State.client.sendRequest(Commands.DebugRemoveAssumptions, { sessionId, nodeIds: ids }));
    }

    public async selectFailure(): Promise<void> {
        if (this.sessionId == null) return;
        const items = this.failures.filter(f => f.debuggable).map(f => ({
            label: f.message,
            description: f.memberName ? `in ${f.memberName}` : undefined,
            detail: f.pos ? `line ${f.pos.startLine + 1}` : undefined,
            index: f.index,
        }));
        if (items.length === 0) {
            Log.hint('There is no verification error that can be debugged.', 'Viper');
            return;
        }
        const picked = items.length === 1 ? items[0] : await vscode.window.showQuickPick(items, {
            placeHolder: 'Which verification error do you want to debug?',
        });
        if (!picked) return;
        await this.command(sessionId =>
            State.client.sendRequest(Commands.DebugSelectFailure, { sessionId, index: picked.index }));
    }

    public async selectProver(): Promise<void> {
        const prover = await vscode.window.showQuickPick(['Z3', 'cvc5'], { placeHolder: 'Which SMT solver should be used?' });
        if (!prover) return;
        const args = await vscode.window.showInputBox({
            prompt: 'Additional command line options for the solver (optional)',
            ignoreFocusOut: true,
        });
        await this.command(sessionId =>
            State.client.sendRequest(Commands.DebugSetProver, { sessionId, prover, args: args ?? '' }));
    }

    public async setTimeout(): Promise<void> {
        const input = await vscode.window.showInputBox({
            prompt: 'Prover timeout in milliseconds (0 for no timeout)',
            value: this.obligation && this.obligation.timeoutMs > 0 ? `${this.obligation.timeoutMs}` : '0',
            ignoreFocusOut: true,
        });
        if (input == null) return;
        const timeoutMs = parseInt(input, 10);
        if (isNaN(timeoutMs)) {
            Log.hint('Please enter a number.', 'Viper');
            return;
        }
        await this.command(sessionId => State.client.sendRequest(Commands.DebugSetTimeout, { sessionId, timeoutMs }));
    }

    /** Changes one field of the print configuration, e.g. to also show internal assumptions. */
    public async updatePrintConfig(change: Partial<DebugPrintConfig>): Promise<void> {
        if (!this.obligation) return;
        const config: DebugPrintConfig = { ...this.obligation.printConfig, ...change };
        await this.command(sessionId => State.client.sendRequest(Commands.DebugSetPrintConfig, { sessionId, config }));
    }

    public async toggle(field: BooleanPrintConfigField): Promise<void> {
        if (!this.obligation) return;
        await this.updatePrintConfig({ [field]: !this.obligation.printConfig[field] } as Partial<DebugPrintConfig>);
    }

    public async setHierarchyLevel(): Promise<void> {
        const input = await vscode.window.showInputBox({
            prompt: 'How many levels of the assumption tree should be shown?',
            value: this.obligation ? `${this.obligation.printConfig.hierarchyLevel}` : '2',
            ignoreFocusOut: true,
        });
        if (input == null) return;
        const hierarchyLevel = parseInt(input, 10);
        if (isNaN(hierarchyLevel)) return;
        await this.updatePrintConfig({ hierarchyLevel });
    }

    /**
     * Shows a counterexample for the obligation as it is now.
     *
     * A counterexample is a model of the assumptions in which the assertion fails, so it is obtained by asking
     * the prover to prove the obligation and taking the model of the failed attempt. That means it always
     * matches the assumptions currently in the session, including ones the user added or removed.
     */
    public async showCounterexample(): Promise<void> {
        const current = this.obligation?.counterexample;
        if (!current || current.stale) {
            await this.prove();
        }
        const ce = this.obligation?.counterexample;
        if (!ce) {
            Log.hint('No counterexample is available for this proof obligation.', 'Viper');
            return;
        }
        await vscode.commands.executeCommand(`${COUNTEREXAMPLE_VIEW_ID}.focus`);
    }

    /** Shows the counterexample as plain text, the way Silicon prints it on the command line. */
    public async showCounterexampleAsText(): Promise<void> {
        const ce = this.obligation?.counterexample;
        if (!ce) {
            Log.hint('No counterexample is available for this proof obligation.', 'Viper');
            return;
        }
        const doc = await vscode.workspace.openTextDocument({
            content: ce.renderedText,
            language: 'plaintext',
        });
        await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
    }

    /** Shows the obligation as plain text, the same rendering Silicon's command line debugger prints. */
    public async showAsText(): Promise<void> {
        if (!this.obligation) return;
        const doc = await vscode.workspace.openTextDocument({
            content: this.obligation.renderedText,
            language: 'plaintext',
        });
        await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
    }

    /** Shows the source range a node originates from. */
    public async revealNode(node: DebugNode): Promise<void> {
        if (!node.pos || !node.pos.file) return;
        const range = new vscode.Range(
            new vscode.Position(node.pos.startLine, node.pos.startCharacter),
            new vscode.Position(node.pos.endLine, node.pos.endCharacter));
        try {
            const editor = await vscode.window.showTextDocument(vscode.Uri.file(node.pos.file), {
                preserveFocus: true,
                selection: range,
            });
            editor.setDecorations(this.highlight, [range]);
        } catch (e) {
            Log.log(`Could not reveal ${node.pos.file}: ${e}`, LogLevel.Debug);
        }
    }

    // --- Internals ---------------------------------------------------------------------------------------

    private async command(request: (sessionId: string) => Thenable<DebugCommandResponse>,
                          onSuccess?: (response: DebugCommandResponse) => void): Promise<void> {
        if (this.sessionId == null) {
            Log.hint('There is no debug session. Use the quick fix on a verification error to start one.', 'Viper');
            return;
        }
        if (this.busy) {
            Log.hint('The debugger is still busy with the previous command.', 'Viper');
            return;
        }
        this.busy = true;
        try {
            const response = await request(this.sessionId);
            this.logMessages(response.messages);
            if (response.error) {
                Log.hint(response.error, 'Viper');
            }
            if (response.obligation) {
                this.setObligation(response.obligation);
            }
            if (onSuccess) onSuccess(response);
        } catch (e) {
            Log.error(`A debugger command failed: ${e}`);
        } finally {
            this.busy = false;
        }
    }

    private async fetchChildren(node: DebugNode): Promise<DebugNode[]> {
        if (this.sessionId == null) return [];
        try {
            const response = await State.client.sendRequest(Commands.DebugExpandNode, {
                sessionId: this.sessionId,
                nodeId: node.id,
            });
            if (response.error) {
                Log.log(`Could not expand node ${node.id}: ${response.error}`, LogLevel.Debug);
                return [];
            }
            return response.nodes ?? [];
        } catch (e) {
            Log.error(`Expanding a node failed: ${e}`);
            return [];
        }
    }

    private setObligation(obligation: DebugObligation): void {
        this.obligation = obligation;
        this.treeProvider.setObligation(obligation);
        this.counterexampleProvider.set(obligation.counterexample ?? null);
        void vscode.commands.executeCommand('setContext', CONTEXT_HAS_COUNTEREXAMPLE,
            obligation.counterexample != null);
        this.updateStatusBar();
    }

    private clear(): void {
        this.sessionId = null;
        this.failures = [];
        this.obligation = null;
        this.treeProvider.setObligation(null);
        this.counterexampleProvider.set(null);
        void vscode.commands.executeCommand('setContext', CONTEXT_HAS_COUNTEREXAMPLE, false);
        this.statusBarItem.hide();
        vscode.window.visibleTextEditors.forEach(e => e.setDecorations(this.highlight, []));
        void vscode.commands.executeCommand('setContext', CONTEXT_ACTIVE, false);
    }

    private updateStatusBar(text?: string): void {
        if (text) {
            this.statusBarItem.text = `$(debug) Viper: ${text}`;
        } else if (this.obligation) {
            const timeout = this.obligation.timeoutMs > 0 ? `, ${this.obligation.timeoutMs}ms` : '';
            this.statusBarItem.text = `$(debug) Viper debugger (${this.obligation.proverName}${timeout})`;
        } else {
            this.statusBarItem.text = '$(debug) Viper debugger';
        }
        this.statusBarItem.tooltip = 'Prove the current obligation';
        this.statusBarItem.show();
    }

    private logMessages(messages?: DebugMessage[]): void {
        (messages ?? []).forEach(m => {
            const level = m.severity === 'error' ? LogLevel.Default : LogLevel.Info;
            Log.log(`Debugger: ${m.text}`, level);
            if (m.severity === 'error') Log.hint(m.text, 'Viper');
        });
    }

    /** The verification error the user is pointing at, either explicitly or via the cursor. */
    private resolveTarget(uri?: Uri, position?: Position, message?: string):
        { uri: Uri; position: Position; message: string } | null {
        if (uri && position) {
            return { uri, position, message: message ?? '' };
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) return null;
        const cursor = editor.selection.active;
        const diagnostics = vscode.languages.getDiagnostics(editor.document.uri)
            .filter(d => d.source === 'viper' && d.severity === vscode.DiagnosticSeverity.Error);
        const atCursor = diagnostics.find(d => d.range.contains(cursor));
        const chosen = atCursor ?? diagnostics.find(d => d.range.start.line === cursor.line);
        if (!chosen) return null;
        return { uri: editor.document.uri, position: chosen.range.start, message: chosen.message };
    }

    private async customArgs(uri: Uri): Promise<string> {
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
