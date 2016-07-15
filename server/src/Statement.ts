'use strict';

//import {Position} from 'vscode';
import {Log} from './Log';
import {Model} from './Model';
import {LogLevel} from './ViperProtocol';
let graphviz = require("graphviz");

export enum StatementType { EXECUTE, EVAL, CONSUME, PRODUCE };

interface Position {
    line: number;
    character: number;
}

interface Variable {
    name: string;
    value: string;
    variablesReference: number;
}

class HeapChunk {
    name: string;
    value: string;
    permission: string;

    public parsed: boolean = true;

    type: string;

    constructor(name: string, value: string, permission: string) {
        this.name = name;
        this.value = value;
        this.permission = permission;

        if (name.startsWith("QA")) {
            //TODO: handle quantified permission
            this.parsed = false;
            this.type = "Quantified Name";
        }
        else if (name.indexOf("[") > 0) {
            //TODO: handle method invocation
            this.parsed = false;
            this.type = "Method Invocation Name";
        }
        else if (/^(\$?\w+(@\d+))(\(=.+?\))?(\.\w+)+$/.test(name)) {
            //it's a field reference
            this.type = "Field Reference Name";
        } else {
            this.type = "Unknown Name";
            this.parsed = false;
        }

        if (!value) {
            this.type += ", No Value";
        }
        else if (/^(\$?\w+(@\d+)?)(\(=.+?\))?$/.test(value)) {
            //it's an object reference or a scalar
            this.type += ", Object reference or scalar Value";
        } else {
            this.parsed = false;
            this.type += ", Unknown Value";
        }

        if (/^(W|R|Z|\d+([\.\/]\d+)?)$/.test(permission)) {
            this.type += ", Scalar Permission";
        } else {
            this.type += ", Unknown Permission";
            this.parsed = false;
        }

        this.type += " -> " + (this.parsed ? "Parsed" : "Not Parsed");
    }

    pretty(): string {
        return this.name + (this.value ? " -> " + this.value : "") + " # " + this.permission;
    }
    equals(other: HeapChunk): boolean {
        return this.name == other.name && this.permission == other.permission && this.value == other.value;
    }
}

interface SplitResult {
    prefix: string;
    rest: string;
}

export class Statement {
    type: StatementType;
    public position: Position;
    formula: string;
    public store: Variable[];
    heap: HeapChunk[];
    oldHeap: HeapChunk[];
    conditions: string[];

    public isFromMethod: boolean = false;

    constructor(firstLine: string, store: string, heap: string, oldHeap: string, conditions: string, model: Model) {
        this.parseFirstLine(firstLine);
        this.store = this.parseVariables(this.unpack(store, model));
        this.heap = this.unpackHeap(this.unpack(heap, model));
        this.oldHeap = this.unpackHeap(this.unpack(oldHeap, model));
        //TODO: implement unpackConditions
        this.conditions = this.unpack(conditions, model);
    }

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
            line = model.fillInValues(line);
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

    public firstLine(): string {
        let positionString = (this.position ? (this.position.line + 1) + ":" + (this.position.character + 1) : "<no position>");
        let res: string = StatementType[this.type] + " " + positionString;
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

    public printGraphVizHeap(heap: HeapChunk[]) {
    }

    public toToolTip(): string {
        let res = StatementType[this.type] + " " + this.formula + "\n";
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

    public static buildGraphVizExampleGraph() {
        try{
        let g = graphviz.digraph("G");
        let n1 = g.addNode("Hello", { "color": "blue" });
        n1.set("style", "filled");
        let e = g.addEdge(n1, "World");
        e.set("color", "red");
        g.addNode("World");
        g.addEdge( n1, "World" );
        Log.log( g.to_dot() ,LogLevel.Debug);
        g.setGraphVizPath( "C:\\" );
        g.output("png","graphvizTest.png");
        }catch(e){
            Log.error("Graphviz Error: " + e);
        }
    }

    getHeapChunkVisualization(): string {

        let header = `digraph heap {
rankdir=LR
node [shape = record];

subgraph cluster_local {
graph[style=dotted]
label="Local"\n`;

        let intermediate = `}

subgraph cluster_heap{
graph[style=dotted]
label="heap"\n`;

        let footer: string = "}\n}\n";

        let localVars = "";
        this.store.forEach(variable => {
            localVars += `${variable.name} [label = "${variable.name}\nval: ${variable.value}""]\n`;

        });

        let heapChunks: string = "";
        this.heap.forEach(heapChunk => {
            if (heapChunk.parsed) {
                heapChunks += `${heapChunk.name} [label = "<name>${heapChunk.name}|<next>next${heapChunk.value ? "\nval: " + heapChunk.value : ""}\n(${heapChunk.permission})"]\n`;
                if (heapChunk.value) {
                    heapChunks += `${heapChunk.name} -> ${heapChunk.value}`;
                }
            }
        });
        if (localVars != "" || heapChunks != "") {
            return header + localVars + intermediate + heapChunks + footer;
        } else {
            return null;
        }
    }

    //   n4 [label = "n4\nval: n4@24"]
    //   n [label = "node($t@34;$t@33)"]

    // 	n4_24 [label = "<name>$Ref!val!0|<next>next\nval: $t@27\n(W)"]
    // 	t_27 [label = "<name>$Ref!val!1|<next>next\nval: $t@29\n(W)"]
    // 	t_29 [label = "<name>$Ref!val!1|<next>next\nval: $t@31\n(W)"]
    // 	t_31 [label = "<name>$Ref!val!1|<next>next\n(W)"]
    // 	t_33 [label = "<name>$t@33\nval: $Ref!val!1|<next>next"]
    // 	t_34 [label = "<name>$t@34\nval: $Ref!val!1|<next>next"]

    // 	temp [label= "<name>|(W)"]

    // 	n -> temp:name

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
            let lineNr = +parts[3] - 1;
            let charNr = +parts[4] - 1;
            this.position = { line: lineNr, character: charNr };

            this.formula = parts[5].trim();
        }
        if (parts.length == 4) {
            this.formula = parts[3].trim();
        }
    }
}