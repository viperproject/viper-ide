import assert from 'assert';
import { readdir } from 'fs/promises';
import { Helper } from '../Helper';
import TestHelper, { CARBON_NAME, DATA_ROOT, LONG, EMPTY, SETUP_TIMEOUT, SILICON_NAME, SIMPLE } from './TestHelper';

suite('ViperIDE Stress Tests', () => {

    suiteSetup(async function() {
        this.timeout(SETUP_TIMEOUT);
        await TestHelper.setup();
    });

    suiteTeardown(async function() {
        await TestHelper.teardown();
    });

    test("1. multiple fast verification requests", async function() {
        this.timeout(15000);

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

        await TestHelper.selectBackend(CARBON_NAME);
        await TestHelper.openFile(SIMPLE);
        //submit 10 verification requests
        for (let i = 0; i < 10; i++) {
            await TestHelper.selectBackend(SILICON_NAME);
            await TestHelper.selectBackend(CARBON_NAME);
        }

        await TestHelper.wait(500);
        await TestHelper.selectBackend(SILICON_NAME);
        await TestHelper.waitForVerification(SIMPLE, SILICON_NAME);
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

    test("4. closing all files right after starting verification", async function() {
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

    test("5. rapidly switch between files without waiting for verification", async function() {
        this.timeout(10000);

        TestHelper.resetErrors();

        const files = [SIMPLE, LONG, EMPTY, SIMPLE, LONG, EMPTY, SIMPLE, LONG, EMPTY];
        for (const file of files) {
            await TestHelper.openFile(file);
        }

        await TestHelper.openFile(SIMPLE);
        await TestHelper.verify();
        await TestHelper.waitForVerification(SIMPLE);
        assert(!TestHelper.hasObservedInternalError(), "internal error detected while rapidly switching files");
    });

    test("6. verify all files in workspace in quick succession", async function() {
        this.timeout(100000);

        TestHelper.resetErrors();

        const allFiles = await readdir(DATA_ROOT);
        const viperFiles = allFiles.filter(f => Helper.isViperSourceFile(f));
        assert(viperFiles.length > 0, "no Viper files found in test data");

        for (const fileName of viperFiles) {
            await TestHelper.openAndVerify(fileName);
        }
        assert(!TestHelper.hasObservedInternalError(), "internal error detected while verifying files in quick succession");
    });

});
