import * as assert from 'assert';
import TestHelper, { LONG } from './TestHelper';

suite('Viper Tools Update Test', () => {

    suiteSetup(async function() {
        await TestHelper.setup();
        // these tests require a running backend:
        await TestHelper.startExtension();
    });

    suiteTeardown(async function() {
        await TestHelper.teardown();
    });

    test("Viper Tools Update Test", async function() {
        this.timeout(60000);

        await TestHelper.startViperToolsUpdate();
        const updateDone = TestHelper.waitForViperToolsUpdate();
        const verified = TestHelper.openAndVerify(LONG);

        const success = await updateDone;
        assert(success, "Viper Tools Update failed")
        await TestHelper.waitForBackendStarted();
        await verified;
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
});
