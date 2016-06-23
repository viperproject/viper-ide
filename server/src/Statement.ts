'use strict';

//import {Position} from 'vscode';
import {Log} from './Log';
import {Model} from './Model';

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

interface HeapChunk {
    name: string;
    value: string;
    permission: string;
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

    constructor(firstLine: string, store: string, heap: string, oldHeap: string, conditions: string, model: Model) {
        this.parseFirstLine(firstLine);
        this.store = this.parseVariables(this.unpack(store,model));
        this.heap = this.unpackHeap(heap, model);
        this.oldHeap = this.unpackHeap(oldHeap, model);
        //TODO: implement unpackConditions
        this.conditions = this.unpack(conditions,model);
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

    private unpack(line: string,model:Model): string[] {
        line = line.trim();
        if (line == "{},") {
            return [];
        } else {
            let res = [];
            line = line.substring(line.indexOf("(") + 1, line.lastIndexOf(")"));
            while(line){
                let splitRes = this.splitAtComma(line);
                res.push(model.fillInValues(splitRes.prefix));
                line = splitRes.rest;
            }
            return res;
        }
    }

    private unpackHeap(line: string, model: Model): HeapChunk[] {
        line = line.trim();
        if (line == "{},") {
            return [];
        }
        line = line.substring(line.indexOf("(") + 1, line.lastIndexOf(")"));

        let res = [];
        try {
            line = line.trim();
            while (line != "") {
                let arrowPosition = line.indexOf("->");
                let hashTagPosition = line.indexOf("#", arrowPosition);
                let secondArrowPosition = line.indexOf("->", hashTagPosition);
                let name = model.fillInValues(line.substring(0, arrowPosition - 1).trim());
                let value = model.fillInValues(line.substring(arrowPosition + 3, hashTagPosition - 1));
                if (secondArrowPosition < 0) {
                    //this is the last HeapChunk
                    var permission = model.fillInValues(line.substring(hashTagPosition + 2, line.length));
                    line = "";
                } else {
                    line = line.substring(hashTagPosition + 2, line.length);
                    let splitRes = this.splitAtComma(line);
                    permission = model.fillInValues(splitRes.prefix);
                    line = splitRes.rest;
                }
                res.push({ name: name, permission: permission, value: value });
            }
        } catch (e) {
            Log.error("Heap parsing error: " + e);
        }
        return res;
    }



    private splitAtComma(line: string): SplitResult {
        let i = 0;
        let bracketCount = 0;
        let endFound = false;
        //walk through line to determine end of permission
        while (i < line.length && !endFound) {
            let char = line[i];
            if (char == '(' || char == '[' || char == '{') {
                bracketCount++;
            }
            else if (char == ')' || char == ']' || char == '}') {
                bracketCount--;
            }
            else if (char == ',' && bracketCount == 0) {
                endFound = true;
            }
            i++;
        }

        return {
            prefix: i+1<line.length?line.substring(0, i - 1):line,
            rest: line = i+1<line.length?line.substring(i + 1):null
        };
    }

    public pretty(): string {
        let positionString = "\nPosition: " + (this.position ? this.position.line + ":" + this.position.character : "<no position>") + "\n";

        let res: string = "Type: " + StatementType[this.type] + positionString;
        res += "Formula: " + this.formula + "\n";
        res += "Store: \n";
        this.store.forEach(element => {
            res += "\t" + element.name + " = " + element.value + "\n"
        });
        res += "Heap: \n";
        this.heap.forEach(element => {
            res += "\t" + element.name + " -> " + element.value + " # " + element.permission + "\n";
        });
        res += "OldHeap: \n";
        this.oldHeap.forEach(element => {
            res += "\t" + element.name + " -> " + element.value + " # " + element.permission + "\n";
        });
        res += "Condition: \n";
        this.conditions.forEach(element => {
            res += "\t" + element + "\n"
        });
        return res;
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