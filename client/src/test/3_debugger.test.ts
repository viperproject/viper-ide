import assert from 'assert';
import type { CodeAction, DebugSession, Diagnostic, TextDocument, Uri } from 'vscode';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const vscode = require('vscode') as typeof import('vscode');
import TestHelper, { SETUP_TIMEOUT } from './TestHelper.js';

const DEBUG_ERROR = 'debugError.vpr';

/** The DAP messages the debug adapter has sent, recorded with a debug adapter tracker. */
const sentMessages: { type: string; event?: string; body?: Record<string, unknown> }[] = [];

/**
 * Tests of the verification debugger, which is a regular VS Code debug session whose debug adapter runs in
 * ViperServer. Starting a session re-verifies the file with debugging enabled, which takes a while, hence the
 * generous timeouts.
 */
suite('Verification debugger', () => {

    suiteSetup(async function() {
        this.timeout(SETUP_TIMEOUT);
        await TestHelper.setup();
        vscode.debug.registerDebugAdapterTrackerFactory('viper', {
            createDebugAdapterTracker: () => ({
                onDidSendMessage: (message: { type: string; event?: string; body?: Record<string, unknown> }) => {
                    sentMessages.push(message);
                },
            }),
        });
    });

    suiteTeardown(async function() {
        await TestHelper.teardown();
    });

    teardown(async function() {
        await vscode.debug.stopDebugging();
        sentMessages.length = 0;
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

    test('Stops at the verification error and shows its proof obligation', async function() {
        this.timeout(120000);
        const { session, threadId } = await debugFirstError();

        const { stackFrames } = await session.customRequest('stackTrace', { threadId }) as
            { stackFrames: { id: number; line: number; source?: { path?: string } }[] };
        assert.strictEqual(stackFrames[0].line - 1, (await firstError()).range.start.line,
            'the frame should be at the verification error');

        const scopes = await scopesOf(session, stackFrames[0].id);
        for (const name of ['Assertion', 'Assumptions', 'Store', 'Branch conditions']) {
            assert(scopes.some(s => s.name === name), `expected a scope '${name}', got: ${scopes.map(s => s.name).join(', ')}`);
        }
        const store = await variablesOf(session, scopes.find(s => s.name === 'Store')!.variablesReference);
        assert(store.length > 0, 'the store should not be empty');
    });

    test('Adds a free assumption and refreshes the variables', async function() {
        this.timeout(120000);
        const { session, threadId } = await debugFirstError();
        const assumptionsBefore = await assumptionsOf(session, threadId);

        const response = await session.customRequest('viperCommand', { command: ':assume i > 3' }) as { ok: boolean };
        assert(response.ok, 'adding the assumption failed');
        assert(sentMessages.some(m => m.event === 'invalidated'), 'the variables should have been invalidated');

        const assumptionsAfter = await assumptionsOf(session, threadId);
        assert(assumptionsAfter.length > assumptionsBefore.length,
            `expected more assumptions than ${assumptionsBefore.length}, got ${assumptionsAfter.length}`);
    });

    test('Shows a counterexample that follows added assumptions', async function() {
        this.timeout(120000);
        const { session, threadId } = await debugFirstError();
        const valuesOfI = async (): Promise<string[]> => {
            const { stackFrames } = await session.customRequest('stackTrace', { threadId }) as { stackFrames: { id: number }[] };
            const scopes = await scopesOf(session, stackFrames[0].id);
            const ce = scopes.find(s => s.name.startsWith('Counterexample'));
            assert(ce, `no counterexample was computed, got scopes: ${scopes.map(s => s.name).join(', ')}`);
            const sections = await variablesOf(session, ce.variablesReference);
            const values = await Promise.all(sections.map(s => variablesOf(session, s.variablesReference)));
            return values.flat().filter(v => v.name === 'i').map(v => v.value);
        };
        assert((await valuesOfI()).length > 0, 'the counterexample should contain a value for i');

        await session.customRequest('viperCommand', { command: ':assume i == 4' });
        await session.customRequest('viperCommand', { command: ':prove' });
        assert((await valuesOfI()).includes('4'), 'the counterexample should satisfy the added assumption');
    });

    test('Pauses at a breakpoint on every path and checks expressions there', async function() {
        this.timeout(120000);
        const document = await TestHelper.openAndVerify(DEBUG_ERROR);
        // Both branches of the conditional reach the assertion on line 12 (0-based: 11).
        const breakpoint = new vscode.SourceBreakpoint(new vscode.Location(document.uri, new vscode.Position(11, 0)));
        vscode.debug.addBreakpoints([breakpoint]);
        try {
            const started = await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(document.uri), {
                type: 'viper', request: 'launch', name: 'Debug the current Viper file', program: document.uri.fsPath,
            });
            assert(started, 'the debug session did not start');
            const session = vscode.debug.activeDebugSession!;

            const results: string[] = [];
            for (let hit = 1; hit <= 2; hit++) {
                const stopped = await waitFor(() => sentMessages.filter(m => m.event === 'stopped')[hit - 1],
                    110000, `breakpoint hit ${hit}`);
                assert.strictEqual(stopped.body!.reason, 'breakpoint');
                const threadId = stopped.body!.threadId as number;
                const { stackFrames } = await session.customRequest('stackTrace', { threadId }) as
                    { stackFrames: { id: number; line: number }[] };
                assert.strictEqual(stackFrames[0].line, 12, 'the verification should be paused at the assertion');
                const { result } = await session.customRequest('evaluate',
                    { expression: 'x.f > 5', context: 'repl', frameId: stackFrames[0].id }) as { result: string };
                results.push(result);
                await session.customRequest('continue', { threadId });
            }
            assert(results.includes('holds') && results.some(r => r.startsWith('does not hold')),
                `the assertion holds on one path but not on the other, got: ${results.join(', ')}`);

            // Once the verification has finished, the debugger stops at the verification error.
            const failure = await waitFor(() => sentMessages.filter(m => m.event === 'stopped')[2], 60000, 'the failure');
            assert.strictEqual(failure.body!.reason, 'exception');
        } finally {
            vscode.debug.removeBreakpoints([breakpoint]);
        }
    });

    test('Stops at a conditional breakpoint only where the condition may hold', async function() {
        this.timeout(120000);
        const document = await TestHelper.openAndVerify(DEBUG_ERROR);
        // On the then-branch, i > 5 and i may be 7; on the else-branch, i <= 5, so `i == 7` is provably false.
        const breakpoint = new vscode.SourceBreakpoint(
            new vscode.Location(document.uri, new vscode.Position(11, 0)), true, 'i == 7');
        vscode.debug.addBreakpoints([breakpoint]);
        try {
            const started = await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(document.uri), {
                type: 'viper', request: 'launch', name: 'Debug the current Viper file', program: document.uri.fsPath,
            });
            assert(started, 'the debug session did not start');
            const session = vscode.debug.activeDebugSession!;
            const first = await waitFor(() => sentMessages.filter(m => m.event === 'stopped')[0], 110000, 'the breakpoint');
            assert.strictEqual(first.body!.reason, 'breakpoint');
            await session.customRequest('continue', { threadId: first.body!.threadId });
            const second = await waitFor(() => sentMessages.filter(m => m.event === 'stopped')[1], 60000, 'the failure');
            assert.strictEqual(second.body!.reason, 'exception', 'the else-branch should not stop at the breakpoint');
        } finally {
            vscode.debug.removeBreakpoints([breakpoint]);
        }
    });

    test('Steps from a breakpoint to the next statement of the path', async function() {
        this.timeout(120000);
        const document = await TestHelper.openAndVerify(DEBUG_ERROR);
        // The assignment in the then-branch (line 8, 0-based: 7) is followed by the assertion on line 12.
        const breakpoint = new vscode.SourceBreakpoint(new vscode.Location(document.uri, new vscode.Position(7, 0)));
        vscode.debug.addBreakpoints([breakpoint]);
        try {
            const started = await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(document.uri), {
                type: 'viper', request: 'launch', name: 'Debug the current Viper file', program: document.uri.fsPath,
            });
            assert(started, 'the debug session did not start');
            const session = vscode.debug.activeDebugSession!;
            const lineOfStop = async (stop: number): Promise<{ reason: string; line: number; threadId: number }> => {
                const stopped = await waitFor(() => sentMessages.filter(m => m.event === 'stopped')[stop - 1],
                    110000, `stop ${stop}`);
                const threadId = stopped.body!.threadId as number;
                const { stackFrames } = await session.customRequest('stackTrace', { threadId }) as
                    { stackFrames: { line: number }[] };
                return { reason: stopped.body!.reason as string, line: stackFrames[0].line, threadId };
            };

            const atBreakpoint = await lineOfStop(1);
            assert.strictEqual(atBreakpoint.line, 8);
            await session.customRequest('next', { threadId: atBreakpoint.threadId });
            const afterStep = await lineOfStop(2);
            assert.strictEqual(afterStep.reason, 'step');
            assert.strictEqual(afterStep.line, 12, 'the step should end at the assertion');
        } finally {
            vscode.debug.removeBreakpoints([breakpoint]);
        }
    });

    test('Refuses to verify while a debug session is open', async function() {
        this.timeout(120000);
        await debugFirstError();
        await TestHelper.verify();
        await TestHelper.wait(2000);
        assert(vscode.debug.activeDebugSession?.type === 'viper', 'the debug session should still be running');
    });
});

/** Opens the test file, starts a debug session for its verification error and waits until it stops there. */
async function debugFirstError(): Promise<{ session: DebugSession; threadId: number; document: TextDocument }> {
    const document = await TestHelper.openAndVerify(DEBUG_ERROR);
    const diagnostic = await waitForVerificationError(document.uri);
    const started = await vscode.commands.executeCommand<boolean>(
        'viper.debugError', document.uri, diagnostic.range.start, diagnostic.message);
    assert(started, 'the debug session did not start');
    const stopped = await waitFor(() => sentMessages.find(m => m.event === 'stopped'), 110000, 'the debugger to stop');
    const session = vscode.debug.activeDebugSession;
    assert(session && session.type === 'viper', 'there is no Viper debug session');
    return { session, threadId: stopped.body!.threadId as number, document };
}

async function firstError(): Promise<Diagnostic> {
    const document = vscode.workspace.textDocuments.find(d => d.fileName.endsWith(DEBUG_ERROR))!;
    return waitForVerificationError(document.uri);
}

async function scopesOf(session: DebugSession, frameId: number): Promise<{ name: string; variablesReference: number }[]> {
    const { scopes } = await session.customRequest('scopes', { frameId }) as
        { scopes: { name: string; variablesReference: number }[] };
    return scopes;
}

async function variablesOf(session: DebugSession, variablesReference: number):
    Promise<{ name: string; value: string; variablesReference: number }[]> {
    const { variables } = await session.customRequest('variables', { variablesReference }) as
        { variables: { name: string; value: string; variablesReference: number }[] };
    return variables;
}

async function assumptionsOf(session: DebugSession, threadId: number): Promise<{ name: string }[]> {
    const { stackFrames } = await session.customRequest('stackTrace', { threadId }) as { stackFrames: { id: number }[] };
    const scopes = await scopesOf(session, stackFrames[0].id);
    return variablesOf(session, scopes.find(s => s.name === 'Assumptions')!.variablesReference);
}

/** Waits until the file has at least one verification error and returns the first one. */
async function waitForVerificationError(uri: Uri, timeoutMs = 20000): Promise<Diagnostic> {
    return waitFor(() => vscode.languages.getDiagnostics(uri)
        .find(d => d.source === 'viper' && d.severity === vscode.DiagnosticSeverity.Error),
        timeoutMs, `a verification error in ${uri.toString()}`);
}

async function waitFor<T>(poll: () => T | undefined, timeoutMs: number, what: string): Promise<T> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const value = poll();
        if (value !== undefined) return value;
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error(`timed out waiting for ${what}`);
}
