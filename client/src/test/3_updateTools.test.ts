import * as assert from 'assert';
import TestHelper, { LONG, SETUP_TIMEOUT, SIMPLE } from './TestHelper';

suite('Viper Tools Update Test', () => {

    suiteSetup(async function() {
        this.timeout(SETUP_TIMEOUT);
        await TestHelper.setup();
    });

    suiteTeardown(async function() {
        await TestHelper.teardown();
    });

    test("Viper Tools Update Test & test abort of first verification", async function() {
        this.timeout(60000);
        TestHelper.resetErrors();

        const updateDone = TestHelper.waitForViperToolsUpdate();
        const activated = TestHelper.waitForExtensionActivation();
        const restarted = TestHelper.waitForExtensionRestart();
        await TestHelper.startViperToolsUpdate();

        await updateDone;
        TestHelper.log("Viper Tools Update done");
        await activated;
        await restarted;
        TestHelper.log("Extension has been restarted after performing Viper Tools update");
        
        // open LONG such that it will be verified as soon as backend has started
        // note that we open the file only after awaiting the extension's restart as
        // the command to open the file otherwise seems to get lost
        const aborted = TestHelper.waitForAbort();
        /*
        await TestHelper.openFile(LONG);

        
        TestHelper.log("extension has activated");
        await TestHelper.verify();
        */
       await TestHelper.openFile(LONG);

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

        await TestHelper.closeAllFiles();
    });

    test("Viper Tools Update Test", async function() {
        this.timeout(60000);
        TestHelper.resetErrors();

        const updateDone = TestHelper.waitForViperToolsUpdate();
        const activated = TestHelper.waitForExtensionActivation();
        await TestHelper.startViperToolsUpdate();

        await updateDone;
        TestHelper.log("Viper Tools Update done");
        await activated;
        TestHelper.log("extension has activated");

        assert (!TestHelper.hasObservedInternalError());
    });

    test("Test verification is possible after viper tools update", async function() {
        this.timeout(40000);
        await TestHelper.openAndVerify(SIMPLE);
    });
});
