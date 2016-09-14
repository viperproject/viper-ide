'use strict';
const Statement_1 = require('./Statement');
class Verifiable {
    constructor(index, data, task) {
        this.index = index;
        this.type = this.parseVerifiableType(data.kind);
        this.name = data.value;
        this.startIndex = task.steps.length;
        this.root = Statement_1.Statement.CreateFromSymbExLog(0, null, data, this, task, false);
        this.endIndex = task.steps.length - 1;
        //TODO: fill in the verifiable's start and end
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmVyaWZpYWJsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmVyaWZpYWJsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFNYiw0QkFBd0IsYUFBYSxDQUFDLENBQUE7QUFHdEM7SUFXSSxZQUFZLEtBQWEsRUFBRSxJQUFvQixFQUFFLElBQXNCO1FBQ25FLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDdkIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUNwQyxJQUFJLENBQUMsSUFBSSxHQUFHLHFCQUFTLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1RSxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUN0Qyw4Q0FBOEM7SUFDbEQsQ0FBQztJQUVPLG1CQUFtQixDQUFDLElBQVk7UUFDcEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFBQyxNQUFNLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQztRQUN6QyxJQUFJLEdBQUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2pDLEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxRQUFRLENBQUM7WUFBQyxNQUFNLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQztRQUNwRCxFQUFFLENBQUMsQ0FBQyxJQUFJLEtBQUssV0FBVyxDQUFDO1lBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUM7UUFDMUQsRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFLLFVBQVUsQ0FBQztZQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDO0lBQzVELENBQUM7SUFFRCxVQUFVO1FBQ04sTUFBTSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDckMsQ0FBQztBQUNMLENBQUM7QUFoQ1ksa0JBQVUsYUFnQ3RCLENBQUE7QUFFRCxXQUFZLGNBQWM7SUFBRyx1REFBTSxDQUFBO0lBQUUsNkRBQVMsQ0FBQTtJQUFFLDJEQUFRLENBQUE7SUFBRSx5REFBTyxDQUFBO0FBQUMsQ0FBQyxFQUF2RCxzQkFBYyxLQUFkLHNCQUFjLFFBQXlDO0FBQW5FLElBQVksY0FBYyxHQUFkLHNCQUF1RCxDQUFBO0FBQUEsQ0FBQyJ9