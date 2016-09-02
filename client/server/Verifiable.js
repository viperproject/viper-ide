'use strict';
const Statement_1 = require('./Statement');
class Verifiable {
    constructor(index, data, task) {
        this.index = index;
        this.type = this.parseVerifiableType(data.kind);
        this.name = data.value;
        this.startIndex = task.steps.length;
        this.root = Statement_1.Statement.CreateFromSymbExLog(0, null, data, this, task);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmVyaWZpYWJsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVmVyaWZpYWJsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFNYiw0QkFBd0IsYUFBYSxDQUFDLENBQUE7QUFHdEM7SUFXSSxZQUFZLEtBQWEsRUFBRSxJQUFvQixFQUFFLElBQXNCO1FBQ25FLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDdkIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUNwQyxJQUFJLENBQUMsSUFBSSxHQUFHLHFCQUFTLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3JFLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQ3RDLDhDQUE4QztJQUNsRCxDQUFDO0lBRU8sbUJBQW1CLENBQUMsSUFBWTtRQUNwQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDO1FBQ3pDLElBQUksR0FBRyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDakMsRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFLLFFBQVEsQ0FBQztZQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDO1FBQ3BELEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxXQUFXLENBQUM7WUFBQyxNQUFNLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQztRQUMxRCxFQUFFLENBQUMsQ0FBQyxJQUFJLEtBQUssVUFBVSxDQUFDO1lBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUM7SUFDNUQsQ0FBQztJQUVELFVBQVU7UUFDTixNQUFNLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNyQyxDQUFDO0FBQ0wsQ0FBQztBQWhDWSxrQkFBVSxhQWdDdEIsQ0FBQTtBQUVELFdBQVksY0FBYztJQUFHLHVEQUFNLENBQUE7SUFBRSw2REFBUyxDQUFBO0lBQUUsMkRBQVEsQ0FBQTtJQUFFLHlEQUFPLENBQUE7QUFBQyxDQUFDLEVBQXZELHNCQUFjLEtBQWQsc0JBQWMsUUFBeUM7QUFBbkUsSUFBWSxjQUFjLEdBQWQsc0JBQXVELENBQUE7QUFBQSxDQUFDIn0=