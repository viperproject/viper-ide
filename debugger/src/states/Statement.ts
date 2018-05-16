import { Position } from 'vscode';
import { SymbExLogEntry, SymbExLogStore } from '../ViperProtocol';
import { DebuggerError } from '../Errors';
import { Logger } from '../logger';
import { flatMap } from '../util';
import { HeapChunk } from './Heap';
import { Condition } from './Condition';
import { Variable } from './Variable';
import { stat } from 'fs';


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

    readonly children: Statement[];
    next: Statement | undefined;

    constructor(readonly type: StatementType,
                readonly kind: string,
                readonly position: Position,
                readonly formula: string,
                readonly parent: Statement | undefined,
                readonly previous: Statement | undefined,
                readonly store: Variable[] = [],
                readonly heap: HeapChunk[] = [],
                readonly oldHeap: HeapChunk[] = [],
                readonly pathConditions: Condition[] = []) {
        this.children = [];
    }

    private addChild(child: Statement) {
        this.children.push(child);
    }

    public static from(entry: SymbExLogEntry, parent?: Statement, previous?: Statement): Statement {
        if (!entry.kind && !entry.type) {
            // TODO: Determine whether this makes sense or not
            //throw new DebuggerError(`Both 'kind' and 'type' entries are missing in '${entry.value}' @ ${entry.pos}`);
            Logger.error(`Both 'kind' and 'type' entries are missing in '${entry}'`);
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
            // FIXME: Determine which nodes are allowed not to have a position
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

        let statement: Statement;
        if (entry.prestate) {
            // TODO: we probably want to parse the store into a separate obejct
            const store = entry.prestate.store.map(Variable.from);
            const heap = entry.prestate.heap.map(HeapChunk.parse);
            const oldHeap = entry.prestate.oldHeap.map(HeapChunk.parse);
            const pathConditions = flatMap(entry.prestate.pcs, Condition.parseConditions);

            statement = new Statement(type, kind, position, formula, parent, previous, store, heap, oldHeap, pathConditions);
        } else {
            statement = new Statement(type, kind, position, formula, previous, parent);
        }

        if (entry.children) {
            let previousChild: Statement;
            entry.children.forEach((entry) => {
                const child = Statement.from(entry, statement, previousChild);
                if (previousChild) {
                    previousChild.next = child;
                }
                previousChild = child;
                statement.addChild(child);
            });
        }

        return statement;
    }
}


export class StatementView {

    private constructor(readonly kind: string,
                readonly type: string,
                readonly position: Position,
                readonly formula: string,
                readonly children: StatementView[],
                readonly store: Variable[] = [],
                readonly heap: HeapChunk[] = [],
                readonly oldHeap: HeapChunk[] = [],
                readonly pathConditions: Condition[] = []) {}


    public static from(statement: Statement) {
        const kind: string = statement.kind.toString();
        const type: string = statement.type.toString();
        const children: StatementView[] = statement.children.map(StatementView.from);

        return new StatementView(kind,
                                 type,
                                 statement.position,
                                 statement.formula,
                                 children,
                                 statement.store,
                                 statement.heap,
                                 statement.oldHeap,
                                 statement.pathConditions);
    }
}