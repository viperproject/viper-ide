/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
class TimedPromise extends Promise {
    constructor(callback, ms) {
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
exports.TimedPromise = TimedPromise;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVGltZWRQcm9taXNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9UaW1lZFByb21pc2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztJQU1JO0FBRUosWUFBWSxDQUFDOztBQUViLE1BQWEsWUFBZ0IsU0FBUSxPQUFVO0lBQzNDLFlBQVksUUFBUSxFQUFFLEVBQUc7UUFDckIsS0FBSyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ3RCLFFBQVEsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDMUIsSUFBSSxFQUFFLEVBQUU7Z0JBQ0osVUFBVSxDQUFDLEdBQUcsRUFBRTtvQkFDWixNQUFNLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ3hCLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQzthQUNWO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0NBQ0o7QUFYRCxvQ0FXQyJ9