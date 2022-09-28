import * as assert from 'assert';
import TestHelper, { CARBON, SETUP_TIMEOUT, SILICON, SIMPLE } from './TestHelper';

suite('ViperIDE Stress Tests', () => {

    suiteSetup(async function() {
        this.timeout(SETUP_TIMEOUT);
        await TestHelper.setup();
    });

    suiteTeardown(async function() {
        await TestHelper.teardown();
    });

    test("1. multiple fast verification requests", async function() {
        this.timeout(11000);

        TestHelper.resetErrors();
        // 1 verification is expected, there should be no subsequent ones
        const verified = TestHelper.waitForVerification(SIMPLE)
            .then(() => TestHelper.waitForTimeout(5000, TestHelper.waitForVerification(SIMPLE)));
        await TestHelper.openFile(SIMPLE);
        //submit 10 verification requests
        for (let i = 0; i < 10; i++) {
            await TestHelper.verify();
        }
        const timeout = await verified;
        assert(timeout, "multiple verifications seen");
    });

    test("2. quickly change backends", async function() {
        this.timeout(50000);

        TestHelper.resetErrors();

        await TestHelper.selectBackend(CARBON);
        await TestHelper.openFile(SIMPLE);
        //submit 10 verification requests
        for (let i = 0; i < 10; i++) {
            await TestHelper.selectBackend(SILICON);
            await TestHelper.selectBackend(CARBON);
        }

        await TestHelper.wait(500);
        await TestHelper.selectBackend(SILICON);
        await TestHelper.waitForVerification(SIMPLE, SILICON);
        assert(!TestHelper.hasObservedInternalError());
    });

    test("3. quickly start, stop, and restart verification", async function() {
        this.timeout(15000);

        TestHelper.resetErrors();

        await TestHelper.openFile(SIMPLE);
        await TestHelper.verify();
        await TestHelper.stopVerification();
        const verified = TestHelper.waitForVerification(SIMPLE);
        await TestHelper.verify();
        await verified;
        assert(!TestHelper.hasObservedInternalError());
    });

    test("4. closing all files right after starting verificaiton", async function() {
        this.timeout(6000);

        TestHelper.resetErrors();

        const end = new Promise(resolve => {
            setTimeout(resolve, 5000);
        });
        await TestHelper.verify();
        await TestHelper.executeCommand('workbench.action.closeAllEditors');
        await end;
        assert(!TestHelper.hasObservedInternalError());
    });

    test("Test simple verification with carbon", async function() {
        this.timeout(35000);

        await TestHelper.openFile(SIMPLE);
        const carbonVerified = TestHelper.waitForVerification(SIMPLE, CARBON);
        await TestHelper.selectBackend(CARBON);
        await carbonVerified;
        const siliconVerified = TestHelper.waitForVerification(SIMPLE, SILICON);
        await TestHelper.selectBackend(SILICON);
        await siliconVerified;
    });
});
