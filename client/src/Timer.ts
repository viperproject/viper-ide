/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2020 ETH Zurich.
  */

export class Timer {

    lastExec = Date.now();
    interval = null;
    checkingFrequency = 200;
    constructor(func: () => void, timeout: number) {
        this.interval = setInterval(() => {
            const now = Date.now();
            if (now - this.lastExec > timeout) {
                this.lastExec = now;
                func();
            }
        }, this.checkingFrequency);
    }

    stop(): void {
        clearInterval(this.interval);
    }

    dispose(): void {
        this.stop();
    }

    reset(): void {
        this.lastExec = Date.now();
    }
}
