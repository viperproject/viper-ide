import TestHelper, { CARBON, SILICON, SIMPLE } from './TestHelper';

suite('Extension Startup', () => {

    suiteSetup(async function() {
        await TestHelper.setup();
    });

    suiteTeardown(async function() {
        await TestHelper.teardown();
    });

    test("Language Detection, and Backend Startup test.", async function() {
        this.timeout(40000);
        let started = TestHelper.waitForBackendStarted(SILICON);
        await TestHelper.openFile(SIMPLE);
        await started;

        started = TestHelper.waitForBackendStarted(CARBON);
        TestHelper.selectBackend(CARBON);
        await started;

        // switch back:
        started = TestHelper.waitForBackendStarted(SILICON);
        TestHelper.selectBackend(SILICON);
        await started;
    });

    test("Test simple verification with silicon", async function(){
        this.timeout(25000);
        await TestHelper.openAndVerify(SIMPLE);
    });
});
