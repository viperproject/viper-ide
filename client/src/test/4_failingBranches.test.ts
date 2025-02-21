import assert from 'assert';
import TestHelper, { SETUP_TIMEOUT, SILICON, BRANCH1, BRANCH2 } from './TestHelper';
import * as fs from 'fs';
import * as path from 'path';

suite('ViperIDE Failing Branches Tests', () => {

    const tempFolderPath =  TestHelper.getTestDataPath('tmp');

    suiteSetup(async function() {
        this.timeout(SETUP_TIMEOUT);
        await TestHelper.setup();
    });

    suiteTeardown(async function() {
        await TestHelper.teardown();
    });

    async function testFile(file: string, expected : object) {
        await TestHelper.openFile(file);
        await TestHelper.waitForVerification(file);
        const actual = TestHelper.getDecorationOptions()[0]["range"];
        assert.deepEqual(actual, expected, "Beam ranges not equal");
    }

    test("1. nested branches - if", async function() {
        this.timeout(35000);
        TestHelper.resetErrors();
        await testFile(BRANCH1, {c:{"c":5,"e":0},e:{"c":11,"e":0}});
    });

    test("2. nested branches - else", async function() {
        this.timeout(35000);
        TestHelper.resetErrors();
        await testFile(BRANCH2, {c:{"c":11,"e":0},e:{"c":17,"e":0}});
    });
});
