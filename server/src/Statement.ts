'use strict';

//import {Position} from 'vscode';
import {Log} from './Log';

enum StatementType { EXECUTE, EVAL, CONSUME, PRODUCE };

interface Position {
    line: number;
    character: number;
}

export class Statement {
    type: StatementType;
    position: Position;
    formula: string;
    store: string[];
    heap: string[];
    oldHeap: string[];
    conditions: string[];

    constructor(firstLine: string, store: string, heap: string, oldHeap: string, conditions: string) {
        this.parseFirstLine(firstLine);
        this.store = this.unpack(store);
        this.heap = this.unpack(heap);
        this.oldHeap = this.unpack(oldHeap);
        this.conditions = this.unpack(conditions);
    }

    private unpack(line:string): string[] {
        line = line.trim();
        if (line == "{},") {
            return [];
        } else {
            line = line.substring(line.indexOf("(")+1, line.lastIndexOf(")"));
            return line.split(",");
        }
    }

    public pretty():string {
        let res: string = "Type: " + this.type.toString + "\nPosition: " + this.position.line + ":" + this.position.character + "\n";
        res += "Formula: " + this.formula + "\n";
        res += "Store: \n";
        this.store.forEach(element => {
            res += "  " + element + "\n"
        });
        res += "Heap: \n";
        this.heap.forEach(element => {
            res += "  " + element + "\n"
        });
        res += "OldHeap: \n";
        this.oldHeap.forEach(element => {
            res += "  " + element + "\n"
        });
        res += "Condition: \n";
        this.conditions.forEach(element => {
            res += "  " + element + "\n"
        });
        return res;
    }

    private parseFirstLine(line: string): Position {
        let parts = /(.*?)\s+(\d*):(\d*):\s+(.*)/.exec(line);
        if (parts.length != 5) {
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

        //subtract 1 to confirm with VS Codes 0-based numbering
        let lineNr = +parts[2] - 1;
        let charNr = +parts[3] - 1;
        this.position = { line: lineNr, character: charNr };

        this.formula = parts[4].trim();
    }
}