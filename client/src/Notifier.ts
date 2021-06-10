// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2011-2020 ETH Zurich.

// all credits go to prusti-assistant
/**
 * This module keeps a global state and allows clients to wait for the
 * following events:
 *  - The extension has been fully activated.
 */

let isExtensionActive = false;

type Listener = () => void;

const waitingForExtensionActivation: Listener[] = [];

export function waitExtensionActivation(): Promise<void> {
    return new Promise(resolve => {
        if (isExtensionActive) {
            // Resolve immediately
            resolve();
        } else {
            waitingForExtensionActivation.push(resolve);
            console.log(`waitingForExtensionActivation.length: ${waitingForExtensionActivation.length}`);
        }
    });
}

export function notifyExtensionActivation(): void {
    // Log.log("The extension is now active.", LogLevel.Info);
    console.log("The extension is now active.");
    isExtensionActive = true;
    console.log(`waitingForExtensionActivation.length: ${waitingForExtensionActivation.length}`);
    waitingForExtensionActivation.forEach(listener => listener());
}
