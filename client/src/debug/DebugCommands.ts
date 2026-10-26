/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2025 ETH Zurich.
  */

import { createRequire } from 'node:module';
import type { DebugSession, Disposable, Position, Uri } from 'vscode';
const require = createRequire(import.meta.url);
const vscode = require('vscode') as typeof import('vscode');

import { Log } from '../Log.js';
import { LogLevel } from '../ViperProtocol.js';
import { DEBUG_TYPE } from './ViperDebugAdapter.js';

/** The response of the debug adapter's custom `viperCommand` request (see ViperDebugAdapter.scala). */
export interface DebugCommandResponse {
    ok: boolean;
    message: string;
    proved?: boolean;
}

/** The print configuration of a proof obligation, as the custom `viperGetPrintConfig` request returns it. */
export interface DebugPrintConfig {
    printInternal: boolean;
    nChildrenToShow: number;
    hierarchyLevel: number;
    printAxioms: boolean;
    printInternalTermRepresentation: boolean;
    printOldHeaps: boolean;
}

export type BooleanPrintConfigField =
    'printInternal' | 'printAxioms' | 'printInternalTermRepresentation' | 'printOldHeaps';

/** What VS Code passes to a command contributed to `debug/variables/context`. */
interface VariableContext {
    variable?: { name: string; value: string; evaluateName?: string };
}

/**
 * The commands of the verification debugger. The debugger itself is a regular VS Code debug session (see
 * `ViperDebugAdapter.ts`); these commands only offer its Debug Console commands from menus and the debug
 * toolbar, and keep the debugged file read-only while the session runs.
 */
export class DebugCommands {

    private readonly disposables: Disposable[] = [];
    /** The files made read-only for a debug session, by session id. */
    private readonly readonlyFiles = new Map<string, Uri>();

    constructor() {
        this.disposables.push(
            vscode.debug.onDidStartDebugSession(session => this.onStarted(session)),
            vscode.debug.onDidTerminateDebugSession(session => this.onTerminated(session)),
        );
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }

    /** Starts a debug session that stops at the given verification error, or the one under the cursor. */
    public async debugError(uri?: Uri, position?: Position, message?: string): Promise<boolean> {
        const target = this.resolveTarget(uri, position, message);
        if (!target) {
            Log.hint('Place the cursor on a verification error to debug it.', 'Viper');
            return false;
        }
        return vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(target.uri), {
            type: DEBUG_TYPE,
            request: 'launch',
            name: 'Debug a verification error',
            program: target.uri.fsPath,
            uri: target.uri.toString(),
            failure: { line: target.position.line, column: target.position.character, message: target.message },
        });
    }

    public async prove(): Promise<void> {
        await this.run(':prove', true);
    }

    public async reset(): Promise<void> {
        await this.run(':reset');
    }

    public async addAssumption(free: boolean): Promise<void> {
        if (!this.session) return this.noSession();
        const expression = await vscode.window.showInputBox({
            prompt: free ? 'Assumption to add without proving it' : 'Assumption to prove and add',
            placeHolder: 'a Viper expression, e.g. x.f > 0',
        });
        if (!expression) return;
        await this.run(`${free ? ':assume' : ':assert'} ${expression}`, !free);
    }

    /** Removes the assumption the user right-clicked on in the Variables view. */
    public async removeAssumption(context?: VariableContext): Promise<void> {
        const session = this.session;
        if (!session) return this.noSession();
        const match = context?.variable?.name.match(/^\[(\d+)\]$/);
        if (!match) {
            Log.hint('Only assumptions (shown as [id]) can be removed.', 'Viper');
            return;
        }
        await this.request<DebugCommandResponse>(session, 'viperRemoveAssumptions', { ids: [Number(match[1])] });
    }

    public async selectProver(): Promise<void> {
        if (!this.session) return this.noSession();
        const prover = await vscode.window.showQuickPick(['z3', 'cvc5'], { placeHolder: 'SMT solver to use' });
        if (!prover) return;
        const args = await vscode.window.showInputBox({ prompt: `Command line arguments for ${prover} (optional)` });
        if (args === undefined) return;
        await this.run(`:solver ${prover} ${args}`.trim());
    }

    public async setTimeout(): Promise<void> {
        if (!this.session) return this.noSession();
        const value = await vscode.window.showInputBox({
            prompt: 'Prover timeout in milliseconds; 0 means no timeout',
            validateInput: v => /^\d+$/.test(v.trim()) ? null : 'Enter a non-negative number',
        });
        if (value === undefined) return;
        await this.run(`:timeout ${value.trim()}`);
    }

    public async toggle(field: BooleanPrintConfigField): Promise<void> {
        const session = this.session;
        if (!session) return this.noSession();
        const config = await this.request<DebugPrintConfig>(session, 'viperGetPrintConfig', {});
        if (config) await this.request<DebugCommandResponse>(session, 'viperSetPrintConfig', { [field]: !config[field] });
    }

    public async setHierarchyLevel(): Promise<void> {
        const session = this.session;
        if (!session) return this.noSession();
        const config = await this.request<DebugPrintConfig>(session, 'viperGetPrintConfig', {});
        const value = await vscode.window.showInputBox({
            prompt: 'How many levels of the assumption tree to show at once',
            value: config ? String(config.hierarchyLevel) : undefined,
            validateInput: v => /^\d+$/.test(v.trim()) ? null : 'Enter a non-negative number',
        });
        if (value === undefined) return;
        await this.request<DebugCommandResponse>(session, 'viperSetPrintConfig', { hierarchyLevel: Number(value.trim()) });
    }

    /** Shows the proof obligation (and its counterexample) as the command line debugger prints it. */
    public async showText(): Promise<void> {
        const session = this.session;
        if (!session) return this.noSession();
        const text = await this.request<{ obligation?: string; counterexample?: string }>(session, 'viperGetText', {});
        if (!text?.obligation) {
            Log.hint('There is no proof obligation to show.', 'Viper');
            return;
        }
        const content = text.counterexample
            ? `${text.obligation}\nCounterexample:\n${text.counterexample}\n`
            : text.obligation;
        const document = await vscode.workspace.openTextDocument({ content, language: 'plaintext' });
        await vscode.window.showTextDocument(document, { preview: true, preserveFocus: true });
    }

    // --- Internals ---------------------------------------------------------------------------------------

    private get session(): DebugSession | undefined {
        const session = vscode.debug.activeDebugSession;
        return session?.type === DEBUG_TYPE ? session : undefined;
    }

    private noSession(): void {
        Log.hint('There is no Viper debug session. Use the quick fix on a verification error to start one.', 'Viper');
    }

    /** Runs a Debug Console command; the outcome of `:prove` is worth a notification, the rest is logged. */
    private async run(command: string, notify = false): Promise<void> {
        const session = this.session;
        if (!session) return this.noSession();
        const response = await this.request<DebugCommandResponse>(session, 'viperCommand', { command });
        if (!response) return;
        if (!response.ok) {
            Log.hint(response.message, 'Viper');
        } else if (notify && response.proved !== undefined && response.proved !== null) {
            void vscode.window.showInformationMessage(response.proved
                ? 'Viper debugger: the proof obligation holds.'
                : 'Viper debugger: the proof obligation could not be proved.');
        }
    }

    private async request<T>(session: DebugSession, command: string, args: object): Promise<T | undefined> {
        try {
            const response = await session.customRequest(command, args) as T & { message?: string };
            if (response && typeof response.message === 'string' && response.message.length > 0) {
                Log.log(`Debugger: ${response.message}`, LogLevel.Info);
            }
            return response;
        } catch (e) {
            Log.hint(`The debugger command failed: ${e instanceof Error ? e.message : e}`, 'Viper');
            return undefined;
        }
    }

    /**
     * Makes the debugged file read-only: the session refers to the file as it was verified, so ViperServer
     * ends it as soon as the file changes. VS Code can only do this for the active editor.
     */
    private async onStarted(session: DebugSession): Promise<void> {
        if (session.type !== DEBUG_TYPE || typeof session.configuration.uri !== 'string') return;
        const uri = vscode.Uri.parse(session.configuration.uri);
        try {
            await vscode.window.showTextDocument(uri, { preview: false, preserveFocus: false });
            await vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
            this.readonlyFiles.set(session.id, uri);
        } catch (e) {
            Log.log(`Could not make ${uri.toString()} read-only: ${e}`, LogLevel.Debug);
        }
    }

    private async onTerminated(session: DebugSession): Promise<void> {
        const uri = this.readonlyFiles.get(session.id);
        if (!uri) return;
        this.readonlyFiles.delete(session.id);
        const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
        if (!editor) return;
        try {
            await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus: false });
            await vscode.commands.executeCommand('workbench.action.files.resetActiveEditorReadonlyInSession');
        } catch (e) {
            Log.log(`Could not make ${uri.toString()} writable again: ${e}`, LogLevel.Debug);
        }
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
}
