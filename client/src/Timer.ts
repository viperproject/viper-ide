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