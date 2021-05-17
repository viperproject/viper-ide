import * as assert from 'assert';
import TestHelper, { EMPTY_TXT, LONG, SIMPLE } from './TestHelper';

suite('ViperIDE Tests', () => {

    suiteSetup(async function() {
        await TestHelper.setup();
        // these tests require a running backend:
        await TestHelper.startExtension();
    });

    suiteTeardown(async function() {
        await TestHelper.teardown();
    });
    /*
    test("Test abort", async function() {
        this.timeout(30000);

        TestHelper.resetErrors();

        await TestHelper.openAndVerify(LONG);
        // reverify:
        await TestHelper.verify();
        // stop the verification after 300ms
        setTimeout(() => {
            TestHelper.stopVerification()
        }, 300);

        await TestHelper.waitForAbort();
        await TestHelper.checkForRunningProcesses(false, true, true);
        await TestHelper.openAndVerify(LONG);
        assert (!TestHelper.hasObservedInternalError());
    });

    test("Test closing files", async function(){
        this.timeout(30000);
        TestHelper.resetErrors();

        TestHelper.openAndVerify(LONG);
        await TestHelper.wait(500);
        await TestHelper.closeFile();
        await TestHelper.openFile(SIMPLE);
        await TestHelper.wait(200);
        await TestHelper.stopVerification();
        await TestHelper.closeFile();
        await TestHelper.openFile(LONG);
        await TestHelper.waitForVerification(LONG);
        assert (!TestHelper.hasObservedInternalError());
    });

    test("Test not verifying verified files", async function(){
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
        */
        //         it("Test zooming", function (done) {
        //             log("Test zooming");
        //             this.timeout(20000);
        
        //             executeCommand("workbench.action.zoomIn").then(() => {
        //                 return wait(5000);
        //             }).then(() => {
        //                 return executeCommand("workbench.action.zoomOut");
        //             }).then(() => {
        //                 return waitForTimeout(9000, waitForBackendStarted())
        //             }).then((timeoutHit) => {
        //                 if (timeoutHit) {
        //                     done();
        //                 } else {
        //                     throw new Error("backend was restarted, but it should not be");
        //                 }
        //             });
        //         });
        
        //         it("Test autoVerify", function (done) {
        //             log("Test autoVerify");
        //             this.timeout(2000);
        
        //             //turn auto verify back on in the end 
        //             let timer = setTimeout(() => {
        //                 executeCommand("viper.toggleAutoVerify")
        //             }, 1500);
        
        //             executeCommand("viper.toggleAutoVerify").then(() => {
        //                 return openFile(LONG)
        //             }).then(() => {
        //                 return openFile(SIMPLE)
        //             }).then(() => {
        //                 return waitForTimeout(1000, waitForVerificationStart(LONG))
        //             }).then((timeoutHit) => {
        //                 if (timeoutHit) {
        //                     clearTimeout(timer);
        //                     executeCommand("viper.toggleAutoVerify").then(() => done())
        //                 } else {
        //                     throw new Error("verification was started even if autoVerify is disabled");
        //                 }
        //             })
        //         });
        
        //         //requires SIMPLE open
        //         it("Test Helper Methods", function (done) {
        //             log("Test Helper Methods");
        //             this.timeout(1000);
        
        //             checkAssert(Helper.formatProgress(12.9), "13%", "formatProgress");
        //             checkAssert(Helper.formatSeconds(12.99), "13.0 seconds", "formatSeconds");
        //             checkAssert(Helper.isViperSourceFile("/folder/file.vpr"), true, "isViperSourceFile unix path");
        //             checkAssert(Helper.isViperSourceFile("..\\.\\folder\\file.sil"), true, "isViperSourceFile relavive windows path");
        //             checkAssert(!Helper.isViperSourceFile("C:\\absolute\\path\\file.ts"), true, "isViperSourceFile absolute windows path");
        //             checkAssert(path.basename(Helper.uriToString(Helper.getActiveFileUri())), SIMPLE, "active file");
        
        //             done();
        //         });
        
        //         it("Test opening logFile", function (done) {
        //             log("Test opening logFile");
        //             this.timeout(2000);
        
        //             executeCommand('viper.openLogFile');
        //             waitForLogFile().then(() => {
        //                 executeCommand('workbench.action.closeActiveEditor');
        //                 return wait(500);
        //             }).then(() => {
        //                 done();
        //             })
        //         });
});
