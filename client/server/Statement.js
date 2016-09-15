'use strict';
//import {Position} from 'vscode';
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const ServerClass_1 = require('./ServerClass');
(function (PermissionType) {
    PermissionType[PermissionType["UnknownPermission"] = 0] = "UnknownPermission";
    PermissionType[PermissionType["ScalarPermission"] = 1] = "ScalarPermission";
})(exports.PermissionType || (exports.PermissionType = {}));
var PermissionType = exports.PermissionType;
(function (ValueType) {
    ValueType[ValueType["UnknownValue"] = 0] = "UnknownValue";
    ValueType[ValueType["NoValue"] = 1] = "NoValue";
    ValueType[ValueType["ObjectReferenceOrScalarValue"] = 2] = "ObjectReferenceOrScalarValue";
})(exports.ValueType || (exports.ValueType = {}));
var ValueType = exports.ValueType;
(function (NameType) {
    NameType[NameType["UnknownName"] = 0] = "UnknownName";
    NameType[NameType["QuantifiedName"] = 1] = "QuantifiedName";
    NameType[NameType["FunctionApplicationName"] = 2] = "FunctionApplicationName";
    NameType[NameType["PredicateName"] = 3] = "PredicateName";
    NameType[NameType["FieldReferenceName"] = 4] = "FieldReferenceName";
})(exports.NameType || (exports.NameType = {}));
var NameType = exports.NameType;
(function (ConditionType) {
    ConditionType[ConditionType["UnknownCondition"] = 0] = "UnknownCondition";
    ConditionType[ConditionType["EqualityCondition"] = 1] = "EqualityCondition";
    ConditionType[ConditionType["NullityCondition"] = 2] = "NullityCondition";
    ConditionType[ConditionType["WildCardCondition"] = 3] = "WildCardCondition";
    ConditionType[ConditionType["QuantifiedCondition"] = 4] = "QuantifiedCondition";
})(exports.ConditionType || (exports.ConditionType = {}));
var ConditionType = exports.ConditionType;
class Statement {
    constructor(index, formula, type, kind, position, store, heap, oldHeap, pcs, verifiable) {
        this.isErrorState = false;
        this.index = index;
        this.formula = formula;
        this.type = type;
        this.kind = kind;
        this.position = position;
        this.store = Statement.parseVariables(store);
        this.heap = Statement.parseHeap(heap);
        this.oldHeap = Statement.parseHeap(oldHeap);
        this.pcs = Statement.parsePathConditions(pcs);
        this.verifiable = verifiable;
    }
    static CreateFromSymbExLog(depth, parent, symbExLog, verifiable, task, wellformednessCheck) {
        let index = task.steps.length;
        let type = Statement.parseStatementType(symbExLog.type);
        let kind = symbExLog.kind;
        let position = ServerClass_1.Server.extractPosition(symbExLog.pos).pos;
        let formula = symbExLog.value;
        let statement;
        if (symbExLog.prestate) {
            let unpackedStore = symbExLog.prestate ? symbExLog.prestate.store : [];
            let unpackedHeap = symbExLog.prestate.heap;
            let unpackedOldHeap = symbExLog.prestate.oldHeap;
            let unpackedConditions = symbExLog.prestate.pcs;
            statement = new Statement(index, formula, type, kind, position, unpackedStore, unpackedHeap, unpackedOldHeap, unpackedConditions, verifiable);
        }
        else {
            statement = new Statement(index, formula, type, kind, position, [], [], [], [], verifiable);
        }
        //put the created Statement into the task's steps
        task.steps.push(statement);
        wellformednessCheck = wellformednessCheck || statement.kind === "WellformednessCheck";
        //hide structural logEntries such as method, globalBranch, ifThenElse
        //hide wellformedness checks
        statement.canBeShownAsDecoration = !!position && !wellformednessCheck;
        //hide simple steps like eval this, eval read, eval write
        if (type == ViperProtocol_1.StatementType.EVAL && formula && formula == "this" || formula == "write" || formula == "read") {
            statement.canBeShownAsDecoration = false;
        }
        //add depth info
        statement.depth = depth;
        //create the statements children
        statement.children = [];
        if (symbExLog.children) {
            symbExLog.children.forEach(child => {
                statement.children.push(Statement.CreateFromSymbExLog(depth + 1, statement, child, verifiable, task, wellformednessCheck));
            });
        }
        //add the parent information to complete the tree
        statement.parent = parent;
        return statement;
    }
    depthLevel() {
        if (this.parent) {
            let addDepth = this.parent.canBeShownAsDecoration && !this.parent.isBranch();
            return (addDepth ? 1 : 0) + this.parent.depthLevel();
        }
        else
            return 0;
        //return this.depth;
    }
    isBranch() {
        if (this.kind == "If" || this.kind == "Else" || this.kind == "Branch 1" || this.kind == "Branch 2") {
            return true;
        }
        return false;
    }
    //PARSING
    static parseVariables(store) {
        if (!store)
            return [];
        let result = [];
        store.forEach((variable) => {
            let parts = variable.split('->');
            if (parts.length == 2) {
                result.push({ name: parts[0].trim(), value: parts[1].trim(), variablesReference: 0 });
            }
            else {
                //TODO: make sure this doesn't happen
                result.push({ name: variable, value: "unknown", variablesReference: 0 });
            }
        });
        return result;
    }
    static unpack(line, model) {
        line = line.trim();
        if (line == "{},") {
            return [];
        }
        else {
            let res = [];
            line = line.substring(line.indexOf("(") + 1, line.lastIndexOf(")"));
            //line = model.fillInValues(line);
            return this.splitAtComma(line);
        }
    }
    getClientParent() {
        if (!this.parent)
            return null;
        if (this.parent.canBeShownAsDecoration) {
            return this.parent;
        }
        else {
            if (this.parent.index >= this.index) {
                Log_1.Log.error("The parent graph might not be cycle free. Cycles can lead to non-termination");
                return null;
            }
            return this.parent.getClientParent();
        }
    }
    static parsePathConditions(pcs) {
        if (!pcs)
            return [];
        let result = [];
        let indentation = 0;
        pcs.forEach(part => {
            part = part.trim();
            let qaFound = false;
            let qaAtIndentation = -1;
            for (let i = 0; i < part.length; i++) {
                if (part[i] === '(') {
                    indentation++;
                }
                else if (part[i] === ')') {
                    indentation--;
                    if (qaAtIndentation > indentation) {
                        qaFound = false;
                    }
                }
                else if (part[i] == 'Q' && i + 2 < part.length && part[i + 1] == 'A' && part[i + 2] == ' ') {
                    //we have a quantified condition stop splitting 
                    qaFound = true;
                    if (indentation == 0) {
                        break;
                    }
                    else {
                        qaAtIndentation = indentation;
                    }
                }
                if (!qaFound && i > 0 && indentation == 0 && part[i] == '&' && part[i - 1] == '&') {
                    //split
                    let head = part.substring(0, i - 1);
                    result.push(this.createCondition(head.trim()));
                    part = part.substring(i + 1, part.length);
                    i = 0;
                }
            }
            result.push(this.createCondition(part.trim()));
        });
        return result;
    }
    static createCondition(condition) {
        let unicodeCondition = this.unicodify(condition);
        let regex = condition.match(/^([\w$]+@\d+)\s+(==|!=)\s+([\w$]+@\d+|\d+|_|Null)$/);
        if (regex && regex[1] && regex[2] && regex[3]) {
            let lhs = regex[1];
            let rhs = regex[3];
            let value = regex[2] === "==";
            if (rhs === "Null") {
                return { raw: unicodeCondition, type: ConditionType.NullityCondition, value: value, lhs: lhs };
            }
            else if (rhs == "_") {
                return { raw: unicodeCondition, type: ConditionType.WildCardCondition, value: value, lhs: lhs };
            }
            return { raw: unicodeCondition, type: ConditionType.EqualityCondition, value: value, lhs: lhs, rhs: rhs };
        }
        if (condition.startsWith('∀')) {
            return { raw: unicodeCondition, type: ConditionType.QuantifiedCondition, value: true };
        }
        return { raw: unicodeCondition, type: ConditionType.UnknownCondition, value: true };
    }
    static unicodify(condition) {
        let done = false;
        while (!done) {
            let regex = condition.match(/^(.*?)QA\s((([\w$]+@\d+),?)+)\s::\s(.*)$/);
            if (regex && regex[1] && regex[2] && regex[5]) {
                let prefix = regex[1].trim();
                let variables = regex[2].split(',');
                let body = regex[5].trim();
                //simplify all bound variables: e.g. i@6 -> i
                variables.forEach((variable, i) => {
                    let atPos = variable.indexOf("@");
                    if (atPos > 0) {
                        let v = variable.substring(0, atPos);
                        body = body.replace(new RegExp(variable, 'g'), v);
                        variables[i] = v;
                    }
                });
                let vars = variables.join(",");
                condition = `${prefix} ∀ ${vars} :: ${body}`;
            }
            else {
                done = true;
            }
        }
        return condition.trim().replace(/==>/g, '⇒').replace(/<=/g, '≤').replace(/>=/g, '≥');
    }
    static parseHeap(parts) {
        if (!parts)
            return [];
        let res = [];
        try {
            parts.forEach((part) => {
                let arrowPosition = part.indexOf("->");
                let hashTagPosition = part.indexOf("#", arrowPosition);
                if (arrowPosition > 0) {
                    var name = part.substring(0, arrowPosition - 1).trim();
                    var value = part.substring(arrowPosition + 3, hashTagPosition - 1).trim();
                }
                else {
                    name = part.substring(0, hashTagPosition - 1).trim();
                    value = null;
                }
                let permission = part.substring(hashTagPosition + 2, part.length);
                res.push(new HeapChunk(name, value, permission));
            });
        }
        catch (e) {
            Log_1.Log.error("Heap parsing error: " + e);
        }
        return res;
    }
    static splitAtComma(line) {
        let parts = [];
        let i = 0;
        let bracketCount = 0;
        let lastIndex = -1;
        //walk through line to determine end of permission
        while (i < line.length) {
            let char = line[i];
            if (char == '(' || char == '[' || char == '{') {
                bracketCount++;
            }
            else if (char == ')' || char == ']' || char == '}') {
                bracketCount--;
            }
            else if (char == ',' && bracketCount == 0 && i + 1 < line.length && line[i + 1] == ' ') {
                parts.push(line.substring(lastIndex + 1, i).trim());
                lastIndex = i;
            }
            i++;
        }
        if (lastIndex + 1 < line.length) {
            parts.push(line.substring(lastIndex + 1, line.length));
        }
        return parts;
    }
    static parseFirstLine(line) {
        return /^(PRODUCE|EVAL|EXECUTE|CONSUME).*?(\d+:\d+|<no position>):\s*(.*)$/.exec(line);
    }
    static parseStatementType(s) {
        if (s) {
            let type = s.trim().toLowerCase();
            if (type === "consume") {
                return ViperProtocol_1.StatementType.CONSUME;
            }
            else if (type === "produce") {
                return ViperProtocol_1.StatementType.PRODUCE;
            }
            else if (type === "eval" || type === "evaluate") {
                return ViperProtocol_1.StatementType.EVAL;
            }
            else if (type === "execute") {
                return ViperProtocol_1.StatementType.EXECUTE;
            }
        }
        //Log.error("Unknown StatementType: " + s);
        return ViperProtocol_1.StatementType.UNKONWN;
    }
    //PRINTING:
    firstLine() {
        let positionString = (this.position ? (this.position.line + 1) + ":" + (this.position.character + 1) : "<no position>");
        let res = (this.kind ? this.kind + ": " : "") + ViperProtocol_1.StatementType[this.type] + " " + positionString + " " + this.formula;
        return res;
    }
    pretty() {
        let res = "\t" + this.firstLine() + "\n";
        res += "\tFormula: " + this.formula + "\n";
        if (this.store.length > 0) {
            res += "\tStore: \n";
            this.store.forEach(element => {
                res += "\t\t" + element.name + " = " + element.value + "\n";
            });
        }
        let heapChanged = !this.oldHeapEqualsHeap();
        if (this.heap.length > 0) {
            if (!heapChanged) {
                res += "\tHeap == OldHeap: \n";
            }
            else {
                res += "\tHeap: \n";
            }
            this.heap.forEach(element => {
                res += "\t\t" + element.pretty() + "\n";
            });
        }
        if (heapChanged && this.oldHeap.length > 0) {
            res += "\tOldHeap: \n";
            this.oldHeap.forEach(element => {
                res += "\t\t" + element.pretty() + "\n";
            });
        }
        if (this.pcs.length > 0) {
            res += "\tCondition: \n";
            this.pcs.forEach(element => {
                res += "\t\t" + element.raw + " (" + ConditionType[element.type] + ")\n";
            });
        }
        return res;
    }
    prettyConditions() {
        let result = [];
        this.pcs.forEach(cond => {
            switch (cond.type) {
                case ConditionType.NullityCondition:
                    result.push(cond.lhs + " " + (cond.value ? "==" : "!=") + " Null");
                    break;
                case ConditionType.EqualityCondition:
                    result.push(cond.lhs + " " + (cond.value ? "==" : "!=") + " " + cond.rhs);
                    break;
                case ConditionType.UnknownCondition:
                    result.push(cond.raw);
                    break;
                case ConditionType.WildCardCondition:
                    result.push(cond.raw);
                    break;
                case ConditionType.QuantifiedCondition:
                    result.push(cond.raw);
                    break;
            }
        });
        return result;
    }
    oldHeapEqualsHeap() {
        if (this.heap.length != this.oldHeap.length) {
            return false;
        }
        for (let i = 0; i < this.heap.length; i++) {
            if (!this.heap[i].equals(this.oldHeap[i])) {
                return false;
            }
        }
        return true;
    }
    toToolTip() {
        let res = this.firstLine() + "\n"; //StatementType[this.type] + " " + this.formula + "\n";
        if (this.store.length > 0) {
            res += "Store:\n";
            this.store.forEach(element => {
                res += "    " + element.name + " = " + element.value + "\n";
            });
        }
        if (this.heap.length > 0) {
            res += "Heap:\n";
            this.heap.forEach(element => {
                res += "    " + element.pretty() + "\n";
            });
        }
        return res;
    }
    fillInConcreteValues(model) {
        this.store.forEach(variable => {
            if (model.values.has(variable.value)) {
                variable.concreteValue = model.values.get(variable.value);
            }
        });
        this.heap.forEach(chunk => {
            if (chunk.value.type != ValueType.NoValue) {
                if (model.values.has(chunk.value.raw)) {
                    chunk.value.concreteValue = model.values.get(chunk.value.raw);
                }
            }
        });
    }
}
/*
    static CreateFromTrace(firstLine: string, store: string, heap: string, oldHeap: string, conditions: string, model: Model, index: number, methodIndex: number): Statement {
        Log.log("WARNING: creating from trace is deprecated", LogLevel.Debug);
        let parts = Statement.parseFirstLine(firstLine);
        if (!parts || !parts[1] || !parts[2] || !parts[3]) {
            Log.error('could not parse first Line of the silicon trace message : "' + firstLine + '"');
            return;
        }
        let type = Statement.parseStatementType(parts[1]);
        let position = Statement.parsePosition(parts[2]);
        let formula = parts[3].trim();
        let unpackedStore = this.unpack(store, model);
        let unpackedHeap = this.unpack(heap, model);
        let unpackedOldHeap = this.unpack(oldHeap, model);
        let unpackedConditions = this.unpack(conditions, model);
        return new Statement(index, type, "", position, unpackedStore, unpackedHeap, unpackedOldHeap, unpackedConditions, null);
    }
    */
Statement.numberOfStatementsCreatedFromSymbExLog = 0;
exports.Statement = Statement;
class HeapChunk {
    constructor(name, value, permission) {
        this.parsed = true;
        this.name = { raw: name, type: NameType.UnknownName };
        this.value = { raw: value, type: ValueType.UnknownValue };
        this.permission = { raw: permission, type: PermissionType.UnknownPermission };
        if (name.startsWith("QA")) {
            //TODO: handle quantified permission
            this.parsed = false;
            this.name.type = NameType.QuantifiedName;
        }
        else if (name.indexOf("[") > 0) {
            //TODO: handle function application
            this.parsed = false;
            this.name.type = NameType.FunctionApplicationName;
        }
        else if (/^\w+\(.*\)$/.test(name)) {
            this.name.type = NameType.PredicateName;
            this.name.receiver = name.substring(0, name.indexOf("("));
            this.name.arguments = name.substring(name.indexOf(";") + 1, name.length - 1).split(/,/);
            for (var i = 0; i < this.name.arguments.length; i++) {
                var element = this.name.arguments[i];
                this.name.arguments[i] = element.trim();
            }
        }
        else {
            let match = /^(\$?\w+(@\d+))(\(=.+?\))?(\.(\w+))+$/.exec(name);
            if (match && match[1] && match[5]) {
                //it's a field reference
                this.name.type = NameType.FieldReferenceName;
                this.name.receiver = match[1];
                this.name.field = match[5];
            }
            else {
                this.name.type = NameType.UnknownName;
                this.parsed = false;
            }
        }
        if (!value) {
            this.value.type = ValueType.NoValue;
        }
        else if (/^(\$?\w+(@\d+)?)(\(=.+?\))?$/.test(value)) {
            //it's an object reference or a scalar
            this.value.type = ValueType.ObjectReferenceOrScalarValue;
        }
        else {
            this.parsed = false;
            this.value.type = ValueType.UnknownValue;
        }
        if (/^(W|R|Z|\d+([\.,\/]\d+)?)$/.test(permission)) {
            this.permission.type = PermissionType.ScalarPermission;
        }
        else {
            this.permission.type = PermissionType.UnknownPermission;
        }
    }
    pretty() {
        return this.name.raw + (this.value.raw ? " -> " + this.value.raw : "") + " # " + this.permission.raw;
    }
    equals(other) {
        return this.name.raw == other.name.raw && this.permission.raw == other.permission.raw && this.value.raw == other.value.raw;
    }
}
exports.HeapChunk = HeapChunk;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RhdGVtZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9TdGF0ZW1lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBRWIsa0NBQWtDO0FBQ2xDLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUUxQixnQ0FBNkYsaUJBQWlCLENBQUMsQ0FBQTtBQUcvRyw4QkFBcUIsZUFBZSxDQUFDLENBQUE7QUFTckMsV0FBWSxjQUFjO0lBQUcsNkVBQWlCLENBQUE7SUFBRSwyRUFBZ0IsQ0FBQTtBQUFDLENBQUMsRUFBdEQsc0JBQWMsS0FBZCxzQkFBYyxRQUF3QztBQUFsRSxJQUFZLGNBQWMsR0FBZCxzQkFBc0QsQ0FBQTtBQUNsRSxXQUFZLFNBQVM7SUFBRyx5REFBWSxDQUFBO0lBQUUsK0NBQU8sQ0FBQTtJQUFFLHlGQUE0QixDQUFBO0FBQUMsQ0FBQyxFQUFqRSxpQkFBUyxLQUFULGlCQUFTLFFBQXdEO0FBQTdFLElBQVksU0FBUyxHQUFULGlCQUFpRSxDQUFBO0FBQzdFLFdBQVksUUFBUTtJQUFHLHFEQUFXLENBQUE7SUFBRSwyREFBYyxDQUFBO0lBQUUsNkVBQXVCLENBQUE7SUFBRSx5REFBYSxDQUFBO0lBQUUsbUVBQWtCLENBQUE7QUFBQyxDQUFDLEVBQXBHLGdCQUFRLEtBQVIsZ0JBQVEsUUFBNEY7QUFBaEgsSUFBWSxRQUFRLEdBQVIsZ0JBQW9HLENBQUE7QUFDaEgsV0FBWSxhQUFhO0lBQUcseUVBQWdCLENBQUE7SUFBRSwyRUFBaUIsQ0FBQTtJQUFFLHlFQUFnQixDQUFBO0lBQUUsMkVBQWlCLENBQUE7SUFBRSwrRUFBbUIsQ0FBQTtBQUFDLENBQUMsRUFBL0cscUJBQWEsS0FBYixxQkFBYSxRQUFrRztBQUEzSCxJQUFZLGFBQWEsR0FBYixxQkFBK0csQ0FBQTtBQUUzSDtJQXNGSSxZQUFZLEtBQWEsRUFBRSxPQUFlLEVBQUUsSUFBbUIsRUFBRSxJQUFZLEVBQUUsUUFBa0IsRUFB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