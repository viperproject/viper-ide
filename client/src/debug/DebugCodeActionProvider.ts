/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2025 ETH Zurich.
  */

import { createRequire } from 'node:module';
import type { CodeAction, CodeActionContext, CodeActionProvider, Range, Selection, TextDocument } from 'vscode';
const require = createRequire(import.meta.url);
const vscode = require('vscode') as typeof import('vscode');

import { State } from '../ExtensionState.js';

/**
 * Offers "Debug this verification error" as a quick fix on Viper's verification errors.
 *
 * ViperServer answers `textDocument/codeAction` with an empty list, so providing code actions on the client
 * does not conflict with the language server.
 */
export class DebugCodeActionProvider implements CodeActionProvider {

    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

    public provideCodeActions(
        document: TextDocument,
        _range: Range | Selection,
        context: CodeActionContext,
    ): CodeAction[] {
        // Debugging is a Silicon feature; do not offer it for other backends.
        if (State.activeBackend && State.activeBackend.type !== 'silicon') {
            return [];
        }
        if (!vscode.workspace.getConfiguration('viper.debugger').get<boolean>('enabled', true)) {
            return [];
        }

        const errors = context.diagnostics
            .filter(d => d.source === 'viper' && d.severity === vscode.DiagnosticSeverity.Error);

        return errors.flatMap(diagnostic => {
            const args = [document.uri, diagnostic.range.start, diagnostic.message];

            const debugAction = new vscode.CodeAction('Debug this verification error', vscode.CodeActionKind.QuickFix);
            debugAction.diagnostics = [diagnostic];
            debugAction.command = {
                command: 'viper.debugError',
                title: 'Debug this verification error',
                arguments: args,
            };

            // Both start the same session; this one goes straight to the values the assertion fails for.
            const counterexampleAction = new vscode.CodeAction(
                'Show a counterexample for this error', vscode.CodeActionKind.QuickFix);
            counterexampleAction.diagnostics = [diagnostic];
            counterexampleAction.command = {
                command: 'viper.debugErrorWithCounterexample',
                title: 'Show a counterexample for this error',
                arguments: args,
            };

            return [debugAction, counterexampleAction];
        });
    }
}
