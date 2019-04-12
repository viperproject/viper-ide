/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
 
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