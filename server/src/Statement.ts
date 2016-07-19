'use strict';

//import {Position} from 'vscode';
import {Log} from './Log';
import {Model} from './Model';
import {Position, LogLevel} from './ViperProtocol';
let graphviz = require("graphviz");

export enum StatementType { EXECUTE, EVAL, CONSUME, PRODUCE };

interface Variable {
    name: string;
    value: string;
    variablesReference: number;
}

interface Name {
    raw: string;
    receiver?: string;
    field?: string;
    arguments?: string[];
    type: NameType;
}

interface Value {
    raw: string;
    type: ValueType;
}

interface Permission {
    raw: string;
    type: PermissionType;
}

enum PermissionType { UnknownPermission, ScalarPermission }
enum ValueType { UnknownValue, NoValue, ObjectReferenceOrScalarValue }
enum NameType { UnknownName, QuantifiedName, FunctionApplicationName, PredicateName, FieldReferenceName }

class HeapChunk {
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
            this.parsed = false;
        }
    }

    pretty(): string {
        return this.name.raw + (this.value.raw ? " -> " + this.value.raw : "") + " # " + this.permission.raw;
    }
    equals(other: HeapChunk): boolean {
        return this.name.raw == other.name.raw && this.permission.raw == other.permission.raw && this.value.raw == other.value.raw;
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
        try {
            let g = graphviz.digraph("G");
            let n1 = g.addNode("Hello", { "color": "blue" });
            n1.set("style", "filled");
            let e = g.addEdge(n1, "World");
            e.set("color", "red");
            g.addNode("World");
            g.addEdge(n1, "World");
            Log.log(g.to_dot(), LogLevel.Debug);
            g.setGraphVizPath("C:\\");
            g.output("png", "graphvizTest.png");
        } catch (e) {
            Log.error("Graphviz Error: " + e);
        }
    }

    public heapToDot(): string {
        try {
            let g = graphviz.digraph("G");
            g.setNodeAttribut("shape", "record");
            g.set("rankdir", "LR");
            let store = g.addCluster("cluster_store");
            store.set("style", "dotted");
            store.set("label", "Store");
            let heap = g.addCluster("cluster_heap");
            heap.set("style", "dotted");
            heap.set("label", "Heap");

            //read all heap Chunks to find out all existing nodes in the heap
            let heapChunkFields = new Map<string, string[]>();
            this.heap.forEach(heapChunk => {
                if (!heapChunk.parsed) {
                    Log.log("Warning, I don't know how to visualize the heap chunk " + JSON.stringify(heapChunk.name));
                }
                else {
                    if (heapChunk.name.type == NameType.FieldReferenceName && heapChunk.value.type == ValueType.ObjectReferenceOrScalarValue) {
                        let receiver = heapChunk.name.receiver;
                        if (!heapChunkFields.has(receiver)) {
                            heapChunkFields.set(receiver, []);
                        }
                        heapChunkFields.get(receiver).push(heapChunk.name.field);

                        //let edge = heap.addEdge(heapChunk.name.receiver + ":" + heapChunk.name.field, heapChunk.value.raw);
                        //Log.log("Draw edge from " + heapChunk.name.receiver + ":" + heapChunk.name.field + " to " + heapChunk.value.raw, LogLevel.Debug);
                    }
                }
            })

            //add all nodes with the appropriate fields to the heap
            heapChunkFields.forEach((fields: string[], receiver: string) => {
                let heapChunkNode = heap.addNode(receiver);
                let label = "<name>";
                fields.forEach(element => {
                    label += `|<${element}>${element}`;
                });
                heapChunkNode.set("label", label);
            });

            //populate the store and add pointers from store to heap
            let vars: Map<string, any> = new Map<string, any>();
            this.store.forEach(variable => {
                let variableNode = store.addNode(variable.name);
                vars.set(variable.name, variableNode);
                //set variable value
                variableNode.set("label", variable.name + " = " + variable.value);
                if (heapChunkFields.has(variable.value)) {
                    g.addEdge(variable.name, variable.value)
                }
            });

            //add pointers inside heap
            //also build Predicate nodes
            this.heap.forEach(heapChunk => {
                if (heapChunk.parsed && heapChunk.name.type == NameType.FieldReferenceName && heapChunk.value.type == ValueType.ObjectReferenceOrScalarValue) {
                    //add the adge only if the value is known to exist
                    if (heapChunkFields.has(heapChunk.value.raw)) {
                        let edge = heap.addEdge(heapChunk.name.receiver, heapChunk.value.raw);
                        edge.set("label", heapChunk.name.field);
                    }
                }
                else if (heapChunk.name.type == NameType.PredicateName) {
                    //add predicate subgraph
                    let predicateCluster = heap.addCluster("cluster_" + heapChunk.name.receiver);
                    predicateCluster.set("style", "bold");
                    predicateCluster.set("label", "Predicate " + heapChunk.name.receiver)
                    //skip the fist argument (it's the snapshot argument)
                    for (let i = 1; i < heapChunk.name.arguments.length; i++) {
                        let parameter = heapChunk.name.arguments[i];
                        if (parameter === "False" || parameter === "True" || /^\d+(\.\d+)$/.test(parameter)) {
                            let argumentNode = predicateCluster.addNode(`arg${i} = ${parameter}`);
                        } else {
                            let argumentNode = predicateCluster.addNode("arg" + i);
                            if (heapChunkFields.has(parameter)) {
                                let edge = heap.addEdge(parameter, argumentNode)
                                edge.set("style", "dashed");
                            } else {
                                //try to add edge from variable to predicate argument;
                                this.store.forEach(element => {
                                    if (element.value === parameter) {
                                        let edge = heap.addEdge(vars.get(element.name), argumentNode);
                                        edge.set("style", "dashed");
                                    }
                                });
                                //try to add edge from field to predicate argument
                                this.heap.forEach(chunk => {
                                    if (chunk.name.type == NameType.FieldReferenceName && chunk.value.raw === parameter) {
                                        let edge = heap.addEdge(chunk.name.receiver, argumentNode);
                                        edge.set("style", "dashed");
                                        edge.set("label", chunk.name.field)
                                    }
                                });
                            }
                        }
                    }
                }
            })

            return g.to_dot();
        } catch (e) {
            Log.error("Graphviz Error: " + e);
        }
    }

    //     getHeapChunkVisualization(): string {

    //         let header = `digraph heap {
    // rankdir=LR
    // node [shape = record];

    // subgraph cluster_local {
    // graph[style=dotted]
    // label="Local"\n`;

    //         let intermediate = `}

    // subgraph cluster_heap{
    // graph[style=dotted]
    // label="heap"\n`;

    //         let footer: string = "}\n}\n";

    //         let localVars = "";
    //         this.store.forEach(variable => {
    //             localVars += `${variable.name} [label = "${variable.name}\nval: ${variable.value}""]\n`;

    //         });

    //         let heapChunks: string = "";
    //         this.heap.forEach(heapChunk => {
    //             if (heapChunk.parsed) {
    //                 heapChunks += `${heapChunk.name.raw} [label = "<name>${heapChunk.name.raw}|<next>next${heapChunk.value.raw ? "\nval: " + heapChunk.value.raw : ""}\n(${heapChunk.permission.raw})"]\n`;
    //                 if (heapChunk.value.raw) {
    //                     heapChunks += `${heapChunk.name.raw} -> ${heapChunk.value.raw}`;
    //                 }
    //             }
    //         });
    //         if (localVars != "" || heapChunks != "") {
    //             return header + localVars + intermediate + heapChunks + footer;
    //         } else {
    //             return null;
    //         }
    //     }

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