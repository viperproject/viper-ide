'use strict';

//import {Position} from 'vscode';
import {Log} from './Log';
import {Model} from './Model';
import {Position, LogLevel} from './ViperProtocol';

export interface Variable { name: string; value: string; variablesReference: number; concreteValue?: string; }
interface Name { raw: string; receiver?: string; field?: string; arguments?: string[]; type: NameType; }
interface Value { raw: string; type: ValueType; concreteValue?: string; }
interface Permission { raw: string; type: PermissionType; }
interface Condition { raw: string, type: ConditionType; value?: boolean; lhs?: string, rhs?: string }
interface SplitResult { prefix: string; rest: string; }

export enum StatementType { EXECUTE, EVAL, CONSUME, PRODUCE, UNKONWN };
export enum PermissionType { UnknownPermission, ScalarPermission }
export enum ValueType { UnknownValue, NoValue, ObjectReferenceOrScalarValue }
export enum NameType { UnknownName, QuantifiedName, FunctionApplicationName, PredicateName, FieldReferenceName }
export enum ConditionType { UnknownCondition, EqualityCondition, NullityCondition, WildCardCondition, QuantifiedCondition }

export class Statement {
    type: StatementType;
    public position: Position;
    formula: string;
    public store: Variable[];
    heap: HeapChunk[];
    oldHeap: HeapChunk[];
    conditions: Condition[];
    //isInMethod: boolean;
    depth: number;
    index: number;
    methodIndex: number;
    isErrorState: boolean = false;
    logEntryIndex: number = -1;

    constructor(firstLine: string, store: string, heap: string, oldHeap: string, conditions: string, model: Model, index: number, methodIndex: number) {
        this.index = index;
        this.methodIndex = methodIndex;
        this.parseFirstLine(firstLine);
        this.store = this.parseVariables(this.unpack(store, model));
        this.heap = this.unpackHeap(this.unpack(heap, model));
        this.oldHeap = this.unpackHeap(this.unpack(oldHeap, model));
        //TODO: implement unpackConditions
        this.conditions = this.unpackPathConditions(this.unpack(conditions, model));
    }

    public depthLevel(): number {
        return this.depth;//this.isInMethod ? 0 : 1;
    }

    //PARSING
    private parseVariables(vars: string[]): Variable[] {
        let result = [];
        vars.forEach((variable) => {
            let parts: string[] = variable.split('->');
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

    private unpack(line: string, model: Model): string[] {
        line = line.trim();
        if (line == "{},") {
            return [];
        } else {
            let res = [];
            line = line.substring(line.indexOf("(") + 1, line.lastIndexOf(")"));
            //line = model.fillInValues(line);
            return this.splitAtComma(line);
        }
    }

    private unpackPathConditions(parts: string[]): Condition[] {
        let result = [];
        let indentation = 0;
        parts.forEach(part => {
            part = part.trim();
            let qaFound = false;
            let qaAtIndentation = -1;
            for (let i = 0; i < part.length; i++) {
                if (part[i] === '(') {
                    indentation++;
                } else if (part[i] === ')') {
                    indentation--;
                    if (qaAtIndentation > indentation) {
                        qaFound = false;
                    }
                } else if (part[i] == 'Q' && i + 2 < part.length && part[i + 1] == 'A' && part[i + 2] == ' ') {
                    //we have a quantified condition stop splitting 
                    qaFound = true;
                    if (indentation == 0) {
                        break;
                    } else {
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
            result.push(this.createCondition(part.trim()))
        });
        return result;
    }

    private createCondition(condition: string): Condition {
        let unicodeCondition = this.unicodify(condition);
        let regex = condition.match(/^([\w$]+@\d+)\s+(==|!=)\s+([\w$]+@\d+|\d+|_|Null)$/);
        if (regex && regex.length == 4) {
            let lhs = regex[1];
            let rhs = regex[3];
            let value = regex[2] === "==";

            if (rhs === "Null") {
                return { raw: unicodeCondition, type: ConditionType.NullityCondition, value: value, lhs: lhs };
            } else if (rhs == "_") {
                return { raw: unicodeCondition, type: ConditionType.WildCardCondition, value: value, lhs: lhs };
            }
            return { raw: unicodeCondition, type: ConditionType.EqualityCondition, value: value, lhs: lhs, rhs: rhs };
        }
        if (condition.startsWith('∀')) {
            return { raw: unicodeCondition, type: ConditionType.QuantifiedCondition, value: true };
        }
        return { raw: unicodeCondition, type: ConditionType.UnknownCondition, value: true };
    }

    private unicodify(condition: string): string {

        let done: boolean = false;
        while (!done) {
            let regex = condition.match(/^(.*?)QA\s((([\w$]+@\d+),?)+)\s::\s(.*)$/);
            if (regex && regex.length == 6) {
                let prefix = regex[1].trim();
                let variables: string[] = regex[2].split(',');
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
            } else {
                done = true;
            }
        }
        return condition.trim().replace(/==>/g, '⇒').replace(/<=/g, '≤').replace(/>=/g, '≥');

    }

    private unpackHeap(parts: string[]): HeapChunk[] {
        if (!parts) {
            return [];
        }
        let res = [];
        try {
            parts.forEach((part) => {
                let arrowPosition = part.indexOf("->");
                let hashTagPosition = part.indexOf("#", arrowPosition);
                if (arrowPosition > 0) {
                    var name: string = part.substring(0, arrowPosition - 1).trim();
                    var value: string = part.substring(arrowPosition + 3, hashTagPosition - 1).trim();
                } else {
                    name = part.substring(0, hashTagPosition - 1).trim();
                    value = null;
                }
                let permission = part.substring(hashTagPosition + 2, part.length);
                res.push(new HeapChunk(name, value, permission));
            });
        } catch (e) {
            Log.error("Heap parsing error: " + e);
        }
        return res;
    }

    private splitAtComma(line: string): string[] {
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
                parts.push(line.substring(lastIndex + 1, i).trim())
                lastIndex = i;
            }
            i++;
        }
        if (lastIndex + 1 < line.length) {
            parts.push(line.substring(lastIndex + 1, line.length))
        }
        return parts;
    }

    private parseFirstLine(line: string): Position {
        let parts = /^(PRODUCE|EVAL|EXECUTE|CONSUME).*?(\d+:\d+|<no position>):\s*(.*)$/.exec(line);
        if (!parts || parts.length != 4) {
            Log.error('could not parse first Line of the silicon trace message : "' + line + '"');
            return;
        }
        this.type = Statement.parseStatementType(parts[1]);
        this.position = Statement.parsePosition(parts[2]);
        this.formula = parts[3].trim();
    }

    public static parseStatementType(s: string): StatementType {
        if (s) {
            let type = s.trim().toLowerCase();
            if (type === "consume") {
                return StatementType.CONSUME;
            } else if (type === "produce") {
                return StatementType.PRODUCE;
            } else if (type === "eval" || type === "evaluate") {
                return StatementType.EVAL;
            } else if (type === "execute") {
                return StatementType.EXECUTE;
            }
        }
        //Log.error("Unknown StatementType: " + s);
        return StatementType.UNKONWN;
    }

    public static parsePosition(s: string): Position {
        if (s) {
            let regex = /^((\d+):(\d+)|<no position>):?$/.exec(s);
            if (regex && regex.length == 4) {
                //subtract 1 to confirm with VS Codes 0-based numbering
                let lineNr = +regex[2] - 1;
                let charNr = +regex[3] - 1;
                return { line: lineNr, character: charNr };
            }
        }
        return { line: 0, character: 0 };
    }

    //PRINTING:
    public firstLine(): string {
        let positionString = (this.position ? (this.position.line + 1) + ":" + (this.position.character + 1) : "<no position>");
        let res: string = StatementType[this.type] + " " + positionString + " " + this.formula;
        return res;
    }

    public pretty(): string {
        let res = "\t" + this.firstLine() + "\n";

        res += "\tFormula: " + this.formula + "\n";
        if (this.store.length > 0) {
            res += "\tStore: \n";
            this.store.forEach(element => {
                res += "\t\t" + element.name + " = " + element.value + "\n"
            });
        }

        let heapChanged = !this.oldHeapEqualsHeap();
        if (this.heap.length > 0) {
            if (!heapChanged) {
                res += "\tHeap == OldHeap: \n";
            } else {
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
        if (this.conditions.length > 0) {
            res += "\tCondition: \n";
            this.conditions.forEach(element => {
                res += "\t\t" + element.raw + " (" + ConditionType[element.type] + ")\n"
            });
        }
        return res;
    }

    public prettyConditions(): string[] {
        let result = [];
        this.conditions.forEach(cond => {
            switch (cond.type) {
                case ConditionType.NullityCondition:
                    result.push(cond.lhs + " " + (cond.value ? "==" : "!=") + " Null")
                    break;
                case ConditionType.EqualityCondition:
                    result.push(cond.lhs + " " + (cond.value ? "==" : "!=") + " " + cond.rhs)
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

    private oldHeapEqualsHeap(): boolean {
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

    public toToolTip(): string {
        let res = this.firstLine() + "\n"; //StatementType[this.type] + " " + this.formula + "\n";
        if (this.store.length > 0) {
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
        }
        return res;
    }

    public fillInConcreteValues(model: Model) {
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

export class HeapChunk {
    name: Name;
    value: Value;
    permission: Permission;

    public parsed: boolean = true;

    constructor(name: string, value: string, permission: string) {
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
            let matchedName = /^(\$?\w+(@\d+))(\(=.+?\))?(\.(\w+))+$/.exec(name)
            if (matchedName && matchedName.length == 6) {
                //it's a field reference
                this.name.type = NameType.FieldReferenceName;
                this.name.receiver = matchedName[1];
                this.name.field = matchedName[5];
            } else {
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
        } else {
            this.parsed = false;
            this.value.type = ValueType.UnknownValue;
        }

        if (/^(W|R|Z|\d+([\.\/]\d+)?)$/.test(permission)) {
            this.permission.type = PermissionType.ScalarPermission;
        } else {
            this.permission.type = PermissionType.UnknownPermission;
            //TODO: handle permissions like "1/4 - (2 * (b@93 ? 3 * $k@97 : $k@98))" from abstract.sil State 142 at 187:8
            //this.parsed = false;
        }
    }

    pretty(): string {
        return this.name.raw + (this.value.raw ? " -> " + this.value.raw : "") + " # " + this.permission.raw;
    }
    equals(other: HeapChunk): boolean {
        return this.name.raw == other.name.raw && this.permission.raw == other.permission.raw && this.value.raw == other.value.raw;
    }
}