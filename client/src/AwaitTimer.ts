/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2022 ETH Zurich.
  */

/** similar to Timer but awaits the function and only then sets up a new interval */
export class AwaitTimer {
    private running: Boolean = true;
    private stopped: Promise<void>;

    constructor(fn: () => Promise<void>, intervalMs: number) {
        const self = this;
        this.stopped = new Promise(resolve => {
            (async function loop() {
                await fn();
                if (self.running) {
                    setTimeout(loop, intervalMs);
                } else {
                    resolve();
                }
            })();
        });
    }

    /** completes as soon as the timer and currently executing function has been stopped */
    stop(): Promise<void> {
        this.running = false;
        return this.stopped;
    }

    dispose(): Promise<void> {
        return this.stop();
    }
}
