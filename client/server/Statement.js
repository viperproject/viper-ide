/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const Log_1 = require("./Log");
const ViperProtocol_1 = require("./ViperProtocol");
const ServerClass_1 = require("./ServerClass");
const DotGraph_1 = require("./DotGraph");
var PermissionType;
(function (PermissionType) {
    PermissionType[PermissionType["UnknownPermission"] = 0] = "UnknownPermission";
    PermissionType[PermissionType["ScalarPermission"] = 1] = "ScalarPermission";
})(PermissionType = exports.PermissionType || (exports.PermissionType = {}));
var ValueType;
(function (ValueType) {
    ValueType[ValueType["UnknownValue"] = 0] = "UnknownValue";
    ValueType[ValueType["NoValue"] = 1] = "NoValue";
    ValueType[ValueType["ObjectReferenceOrScalarValue"] = 2] = "ObjectReferenceOrScalarValue";
})(ValueType = exports.ValueType || (exports.ValueType = {}));
var NameType;
(function (NameType) {
    NameType[NameType["UnknownName"] = 0] = "UnknownName";
    NameType[NameType["QuantifiedName"] = 1] = "QuantifiedName";
    NameType[NameType["FunctionApplicationName"] = 2] = "FunctionApplicationName";
    NameType[NameType["PredicateName"] = 3] = "PredicateName";
    NameType[NameType["FieldReferenceName"] = 4] = "FieldReferenceName";
    NameType[NameType["MagicWand"] = 5] = "MagicWand";
})(NameType = exports.NameType || (exports.NameType = {}));
var ConditionType;
(function (ConditionType) {
    ConditionType[ConditionType["UnknownCondition"] = 0] = "UnknownCondition";
    ConditionType[ConditionType["EqualityCondition"] = 1] = "EqualityCondition";
    ConditionType[ConditionType["NullityCondition"] = 2] = "NullityCondition";
    ConditionType[ConditionType["WildCardCondition"] = 3] = "WildCardCondition";
    ConditionType[ConditionType["QuantifiedCondition"] = 4] = "QuantifiedCondition";
})(ConditionType = exports.ConditionType || (exports.ConditionType = {}));
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
            //TODO: handle permissions like "1/4 - (2 * (b@93 ? 3 * $k@97 : $k@98))" from abstract.sil State 142 at 187:8
            //this.parsed = false;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RhdGVtZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9TdGF0ZW1lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztJQU1JO0FBRUosWUFBWSxDQUFDOztBQUViLCtCQUEwQjtBQUUxQixtREFBK0g7QUFHL0gsK0NBQXFDO0FBQ3JDLHlDQUFtQztBQVNuQyxJQUFZLGNBQXNEO0FBQWxFLFdBQVksY0FBYztJQUFHLDZFQUFpQixDQUFBO0lBQUUsMkVBQWdCLENBQUE7QUFBQyxDQUFDLEVBQXRELGNBQWMsR0FBZCxzQkFBYyxLQUFkLHNCQUFjLFFBQXdDO0FBQ2xFLElBQVksU0FBaUU7QUFBN0UsV0FBWSxTQUFTO0lBQUcseURBQVksQ0FBQTtJQUFFLCtDQUFPLENBQUE7SUFBRSx5RkFBNEIsQ0FBQTtBQUFDLENBQUMsRUFBakUsU0FBUyxHQUFULGlCQUFTLEtBQVQsaUJBQVMsUUFBd0Q7QUFDN0UsSUFBWSxRQUErRztBQUEzSCxXQUFZLFFBQVE7SUFBRyxxREFBVyxDQUFBO0lBQUUsMkRBQWMsQ0FBQTtJQUFFLDZFQUF1QixDQUFBO0lBQUUseURBQWEsQ0FBQTtJQUFFLG1FQUFrQixDQUFBO0lBQUUsaURBQVMsQ0FBQTtBQUFDLENBQUMsRUFBL0csUUFBUSxHQUFSLGdCQUFRLEtBQVIsZ0JBQVEsUUFBdUc7QUFDM0gsSUFBWSxhQUErRztBQUEzSCxXQUFZLGFBQWE7SUFBRyx5RUFBZ0IsQ0FBQTtJQUFFLDJFQUFpQixDQUFBO0lBQUUseUVBQWdCLENBQUE7SUFBRSwyRUFBaUIsQ0FBQTtJQUFFLCtFQUFtQixDQUFBO0FBQUMsQ0FBQyxFQUEvRyxhQUFhLEdBQWIscUJBQWEsS0FBYixxQkFBYSxRQUFrRztBQUUzSCxNQUFhLFNBQVM7SUFzRmxCLFlBQVksS0FBYSxFQUFFLE9BQWUsRUFBRSxJQUFtQixFQUFFLElBQVksRUFBRSxRQUFrQixFQUFFLEtBQXVCLEVBQUUsSUFBYyxFQUFFLE9BQWlC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