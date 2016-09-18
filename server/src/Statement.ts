'use strict';

//import {Position} from 'vscode';
import {Log} from './Log';
import {Model} from './Model';
import {SymbExLogEntry, MyProtocolDecorationOptions, StatementType, Position, LogLevel} from './ViperProtocol';
import {Verifiable} from './Verifiable';
import {VerificationTask} from './VerificationTask';
import {Server} from './ServerClass';

export interface Variable { name: string; value: string; variablesReference: number; concreteValue?: string; }
interface Name { raw: string; receiver?: string; field?: string; arguments?: string[]; type: NameType; }
interface Value { raw: string; type: ValueType; concreteValue?: string; }
interface Permission { raw: string; type: PermissionType; }
interface Condition { raw: string, type: ConditionType; value?: boolean; lhs?: string, rhs?: string }
interface SplitResult { prefix: string; rest: string; }

export enum PermissionType { UnknownPermission, ScalarPermission }
export enum ValueType { UnknownValue, NoValue, ObjectReferenceOrScalarValue }
export enum NameType { UnknownName, QuantifiedName, FunctionApplicationName, PredicateName, FieldReferenceName }
export enum ConditionType { UnknownCondition, EqualityCondition, NullityCondition, WildCardCondition, QuantifiedCondition }

export class Statement {
    type: StatementType;
    kind: string;
    public position: Position;
    formula: string;
    public store: Variable[];
    heap: HeapChunk[];
    oldHeap: HeapChunk[];
    pcs: Condition[];
    depth: number;
    index: number;
    isErrorState: boolean = false;
    verifiable: Verifiable;
    parent: Statement;
    children: Statement[];
    canBeShownAsDecoration: boolean;
    decorationOptions: MyProtocolDecorationOptions;

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
    static numberOfStatementsCreatedFromSymbExLog: number = 0;

    static CreateFromSymbExLog(depth: number, parent: Statement, symbExLog: SymbExLogEntry, verifiable: Verifiable, task: VerificationTask, wellformednessCheck: boolean) {
        let index = task.steps.length
        let type = Statement.parseStatementType(symbExLog.type);
        let kind = symbExLog.kind;
        let position = Server.extractPosition(symbExLog.pos).pos || { line: 0, character: 0 };
        let formula = symbExLog.value;
        let statement: Statement;
        if (symbExLog.prestate) {
            let unpackedStore = symbExLog.prestate ? symbExLog.prestate.store : [];
            let unpackedHeap = symbExLog.prestate.heap;
            let unpackedOldHeap = symbExLog.prestate.oldHeap;
            let unpackedConditions = symbExLog.prestate.pcs;
            statement = new Statement(index, formula, type, kind, position, unpackedStore, unpackedHeap, unpackedOldHeap, unpackedConditions, verifiable);
        } else {
            statement = new Statement(index, formula, type, kind, position, [], [], [], [], verifiable);
        }

        //put the created Statement into the task's steps
        task.steps.push(statement);

        wellformednessCheck = wellformednessCheck || statement.kind === "WellformednessCheck";

        //hide structural logEntries such as method, globalBranch, ifThenElse
        //hide wellformedness checks
        statement.canBeShownAsDecoration = !!position && !wellformednessCheck;

        //hide simple steps like eval this, eval read, eval write
        if (type == StatementType.EVAL && formula && formula == "this" || formula == "write" || formula == "read") {
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

    constructor(index: number, formula: string, type: StatementType, kind: string, position: Position, store: string[], heap: string[], oldHeap: string[], pcs: string[], verifiable: Verifiable) {
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
    public depthLevel(): number {
        if (this.parent) {
            let addDepth = this.parent.canBeShownAsDecoration && !this.parent.isBranch();
            return (addDepth ? 1 : 0) + this.parent.depthLevel();
        }
        else return 0;
        //return this.depth;
    }

    public isBranch(): boolean {
        if (this.kind == "If" || this.kind == "Else" || this.kind == "Branch 1" || this.kind == "Branch 2") {
            return true;
        }
        return false;
    }
    //PARSING
    private static parseVariables(store: string[]): Variable[] {
        if (!store) return [];
        let result = [];
        store.forEach((variable) => {
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

    private static unpack(line: string, model: Model): string[] {
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

    public getClientParent(): Statement {
        if (!this.parent) return null;
        if (this.parent.canBeShownAsDecoration) {
            return this.parent;
        } else {
            if (this.parent.index >= this.index) {
                Log.error("The parent graph might not be cycle free. Cycles can lead to non-termination");
                return null;
            }
            return this.parent.getClientParent();
        }
    }

    private static parsePathConditions(pcs: string[]): Condition[] {
        if (!pcs) return [];
        let result = [];
        let indentation = 0;
        pcs.forEach(part => {
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

    private static createCondition(condition: string): Condition {
        let unicodeCondition = this.unicodify(condition);
        let regex = condition.match(/^([\w$]+@\d+)\s+(==|!=)\s+([\w$]+@\d+|\d+|_|Null)$/);
        if (regex && regex[1] && regex[2] && regex[3]) {
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

    private static unicodify(condition: string): string {

        let done: boolean = false;
        while (!done) {
            let regex = condition.match(/^(.*?)QA\s((([\w$]+@\d+),?)+)\s::\s(.*)$/);
            if (regex && regex[1] && regex[2] && regex[5]) {
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

    private static parseHeap(parts: string[]): HeapChunk[] {
        if (!parts) return [];
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

    private static splitAtComma(line: string): string[] {
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

    private static parseFirstLine(line: string): RegExpExecArray {
        return /^(PRODUCE|EVAL|EXECUTE|CONSUME).*?(\d+:\d+|<no position>):\s*(.*)$/.exec(line);
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

    //PRINTING:
    public firstLine(): string {
        let positionString = (this.position ? (this.position.line + 1) + ":" + (this.position.character + 1) : "<no position>");
        let res: string = (this.kind ? this.kind + ": " : "") + StatementType[this.type] + " " + positionString + " " + this.formula;
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
        if (this.pcs.length > 0) {
            res += "\tCondition: \n";
            this.pcs.forEach(element => {
                res += "\t\t" + element.raw + " (" + ConditionType[element.type] + ")\n"
            });
        }
        return res;
    }

    public prettyConditions(): string[] {
        let result = [];
        this.pcs.forEach(cond => {
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
        let res = this.firstLine();// + "\n"; //StatementType[this.type] + " " + this.formula + "\n";
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
            let match = /^(\$?\w+(@\d+))(\(=.+?\))?(\.(\w+))+$/.exec(name)
            if (match && match[1] && match[5]) {
                //it's a field reference
                this.name.type = NameType.FieldReferenceName;
                this.name.receiver = match[1];
                this.name.field = match[5];
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

        if (/^(W|R|Z|\d+([\.,\/]\d+)?)$/.test(permission)) {
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