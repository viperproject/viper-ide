'use strict';

//import {Position} from 'vscode';
import {Log} from './Log';
import {Model} from './Model';
import {Position, LogLevel} from './ViperProtocol';

interface Variable { name: string; value: string; variablesReference: number; }
interface Name { raw: string; receiver?: string; field?: string; arguments?: string[]; type: NameType; }
interface Value { raw: string; type: ValueType; }
interface Permission { raw: string; type: PermissionType; }
interface SplitResult { prefix: string; rest: string; }

export enum StatementType { EXECUTE, EVAL, CONSUME, PRODUCE };
export enum PermissionType { UnknownPermission, ScalarPermission }
export enum ValueType { UnknownValue, NoValue, ObjectReferenceOrScalarValue }
export enum NameType { UnknownName, QuantifiedName, FunctionApplicationName, PredicateName, FieldReferenceName }

export class Statement {
    type: StatementType;
    public position: Position;
    formula: string;
    public store: Variable[];
    heap: HeapChunk[];
    oldHeap: HeapChunk[];
    conditions: string[];
    isInMethod: boolean;
    index:number;
    methodIndex:number;
    isErrorState:boolean = false;

    constructor(firstLine: string, store: string, heap: string, oldHeap: string, conditions: string, model: Model,index:number,methodIndex:number) {
        this.index = index;
        this.methodIndex = methodIndex;
        this.parseFirstLine(firstLine);
        this.store = this.parseVariables(this.unpack(store, model));
        this.heap = this.unpackHeap(this.unpack(heap, model));
        this.oldHeap = this.unpackHeap(this.unpack(oldHeap, model));
        //TODO: implement unpackConditions
        this.conditions = this.unpack(conditions, model);
    }

    public depthLevel(): number {
        return this.isInMethod ? 0 : 1;
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
            else if (char == ',' && bracketCount == 0) {
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
        let parts = /(.*?)\s+((\d*):(\d*)|<no position>):\s+(.*)/.exec(line);
        if (!parts) {
            Log.error('could not parse first Line of the silicon trace message : "' + line + '"');
            return;
        }
        let type = parts[1];
        if (type === "CONSUME") {
            this.type = StatementType.CONSUME;
        } else if (type === "PRODUCE") {
            this.type = StatementType.PRODUCE;
        } else if (type === "EVAL") {
            this.type = StatementType.EVAL;
        } else if (type === "EXECUTE") {
            this.type = StatementType.EXECUTE;
        }
        if (parts.length == 6) {
            //subtract 1 to confirm with VS Codes 0-based numbering
            if (!parts[3] && !parts[4]) {
                this.position = { line: 0, character: 0 };
            } else {
                let lineNr = +parts[3] - 1;
                let charNr = +parts[4] - 1;
                this.position = { line: lineNr, character: charNr };
            }
            this.formula = parts[5].trim();
        }
        if (parts.length == 4) {
            this.formula = parts[3].trim();
        }
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
                res += "\t\t" + element + "\n"
            });
        }
        return res;
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
            this.name.arguments = name.substring(name.indexOf("(") + 1, name.length - 1).split(/[;,]/);
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