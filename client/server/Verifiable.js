'use strict';
const Statement_1 = require('./Statement');
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
(function (VerifiableType) {
    VerifiableType[VerifiableType["Method"] = 0] = "Method";
    VerifiableType[VerifiableType["Predicate"] = 1] = "Predicate";
    VerifiableType[VerifiableType["Function"] = 2] = "Function";
    VerifiableType[VerifiableType["UNKNOWN"] = 3] = "UNKNOWN";
})(exports.VerifiableType || (exports.VerifiableType = {}));
var VerifiableType = exports.VerifiableType;
;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmVyaWZpYWJsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmVyaWZpYWJsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFNYiw0QkFBd0IsYUFBYSxDQUFDLENBQUE7QUFHdEM7SUFVSSxZQUFZLEtBQWtCLEVBQUUsS0FBYSxFQUFFLElBQW9CLEVBQUUsSUFBc0I7UUFDdkYsSUFBSSxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFDdEIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hELElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUN2QixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDO1FBQ3BDLElBQUksQ0FBQyxJQUFJLEdBQUcscUJBQVMsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzVFLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFTyxtQkFBbUIsQ0FBQyxJQUFZO1FBQ3BDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUM7UUFDekMsSUFBSSxHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNqQyxFQUFFLENBQUMsQ0FBQyxJQUFJLEtBQUssUUFBUSxDQUFDO1lBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUM7UUFDcEQsRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFLLFdBQVcsQ0FBQztZQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDO1FBQzFELEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxVQUFVLENBQUM7WUFBQyxNQUFNLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQztJQUM1RCxDQUFDO0lBRUQsVUFBVTtRQUNOLE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFFRCxtQ0FBbUMsQ0FBQyxLQUFnQixFQUFFLElBQWdDO1FBQ2xGLEtBQUssQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLE9BQU87WUFDMUIsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQztnQkFDakMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ2xCLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixJQUFJLENBQUMsbUNBQW1DLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzVELENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFRCwrQkFBK0I7UUFDM0IsSUFBSSxNQUFNLEdBQWdCLEVBQUUsQ0FBQztRQUM3QixHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDcEQsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3QixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7Z0JBQzFELE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdkIsQ0FBQztRQUNMLENBQUM7UUFDRCxNQUFNLENBQUMsTUFBTSxDQUFDO0lBQ2xCLENBQUM7QUFDTCxDQUFDO0FBcERZLGtCQUFVLGFBb0R0QixDQUFBO0FBRUQsV0FBWSxjQUFjO0lBQUcsdURBQU0sQ0FBQTtJQUFFLDZEQUFTLENBQUE7SUFBRSwyREFBUSxDQUFBO0lBQUUseURBQU8sQ0FBQTtBQUFDLENBQUMsRUFBdkQsc0JBQWMsS0FBZCxzQkFBYyxRQUF5QztBQUFuRSxJQUFZLGNBQWMsR0FBZCxzQkFBdUQsQ0FBQTtBQUFBLENBQUMifQ==