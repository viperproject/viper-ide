import * as assert from 'assert';
import TestHelper, { LONG, SETUP_TIMEOUT, SIMPLE } from './TestHelper';

suite('Viper Tools Update Test', () => {

    suiteSetup(async function() {
        this.timeout(SETUP_TIMEOUT);
        await TestHelper.setup();
        // these tests require a running backend:
        await TestHelper.startExtension();
    });

    suiteTeardown(async function() {
        await TestHelper.teardown();
    });

    test("Viper Tools Update Test", async function() {
        this.timeout(60000);

        const updateDone = TestHelper.waitForViperToolsUpdate();
        await TestHelper.startViperToolsUpdate();
        const success = await updateDone;
        assert(success, "Viper Tools Update failed")
        await TestHelper.waitForBackendStarted();
    });

    test("Test abort of first verification after viper tools update", async function(){
        this.timeout(30000);
        TestHelper.resetErrors();

        // stop the verification after 1000ms
        setTimeout(() => {
            TestHelper.stopVerification()
        }, 1000);

        TestHelper.openAndVerify(LONG);

        await TestHelper.waitForAbort();
        await TestHelper.checkForRunningProcesses(false, false, true);

        //reverify
        await TestHelper.openAndVerify(LONG);
        assert (!TestHelper.hasObservedInternalError());
    });

    test("Test verification is possible after viper tools update", async function() {
        this.timeout(40000);
        await TestHelper.openAndVerify(SIMPLE);
    });
});
