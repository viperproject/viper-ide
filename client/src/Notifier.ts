// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2011-2020 ETH Zurich.

import { Log } from "./Log";
import { LogLevel } from "./ViperProtocol";

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
        }
    });
}

export function notifyExtensionActivation(): void {
    Log.log("The extension is now active.", LogLevel.Info);
    isExtensionActive = true;
    waitingForExtensionActivation.forEach(listener => listener());
}
