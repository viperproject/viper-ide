import * as assert from 'assert';
import { Common } from '../ViperProtocol';
import TestHelper, { DATA_ROOT, SETUP_TIMEOUT } from './TestHelper';

suite('Workspace Tests', () => {

    suiteSetup(async function() {
        this.timeout(SETUP_TIMEOUT);
        await TestHelper.setup();
        await TestHelper.startExtension();
    });

    suiteTeardown(async function() {
        await TestHelper.teardown();
    });

    test("Test Verification of all files in folder", async function() {
        this.timeout(200000);

        await TestHelper.closeAllFiles();
        await TestHelper.waitForIdle();
        await TestHelper.executeCommand('viper.verifyAllFilesInWorkspace', Common.uriToString(DATA_ROOT));
        const result = await TestHelper.waitForVerificationOfAllFilesInWorkspace();
        assert(result.verified == result.total, `partially verified workspace: (${result.verified}/${result.total})`);
    });
});
