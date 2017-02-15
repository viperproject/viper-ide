'use strict';
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const ServerClass_1 = require('./ServerClass');
const DotGraph_1 = require('./DotGraph');
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
    NameType[NameType["MagicWand"] = 5] = "MagicWand";
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
        this._depthLevel = -1;
        this.isErrorState = false;
        this.index = index;
        this.formula = formula;
        this.type = type;
        this.kind = kind;
        this.position = position;
        this.store = Statement.parseStore(store);
        this.heap = Statement.parseHeap(heap);
        this.oldHeap = Statement.parseHeap(oldHeap);
        this.pcs = Statement.parsePathConditions(pcs);
        this.verifiable = verifiable;
    }
    static CreateFromSymbExLog(depth, parent, symbExLog, verifiable, task, wellformednessCheck) {
        let index = task.steps.length;
        let type = Statement.parseStatementType(symbExLog.type);
        let kind = symbExLog.kind;
        let position = symbExLog.pos ? ServerClass_1.Server.extractPosition(symbExLog.pos).pos || { line: 0, character: 0 } : null;
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
        if (type == ViperProtocol_1.StatementType.EVAL && formula && /^[\w$]+(\.[\w$]+)*$/.test(formula) || /^\d+$/.test(formula)) {
            statement.canBeShownAsDecoration = false;
            statement.isTrivialState = true;
        }
        //add depth info
        statement._depth = depth;
        //create the statements children
        statement.children = [];
        if (symbExLog.children) {
            symbExLog.children.forEach(child => {
                statement.children.push(Statement.CreateFromSymbExLog(depth + 1, statement, child, verifiable, task, wellformednessCheck));
            });
        }
        //add the parent information to complete the tree
        statement.parent = parent;
        //collapse unreachable comments
        if (statement.kind == "comment" && statement.formula == "Unreachable") {
            if (statement.children.length == 0 && statement.parent) {
                if (!statement.parent.formula || !statement.parent.formula.endsWith("Unreachable")) {
                    statement.parent.formula = " Unreachable";
                }
                statement.isTrivialState = true;
            }
        }
        return statement;
    }
    hasNonTrivialChildren() {
        if (!this.children)
            return false;
        return this.children.some(child => !child.isTrivialState);
    }
    depthLevel() {
        if (this._depthLevel < 0) {
            //compute only once
            if (this.parent) {
                let addDepth = this.parent.canBeShownAsDecoration && !this.parent.isBranch();
                this._depthLevel = (addDepth ? 1 : 0) + this.parent.depthLevel();
            }
            else {
                this._depthLevel = 0;
            }
        }
        return this._depthLevel;
    }
    isBranch() {
        if (this.kind == "If" || this.kind == "Else" || this.kind == "Branch 1" || this.kind == "Branch 2") {
            return true;
        }
        return false;
    }
    //PARSING
    static parseStore(store) {
        if (!store)
            return [];
        let result = [];
        store.forEach((variable) => {
            let parts = variable.value.split('->');
            if (parts.length == 2) {
                result.push({ name: parts[0].trim(), type: variable.type, value: parts[1].trim(), variablesReference: 0 });
            }
            else {
                //TODO: make sure this doesn't happen
                Log_1.Log.log("Warning: unexpected format in store: expected: a -> b, found: " + variable, ViperProtocol_1.LogLevel.Debug);
                result.push({ name: variable.value, type: variable.type, value: "unknown", variablesReference: 0 });
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
        if (!parts || parts.length == 0)
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
                else if (hashTagPosition > 0) {
                    name = part.substring(0, hashTagPosition - 1).trim();
                    value = null;
                }
                else {
                    name = part;
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
        return ViperProtocol_1.StatementType.UNKONWN;
    }
    //PRINTING:
    firstLine() {
        let positionString = (this.position ? (this.position.line + 1) + ":" + (this.position.character + 1) : "<no position>");
        let res = (this.kind ? this.kind + ": " : "") + ViperProtocol_1.StatementType[this.type] + " " + positionString + " " + this.formula;
        return res;
    }
    toDotLabel() {
        return DotGraph_1.DotNode.escapeLabel((this.canBeShownAsDecoration ? this.decorationOptions.numberToDisplay + " " : "") +
            (this.kind ? this.kind + ": " : "") +
            (this.type != ViperProtocol_1.StatementType.UNKONWN ? ViperProtocol_1.StatementType[this.type] + " " : "") +
            (this.formula ? this.formula : ""));
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
        let res = this.firstLine(); // + "\n"; //StatementType[this.type] + " " + this.formula + "\n";
        /*if (this.store.length > 0) {
            res += "Store:\n";
            this.store.forEach(element => {
                res += "    " + element.name + " = " + element.value + "\n"
            });
        }

        if (this.heap.length > 0) {
            res += "Heap:\n";
            this.heap.forEach(element => {
                res += "    " + element.pretty() + "\n";
            });
        }*/
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
        else if (name.startsWith("wand@")) {
            //TODO: handle magic wands
            this.parsed = false;
            this.name.type = NameType.MagicWand;
        }
        else if (name.indexOf("[") > 0) {
            this.name.type = NameType.FunctionApplicationName;
            this.name.receiver = name.substring(0, name.indexOf("["));
            let endOfTypeDeclaration = name.indexOf("]");
            this.name.arguments = name.substring(name.indexOf("(", endOfTypeDeclaration) + 1, name.lastIndexOf(")")).split(/,/);
            if (name.lastIndexOf(").") >= 0) {
                this.name.field = name.substring(name.lastIndexOf(").") + 2, name.length).trim();
            }
            for (var i = 0; i < this.name.arguments.length; i++) {
                this.name.arguments[i] = this.name.arguments[i].trim();
            }
        }
        else if (/^\w+\(.*\)$/.test(name)) {
            this.name.type = NameType.PredicateName;
            this.name.receiver = name.substring(0, name.indexOf("("));
            this.name.arguments = name.substring(name.indexOf(";") + 1, name.length - 1).split(/,/);
            for (var i = 0; i < this.name.arguments.length; i++) {
                this.name.arguments[i] = this.name.arguments[i].trim();
            }
        }
        else {
            let match = /^(\$?\w+(@[\d$]+))(\(=.+?\))?(\.(\w+))+$/.exec(name);
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
        else if (/^(\$?[\w:]+(@[\d$]+)?)(\(=.+?\))?$/.test(value)) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RhdGVtZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9TdGF0ZW1lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBRWIsc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBRTFCLGdDQUE2RyxpQkFBaUIsQ0FBQyxDQUFBO0FBRy9ILDhCQUFxQixlQUFlLENBQUMsQ0FBQTtBQUNyQywyQkFBc0IsWUFBWSxDQUFDLENBQUE7QUFTbkMsV0FBWSxjQUFjO0lBQUcsNkVBQWlCLENBQUE7SUFBRSwyRUFBZ0IsQ0FBQTtBQUFDLENBQUMsRUFBdEQsc0JBQWMsS0FBZCxzQkFBYyxRQUF3QztBQUFsRSxJQUFZLGNBQWMsR0FBZCxzQkFBc0QsQ0FBQTtBQUNsRSxXQUFZLFNBQVM7SUFBRyx5REFBWSxDQUFBO0lBQUUsK0NBQU8sQ0FBQTtJQUFFLHlGQUE0QixDQUFBO0FBQUMsQ0FBQyxFQUFqRSxpQkFBUyxLQUFULGlCQUFTLFFBQXdEO0FBQTdFLElBQVksU0FBUyxHQUFULGlCQUFpRSxDQUFBO0FBQzdFLFdBQVksUUFBUTtJQUFHLHFEQUFXLENBQUE7SUFBRSwyREFBYyxDQUFBO0lBQUUsNkVBQXVCLENBQUE7SUFBRSx5REFBYSxDQUFBO0lBQUUsbUVBQWtCLENBQUE7SUFBRSxpREFBUyxDQUFBO0FBQUMsQ0FBQyxFQUEvRyxnQkFBUSxLQUFSLGdCQUFRLFFBQXVHO0FBQTNILElBQVksUUFBUSxHQUFSLGdCQUErRyxDQUFBO0FBQzNILFdBQVksYUFBYTtJQUFHLHlFQUFnQixDQUFBO0lBQUUsMkVBQWlCLENBQUE7SUFBRSx5RUFBZ0IsQ0FBQTtJQUFFLDJFQUFpQixDQUFBO0lBQUUsK0VBQW1CLENBQUE7QUFBQyxDQUFDLEVBQS9HLHFCQUFhLEtBQWIscUJBQWEsUUFBa0c7QUFBM0gsSUFBWSxhQUFhLEdBQWIscUJBQStHLENBQUE7QUFFM0g7SUFzRkksWUFBWSxLQUFhLEVBQUUsT0FBZSxFQUFF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