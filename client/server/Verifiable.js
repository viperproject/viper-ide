/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const Statement_1 = require("./Statement");
class Verifiable {
    constructor(steps, index, data, task) {
        this.allSteps = steps;
        this.index = index;
        this.type = this.parseVerifiableType(data.kind);
        this.name = data.value;
        this.startIndex = task.steps.length;
        this.root = Statement_1.Statement.CreateFromSymbExLog(0, null, data, this, task, false);
        this.endIndex = task.steps.length - 1;
    }
    parseVerifiableType(type) {
        if (!type)
            return VerifiableType.UNKNOWN;
        type = type.toLowerCase().trim();
        if (type === "method")
            return VerifiableType.Method;
        if (type === "predicate")
            return VerifiableType.Predicate;
        if (type === "function")
            return VerifiableType.Function;
    }
    typeString() {
        return VerifiableType[this.type];
    }
    forAllExpansionStatesWithDecoration(state, task) {
        state.children.forEach(element => {
            if (element.canBeShownAsDecoration) {
                task(element);
            }
            else {
                this.forAllExpansionStatesWithDecoration(element, task);
            }
        });
    }
    getTopLevelStatesWithDecoration() {
        let result = [];
        for (let i = this.startIndex; i <= this.endIndex; i++) {
            let state = this.allSteps[i];
            if (state.depthLevel() == 0 && state.canBeShownAsDecoration) {
                result.push(state);
            }
        }
        return result;
    }
}
exports.Verifiable = Verifiable;
var VerifiableType;
(function (VerifiableType) {
    VerifiableType[VerifiableType["Method"] = 0] = "Method";
    VerifiableType[VerifiableType["Predicate"] = 1] = "Predicate";
    VerifiableType[VerifiableType["Function"] = 2] = "Function";
    VerifiableType[VerifiableType["UNKNOWN"] = 3] = "UNKNOWN";
})(VerifiableType = exports.VerifiableType || (exports.VerifiableType = {}));
;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmVyaWZpYWJsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmVyaWZpYWJsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0lBTUk7QUFFSixZQUFZLENBQUM7O0FBSWIsMkNBQXNDO0FBR3RDLE1BQWEsVUFBVTtJQVVuQixZQUFZLEtBQWtCLEVBQUUsS0FBYSxFQUFFLElBQW9CLEVBQUUsSUFBc0I7UUFDdkYsSUFBSSxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFDdEIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hELElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUN2QixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDO1FBQ3BDLElBQUksQ0FBQyxJQUFJLEdBQUcscUJBQVMsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzVFLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFTyxtQkFBbUIsQ0FBQyxJQUFZO1FBQ3BDLElBQUksQ0FBQyxJQUFJO1lBQUUsT0FBTyxjQUFjLENBQUMsT0FBTyxDQUFDO1FBQ3pDLElBQUksR0FBRyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDakMsSUFBSSxJQUFJLEtBQUssUUFBUTtZQUFFLE9BQU8sY0FBYyxDQUFDLE1BQU0sQ0FBQztRQUNwRCxJQUFJLElBQUksS0FBSyxXQUFXO1lBQUUsT0FBTyxjQUFjLENBQUMsU0FBUyxDQUFDO1FBQzFELElBQUksSUFBSSxLQUFLLFVBQVU7WUFBRSxPQUFPLGNBQWMsQ0FBQyxRQUFRLENBQUM7SUFDNUQsQ0FBQztJQUVELFVBQVU7UUFDTixPQUFPLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVELG1DQUFtQyxDQUFDLEtBQWdCLEVBQUUsSUFBZ0M7UUFDbEYsS0FBSyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUU7WUFDN0IsSUFBSSxPQUFPLENBQUMsc0JBQXNCLEVBQUU7Z0JBQ2hDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQzthQUNqQjtpQkFBTTtnQkFDSCxJQUFJLENBQUMsbUNBQW1DLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO2FBQzNEO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRUQsK0JBQStCO1FBQzNCLElBQUksTUFBTSxHQUFnQixFQUFFLENBQUM7UUFDN0IsS0FBSyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ25ELElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0IsSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxzQkFBc0IsRUFBRTtnQkFDekQsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQzthQUN0QjtTQUNKO1FBQ0QsT0FBTyxNQUFNLENBQUM7SUFDbEIsQ0FBQztDQUNKO0FBcERELGdDQW9EQztBQUVELElBQVksY0FBdUQ7QUFBbkUsV0FBWSxjQUFjO0lBQUcsdURBQU0sQ0FBQTtJQUFFLDZEQUFTLENBQUE7SUFBRSwyREFBUSxDQUFBO0lBQUUseURBQU8sQ0FBQTtBQUFDLENBQUMsRUFBdkQsY0FBYyxHQUFkLHNCQUFjLEtBQWQsc0JBQWMsUUFBeUM7QUFBQSxDQUFDIn0=