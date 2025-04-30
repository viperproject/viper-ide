import assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { Helper } from '../Helper';
import { Log } from '../Log';
import { Common } from '../ViperProtocol';
import TestHelper, { EMPTY_TXT, LONG, SETUP_TIMEOUT, SIMPLE, WARNINGS } from './TestHelper';

suite('ViperIDE Tests', () => {

    suiteSetup(async function() {
        this.timeout(SETUP_TIMEOUT);
        await TestHelper.setup();
    });

    suiteTeardown(async function() {
        await TestHelper.teardown();
    });
    
    test("Test abort", async function() {
        this.timeout(30000);

        TestHelper.resetErrors();

        await TestHelper.openAndVerify(LONG);
        await TestHelper.verify();
        // stop the verification after 0.3s because it will be fast due to caching
        setTimeout(() => {
            TestHelper.log("timeout triggered: stopping verification");
            TestHelper.stopVerification()
                .catch(err => Log.error(`error while stopping verification: ${err}`));
        }, 300);

        await TestHelper.waitForVerificationOrAbort();
        //await TestHelper.wait(20000); // This is really stupid, but Windows fails to clean up processes quickly in this case for some reason
        //await TestHelper.checkForRunningProcesses(false, true, true);
        await TestHelper.openAndVerify(LONG);
        assert (!TestHelper.hasObservedInternalError());
    });

    test("Test warnings", async function() {
        this.timeout(10000);

        const document = await TestHelper.openAndVerify(WARNINGS);
        
        await TestHelper.wait(5000);
        const all_diag = vscode.languages.getDiagnostics().map( d => d[0]);
        Log.error("Uri: " + document.uri);
        Log.error("Diagnostic keys: " + all_diag);
        assert(all_diag.includes(document.uri), "Document not in all diagnostics");
        
        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        checkAssert(diagnostics.length, 2, `Amount of diagnostics`);
        checkAssert(diagnostics[0].severity, vscode.DiagnosticSeverity.Warning, "First diagnostic");
        checkAssert(diagnostics[1].severity, vscode.DiagnosticSeverity.Warning, "Second diagnostic");
    });


    test("Test closing files", async function() {
        this.timeout(30000);
        TestHelper.resetErrors();

        await TestHelper.openAndVerify(LONG);
        await TestHelper.wait(500);
        await TestHelper.closeFile();
        await TestHelper.openFile(SIMPLE);
        await TestHelper.wait(200);
        await TestHelper.stopVerification();
        await TestHelper.closeFile();
        await TestHelper.openFile(LONG);
        await TestHelper.verify(); // otherwise, `LONG` might not get verified because it has been verified in the past
        await TestHelper.waitForVerification(LONG);
        assert (!TestHelper.hasObservedInternalError());
    });

    test("Test not verifying verified files", async function() {
        this.timeout(40000);

        await TestHelper.openAndVerify(SIMPLE);
        // simulate context switch by opening non-viper file
        await TestHelper.openFile(EMPTY_TXT);
        const verificationStart = TestHelper.waitForVerificationStart(SIMPLE);
        await TestHelper.openFile(SIMPLE);
        // wait 1000ms for verification start - it should not start
        const timeoutHit = TestHelper.waitForTimeout(1000, verificationStart);
        assert(timeoutHit, "unwanted reverification of verified file after switching context");
    });
    
    test("Test zooming", async function() {
        this.timeout(20000);

        const activated = TestHelper.waitForExtensionActivation();
        await TestHelper.executeCommand("workbench.action.zoomIn")
        await TestHelper.wait(5000);
        await TestHelper.executeCommand("workbench.action.zoomOut");
        const timeoutHit = await TestHelper.waitForTimeout(9000, activated);
        assert(timeoutHit, "Viper IDE was activated, but it should not be");
    });
        
    test("Test autoVerify", async function() {
        this.timeout(3000);

        // disable auto verify:
        await TestHelper.executeCommand("viper.toggleAutoVerify");
        const started = TestHelper.waitForVerificationStart(LONG);
        await TestHelper.openFile(LONG);
        await TestHelper.openFile(SIMPLE);
        const timeoutHit = await TestHelper.waitForTimeout(1000, started);
        assert(timeoutHit, "verification was started even if autoVerify is disabled");
        // turn auto verify back on:
        await TestHelper.executeCommand("viper.toggleAutoVerify");
    });

    test("Test Helper Methods", async function() {
        this.timeout(2000);

        await TestHelper.openFile(SIMPLE);
        checkAssert(path.basename(Common.uriToString(Helper.getActiveVerificationUri())), SIMPLE, "active file");

        checkAssert(Helper.formatProgress(12.9), "13%", "formatProgress");
        checkAssert(Helper.formatSeconds(12.99), "13.0s", "formatSeconds");
        checkAssert(Helper.isViperSourceFile("/folder/file.vpr"), true, "isViperSourceFile unix path");
        checkAssert(Helper.isViperSourceFile("..\\.\\folder\\file.sil"), true, "isViperSourceFile relavive windows path");
        checkAssert(!Helper.isViperSourceFile("C:\\absolute\\path\\file.ts"), true, "isViperSourceFile absolute windows path");
    });
        
    test("Test opening logFile", async function() {
        this.timeout(2000);

        const opened = TestHelper.waitForLogFile();
        await TestHelper.executeCommand('viper.openLogFile');
        await opened;
        await TestHelper.closeFile();
    });
});

function checkAssert<T>(seen: T, expected: T, message: string): void {
    assert(expected === seen, message + ": Expected: " + expected + " Seen: " + seen);
}
