/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const ViperProtocol_1 = require("./ViperProtocol");
const Log_1 = require("./Log");
class Progress {
    constructor(json) {
        try {
            this.nofPredicates = json.nofPredicates;
            this.nofMethods = json.nofMethods;
            this.nofFunctions = json.nofFunctions;
            this.currentFunctions = 0;
            this.currentMethods = 0;
            this.currentPredicates = 0;
        }
        catch (e) {
            Log_1.Log.error("Error initializing progress: " + e);
        }
    }
    updateProgress(json) {
        try {
            switch (json.type) {
                case ViperProtocol_1.BackendOutputType.FunctionVerified:
                    this.currentFunctions++;
                    break;
                case ViperProtocol_1.BackendOutputType.MethodVerified:
                    this.currentMethods++;
                    break;
                case ViperProtocol_1.BackendOutputType.PredicateVerified:
                    this.currentPredicates++;
                    break;
            }
        }
        catch (e) {
            Log_1.Log.error("Error updating progress: " + e);
        }
    }
    toPercent() {
        let total = this.nofFunctions + this.nofMethods + this.nofPredicates;
        let current = this.currentFunctions + this.currentMethods + this.currentPredicates;
        return 100 * current / total;
    }
}
exports.Progress = Progress;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVG90YWxQcm9ncmVzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVG90YWxQcm9ncmVzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0lBTUk7QUFFSixZQUFZLENBQUM7O0FBRWIsbURBQWlFO0FBQ2pFLCtCQUEwQjtBQUUxQixNQUFhLFFBQVE7SUFTakIsWUFBWSxJQUFtQjtRQUMzQixJQUFJO1lBQ0EsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDO1lBQ3hDLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQztZQUNsQyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUM7WUFDdEMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLENBQUMsQ0FBQztZQUMxQixJQUFJLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQztZQUN4QixJQUFJLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxDQUFDO1NBQzlCO1FBQUMsT0FBTyxDQUFDLEVBQUU7WUFDUixTQUFHLENBQUMsS0FBSyxDQUFDLCtCQUErQixHQUFHLENBQUMsQ0FBQyxDQUFDO1NBQ2xEO0lBQ0wsQ0FBQztJQUVELGNBQWMsQ0FBQyxJQUFtQjtRQUM5QixJQUFJO1lBQ0EsUUFBUSxJQUFJLENBQUMsSUFBSSxFQUFFO2dCQUNmLEtBQUssaUNBQWlCLENBQUMsZ0JBQWdCO29CQUNuQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztvQkFDeEIsTUFBTTtnQkFDVixLQUFLLGlDQUFpQixDQUFDLGNBQWM7b0JBQ2pDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztvQkFDdEIsTUFBTTtnQkFDVixLQUFLLGlDQUFpQixDQUFDLGlCQUFpQjtvQkFDcEMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7b0JBQ3pCLE1BQU07YUFDYjtTQUNKO1FBQUMsT0FBTyxDQUFDLEVBQUU7WUFDUixTQUFHLENBQUMsS0FBSyxDQUFDLDJCQUEyQixHQUFHLENBQUMsQ0FBQyxDQUFDO1NBQzlDO0lBQ0wsQ0FBQztJQUVNLFNBQVM7UUFDWixJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQztRQUNyRSxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUM7UUFDbkYsT0FBTyxHQUFHLEdBQUcsT0FBTyxHQUFHLEtBQUssQ0FBQztJQUNqQyxDQUFDO0NBQ0o7QUE3Q0QsNEJBNkNDIn0=