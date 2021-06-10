import TestHelper, { CARBON, SETUP_TIMEOUT, SILICON, SIMPLE } from './TestHelper';

suite('Extension Startup', () => {

    suiteSetup(async function() {
        this.timeout(SETUP_TIMEOUT);
        await TestHelper.setup();
    });

    suiteTeardown(async function() {
        await TestHelper.teardown();
    });

    test("Language Detection, and Silcon Backend Startup test.", async function() {
        this.timeout(40000);
        const started = TestHelper.waitForBackendStarted(SILICON);
        await TestHelper.openFile(SIMPLE);
        await started;
    });

    test("Test simple verification with Silicon", async function(){
        this.timeout(25000);
        await TestHelper.openAndVerify(SIMPLE);
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
