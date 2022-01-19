import TestHelper, { CARBON, EMPTY, SETUP_TIMEOUT, SILICON, SIMPLE } from './TestHelper';

suite('Extension Startup', () => {

    suiteSetup(async function() {
        this.timeout(SETUP_TIMEOUT);
        await TestHelper.setup();
    });

    suiteTeardown(async function() {
        await TestHelper.teardown();
    });

    test("Language Detection, and Silicon Backend Startup test.", async function() {
        this.timeout(60000);
        const verified = TestHelper.waitForVerification(SIMPLE, SILICON);
        await TestHelper.openFile(SIMPLE);
        await verified;
    });

    test("Test simple verification with Silicon and a different file", async function(){
        this.timeout(40000);
        await TestHelper.openAndVerify(EMPTY);
    });

    test("Language Detection, and Carbon Backend Startup test.", async function() {
        this.timeout(40000);
        const started = TestHelper.waitForBackendStarted(CARBON);
        TestHelper.selectBackend(CARBON);
        await TestHelper.openFile(SIMPLE);
        await started;
    });

    test("Test simple verification with Carbon", async function(){
        this.timeout(25000);
        await TestHelper.openAndVerify(SIMPLE);
        // no need to switch backend back as this is the last test case of this suite.
        // TestHelper will make sure that the extension is properly restarted for the
        // next test suite.
    });
});
