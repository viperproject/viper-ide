import { SymbExLogEntry, SymbExLogStore } from './ViperProtocol';
import { DebuggerError } from './Errors';
import { Position } from 'vscode';
import { Logger } from './logger';
import { HeapChunk } from './Heap';


type StatementType = 'Consume' | 'Produce' | 'Evaluate' | 'Execute' | 'None';

namespace StatementType {
    export const Consume = 'Consume';
    export const Produce = 'Produce';
    export const Evaluate = 'Evaluate';
    export const Execute = 'Execute';
    export const None = 'None';

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
    constructor(readonly type: StatementType,
                readonly kind: string,
                readonly position: Position,
                readonly formula: string,
                readonly children: Statement[],
                readonly store: Variable[] = [],
                readonly heap: HeapChunk[] = [],
                readonly oldHeap: string[] = [],
                readonly pathConditions: string[] = []) {}

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

        let children: Statement[] = [];
        if (entry.children) {
            children = entry.children.map((child) => Statement.from(child));
        } 

        if (entry.prestate) {
            // TODO: we probably want to parse the store into a separate obejct
            const store = entry.prestate.store.map(Variable.from);
            const heap = entry.prestate.heap.map(HeapChunk.parse);
            const oldHeap = entry.prestate.oldHeap;
            const pathConditions = entry.prestate.pcs;

            return new Statement(type, kind, position, formula, children, store, heap, oldHeap, pathConditions);
        }

        return new Statement(type, kind, position, formula, children);
    }
}


class Variable {

    private constructor(readonly name: string,
                        readonly type: string,
                        readonly value: string) {}

    public static from(storeEntry: SymbExLogStore): Variable {
        const parts = storeEntry.value.split('->');
        if (parts.length !== 2) {
            throw new DebuggerError(`Store variable with unexpected format '${storeEntry.value}'`);
        }

        return new Variable(parts[0], storeEntry.type, parts[1]);
    }
}
