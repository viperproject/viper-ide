/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
 
'use strict';

export class Timer {

    lastExec = Date.now();
    interval = null;
    checkingFrequency = 200;
    constructor(func, timeout) {
        this.interval = setInterval(() => {
            let now = Date.now();
            if (now - this.lastExec > timeout) {
                this.lastExec = now;
                func();
            }
        }, this.checkingFrequency);
    }

    stop() {
        clearInterval(this.interval);
    }

    dispose() {
        this.stop();
    }

    reset() {
        this.lastExec = Date.now();
    }
}