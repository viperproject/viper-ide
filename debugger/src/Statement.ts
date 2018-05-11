import { SymbExLogEntry, SymbExLogStore } from "./ViperProtocol";
import { DebuggerError } from "./Errors";
import { Position } from "vscode";
import { Logger } from "./logger";

type StatementType = 'Consume' | 'Produce' | 'Evaluate' | 'Execute' | 'None';

namespace StatementType {

    export function from(type: string): StatementType {
        type = type.toLocaleLowerCase();
        if (type === 'consume') {
            return 'Consume';
        } else if (type === 'produce') {
            return 'Produce';
        } else if (type === 'evaluate' || type === 'eval') {
            return 'Evaluate';
        } else if (type === 'execute') {
            return 'Execute';
        } else {
            throw new DebuggerError(`Unexpected statement type '${type}'`);
        }
    }
}


export class Statement {
    public readonly type: StatementType;
    public readonly kind: string;
    public readonly position: Position;
    public readonly formula: string;
    public readonly store: SymbExLogStore[];
    public readonly heap: string[];
    public readonly oldHeap: string[];
    public readonly pathConditions: string[];

    constructor(type: StatementType,
                kind: string,
                position: Position,
                formula: string,
                store: SymbExLogStore[] = [],
                heap: string[] = [],
                oldHeap: string[] = [],
                pathConditions: string[] = []) {
        this.type = type;
        this.kind = kind;
        this.position = position;
        this.formula = formula;
        this.store = store ? store : [];
        this.heap = heap ? heap : [];
        this.oldHeap = oldHeap ? oldHeap : [];
        this.pathConditions = pathConditions ? pathConditions : [];
    }

    public static from(entry: SymbExLogEntry) {
        if (!entry.kind && !entry.type) {
            throw new DebuggerError(`Both 'kind' and 'type' entries are missing in '${entry.value}' @ ${entry.pos}`);
        }

        let type: StatementType = 'None';
        // TODO: Determine what are the valid kinds
        let kind: string = 'None';

        if (!entry.type && entry.kind) {
            kind = entry.kind;
        } else if (entry.type && !entry.kind) {
            type = StatementType.from(entry.type);
        }

        if (!entry.pos) {
            // HACK: Fix this, determine which nodes are allowed not to have a position
            entry.pos = '0:0';

            Logger.error(`Missing 'pos' for SymbExLogEntry '${(entry.type || entry.kind)}'`);
            // throw new DebuggerError(`Missing 'pos' for SymbExLogEntry '${entry.value}' @ ${entry.pos}`);
        }

        const posRegex = /^(\d+):(\d+)$/;
        const match = posRegex.exec(entry.pos);

        if (!match) {
            throw new DebuggerError(`Could not parse position from '${entry.pos}' for SymbExLogEntry '${entry.value}'`);
        }

        const position = new Position(Number.parseInt(match[1]), Number.parseInt(match[2]));
        const formula = entry.value;

        if (entry.prestate) {
            // TODO: we probably want to parse the store into a separate obejct
            const store = entry.prestate.store;
            const heap = entry.prestate.heap;
            const oldHeap = entry.prestate.oldHeap;
            const pathConditions = entry.prestate.pcs;

            return new Statement(type, kind, position, formula, store, heap, oldHeap, pathConditions);
        }

        return new Statement(type, kind, position, formula);
    }
}