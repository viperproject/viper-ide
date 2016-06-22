'use strict';

//import {Position} from 'vscode';
import {Log} from './Log';

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

export class Statement {
    type: StatementType;
    public position: Position;
    formula: string;
    public store: Variable[];
    heap: string[];
    oldHeap: string[];
    conditions: string[];

    constructor(firstLine: string, store: string, heap: string, oldHeap: string, conditions: string) {
        this.parseFirstLine(firstLine);
        this.store = this.parseVariables(this.unpack(store));
        this.heap = this.unpack(heap);
        this.oldHeap = this.unpack(oldHeap);
        this.conditions = this.unpack(conditions);
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

    private unpack(line: string): string[] {
        line = line.trim();
        if (line == "{},") {
            return [];
        } else {
            line = line.substring(line.indexOf("(") + 1, line.lastIndexOf(")"));
            return line.split(",");
        }
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
            res += "\t" + element + "\n"
        });
        res += "OldHeap: \n";
        this.oldHeap.forEach(element => {
            res += "\t" + element + "\n"
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