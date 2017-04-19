'use strict';

export class TimedPromise<T> extends Promise<T> {
    constructor(callback, ms?) {
        super((resolve, reject) => {
            callback(resolve, reject);
            if (ms) {
                setTimeout(() => {
                    reject("Timed out");
                }, ms);
            }
        });
    }
}