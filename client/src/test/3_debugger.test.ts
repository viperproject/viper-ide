import assert from 'assert';
import type { CodeAction, Diagnostic, Uri } from 'vscode';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const vscode = require('vscode') as typeof import('vscode');
import { State } from '../ExtensionState.js';
import TestHelper, { SETUP_TIMEOUT } from './TestHelper.js';

const DEBUG_ERROR = 'debugError.vpr';

/**
 * Tests of the verification debugger. Starting a session re-verifies the file with debugging enabled, which
 * takes a while, hence the generous timeouts.
 */
suite('Verification debugger', () => {

    suiteSetup(async function() {
        this.timeout(SETUP_TIMEOUT);
        await TestHelper.setup();
    });

    suiteTeardown(async function() {
        await TestHelper.teardown();
    });

    teardown(async function() {
        await vscode.commands.executeCommand('viper.stopDebugSession');
    });

    test('Offers a quick fix on a verification error', async function() {
        this.timeout(60000);
        const document = await TestHelper.openAndVerify(DEBUG_ERROR);
        const diagnostic = await waitForVerificationError(document.uri);

        const actions = await vscode.commands.executeCommand<CodeAction[]>(
            'vscode.executeCodeActionProvider', document.uri, diagnostic.range);
        assert(actions.some(a => a.title === 'Debug this verification error'),
            `expected a debug quick fix, got: ${actions.map(a => a.title).join(', ')}`);
    });

    test('Opens the proof obligation of a verification error', async function() {
        this.timeout(120000);
        const document = await TestHelper.openAndVerify(DEBUG_ERROR);
        const diagnostic = await waitForVerificationError(document.uri);

        await vscode.commands.executeCommand(
            'viper.debugError', document.uri, diagnostic.range.start, diagnostic.message);

        const obligation = State.debugController!.currentObligation;
        assert(obligation != null, 'no proof obligation was opened');
        assert(obligation.assertion != null, 'the obligation has no assertion');
        assert(obligation.store.length > 0, 'the obligation has an empty store');
        assert(obligation.renderedText.includes('Original Error:'), 'the obligation has no rendered text');
    });

    test('Adds a free assumption to an open obligation', async function() {
        this.timeout(120000);
        const document = await TestHelper.openAndVerify(DEBUG_ERROR);
        const diagnostic = await waitForVerificationError(document.uri);
        await vscode.commands.executeCommand(
            'viper.debugError', document.uri, diagnostic.range.start, diagnostic.message);

        const before = State.debugController!.currentObligation!.assumptions.length;
        // The command asks the user for the expression, so answer for them.
        const originalShowInputBox = vscode.window.showInputBox;
        (vscode.window as { showInputBox: unknown }).showInputBox = async () => 'i > 3';
        try {
            await vscode.commands.executeCommand('viper.debugAddFreeAssumption');
        } finally {
            (vscode.window as { showInputBox: unknown }).showInputBox = originalShowInputBox;
        }

        const after = State.debugController!.currentObligation!.assumptions.length;
        assert(after > before, `expected more assumptions than ${before}, got ${after}`);
    });

    test('Shows a counterexample and follows added assumptions', async function() {
        this.timeout(120000);
        const document = await TestHelper.openAndVerify(DEBUG_ERROR);
        const diagnostic = await waitForVerificationError(document.uri);
        await vscode.commands.executeCommand(
            'viper.debugError', document.uri, diagnostic.range.start, diagnostic.message);

        const controller = State.debugController!;
        const ce = controller.currentCounterexample;
        assert(ce != null, 'no counterexample was computed for the failure');
        const values = ce.sections.filter(s => s.key === 'current').flatMap(s => s.nodes.map(n => n.label));
        assert(values.some(v => v.startsWith('i -> ')), `expected a value for i, got: ${values.join(', ')}`);

        // Constraining the counterexample must be reflected in the next one.
        const originalShowInputBox = vscode.window.showInputBox;
        (vscode.window as { showInputBox: unknown }).showInputBox = async () => 'i == 4';
        try {
            await vscode.commands.executeCommand('viper.debugAddFreeAssumption');
        } finally {
            (vscode.window as { showInputBox: unknown }).showInputBox = originalShowInputBox;
        }
        assert(controller.currentCounterexample?.stale === true,
            'the counterexample should be out of date after an assumption was added');

        await vscode.commands.executeCommand('viper.debugCounterexample');
        const updated = controller.currentCounterexample;
        assert(updated != null && !updated.stale, 'the counterexample should have been recomputed');
        const newValues = updated.sections.filter(s => s.key === 'current').flatMap(s => s.nodes.map(n => n.label));
        assert(newValues.includes('i -> 4'), `expected i to be 4, got: ${newValues.join(', ')}`);
    });

    test('Closes the session when a verification is started', async function() {
        this.timeout(120000);
        const document = await TestHelper.openAndVerify(DEBUG_ERROR);
        const diagnostic = await waitForVerificationError(document.uri);
        await vscode.commands.executeCommand(
            'viper.debugError', document.uri, diagnostic.range.start, diagnostic.message);
        assert(State.debugController!.isActive, 'the debug session should be active');

        await TestHelper.verify();
        await TestHelper.waitForVerification(DEBUG_ERROR);
        assert(!State.debugController!.isActive, 'the debug session should have been closed');
    });
});

/** Waits until the file has at least one verification error and returns the first one. */
async function waitForVerificationError(uri: Uri, timeoutMs = 20000): Promise<Diagnostic> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const errors = vscode.languages.getDiagnostics(uri)
            .filter(d => d.source === 'viper' && d.severity === vscode.DiagnosticSeverity.Error);
        if (errors.length > 0) return errors[0];
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error(`no verification error was reported for ${uri.toString()}`);
}
