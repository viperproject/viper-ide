/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
 
'use strict';

import {BackendOutput, BackendOutputType} from './ViperProtocol';
import {Log} from './Log';

export class Progress {
    nofPredicates: number;
    nofFunctions: number;
    nofMethods: number;

    currentPredicates: number;
    currentFunctions: number;
    currentMethods: number;

    constructor(json: BackendOutput) {
        try {
            this.nofPredicates = json.nofPredicates;
            this.nofMethods = json.nofMethods;
            this.nofFunctions = json.nofFunctions;
            this.currentFunctions = 0;
            this.currentMethods = 0;
            this.currentPredicates = 0;
        } catch (e) {
            Log.error("Error initializing progress: " + e);
        }
    }

    updateProgress(json: BackendOutput) {
        try {
            switch (json.type) {
                case BackendOutputType.FunctionVerified:
                    this.currentFunctions++;
                    break;
                case BackendOutputType.MethodVerified:
                    this.currentMethods++;
                    break;
                case BackendOutputType.PredicateVerified:
                    this.currentPredicates++;
                    break;
            }
        } catch (e) {
            Log.error("Error updating progress: " + e);
        }
    }

    public toPercent(): number {
        let total = this.nofFunctions + this.nofMethods + this.nofPredicates;
        let current = this.currentFunctions + this.currentMethods + this.currentPredicates;
        return 100 * current / total;
    }
}