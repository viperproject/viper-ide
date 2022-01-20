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

    test("Viper Tools Update Test & test abort of first verification", async function() {
        this.timeout(60000);
        TestHelper.resetErrors();

        const updateDone = TestHelper.waitForViperToolsUpdate();
        const backendStarted = TestHelper.waitForBackendStarted();
        await TestHelper.startViperToolsUpdate();

        // open LONG such that it will be verified as soon as backend has started:
        const aborted = TestHelper.waitForAbort();
        await TestHelper.openFile(LONG);

        const success = await updateDone;
        assert(success, "Viper Tools Update failed")
        TestHelper.log("Viper Tools Update done");
        await backendStarted;
        TestHelper.log("backend started");

        // stop the verification after 1s
        setTimeout(() => {
            TestHelper.log("timeout triggered: stopping verification");
            TestHelper.stopVerification()
        }, 1000);

        // wait until verification is aborted:
        await aborted;
        TestHelper.log("verification has been aborted");
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
