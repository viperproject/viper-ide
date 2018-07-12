import { Position, Range } from 'vscode';
import { SymbExLogEntry, SymbExLogStore, SymbExLogState } from '../ViperProtocol';
import { DebuggerError } from '../Errors';
import { flatMap } from '../util';
import { HeapChunk, FieldReference } from './Heap';
import { Term } from './Term';
import { Variable } from './Variable';


export class State {
    constructor(
        readonly store: Variable[],
        readonly heap: HeapChunk[],
        readonly oldHeap: HeapChunk[],
        readonly pathConditions: Term[]
    ) {}

    public static from(symbExLogState: SymbExLogState): State {
            // TODO: we probably want to parse the store into a separate obejct
            const store = symbExLogState.store.map(Variable.from);
            const heap = symbExLogState.heap.map(HeapChunk.parse);
            const oldHeap = symbExLogState.oldHeap.map(HeapChunk.parse);
            const pathConditions = symbExLogState.pcs.map(Term.from);

            return new State(store, heap, oldHeap, pathConditions);
    }
}

type RecordType = 'Execute' | 'Evaluate' | 'Consume' | 'Produce' | 'Other';

export class Record {

    readonly children: Record[];
    next: Record | undefined;

    constructor(readonly type: RecordType,
                readonly formula: string,
                readonly index: number,  // TODO: Don't like this here
                readonly position: Position,
                readonly prestate?: State,
                readonly parent?: Record,
                readonly previous?: Record) {
        this.children = [];
    }

    private addChild(child: Record) {
        this.children.push(child);
    }

    range(): Range {
        const startLine = Math.max(0, this.position.line - 1);
        const startColumn = Math.max(0, this.position.character - 1);
        const endLine = startLine;
        const endColumn = Math.max(0, startColumn + this.formula.length);

        return new Range(startLine, startColumn, endLine, endColumn);
    }

    public static from(entry: SymbExLogEntry, parent?: Record, previous?: Record): Record | null {
        if (!entry.kind && !entry.type) {
            throw new DebuggerError(`Both 'kind' and 'type' entries are missing in '${entry.value}' @ ${entry.pos}`);
        }

        if (entry.kind === "WellformednessCheck" || entry.kind === "comment") {
            return null;
        }

        if (entry.type) {
            if (!entry.pos) {
                throw new DebuggerError(`Action must have a 'pos' entry, but did not: '${entry.value}'`);
            }
            if (!entry.value) {
                throw new DebuggerError(`Action must have a 'value' entry, but did not: '${entry.value}'`);
            }
            if (!entry.children) {
                throw new DebuggerError(`Action must have 'children', but did not: '${entry.value}'`);
            }
        }

        let recordType: RecordType = 'Other';
        if (entry.type) {
            if (entry.type === 'evaluate') {
                recordType = 'Evaluate';
            } else if (entry.type === 'execute') {
                recordType = 'Execute';
            } else if (entry.type === 'consume') {
                recordType = 'Consume';
            } else if (entry.type === 'produce') {
                recordType = 'Produce';
            } else {
                throw new DebuggerError(`Unexpected action type '${entry.type}'`);
            }
        } else if (entry.kind) {
            // TODO: this
            recordType = 'Other';
        }

        let position: Position = new Position(0, 0);
        if (entry.pos && entry.pos !== '<no position>') {
            const posRegex = /^(\d+):(\d+)$/;
            const match = posRegex.exec(entry.pos);

            if (match) {
                position = new Position(Number.parseInt(match[1]), Number.parseInt(match[2]));
            } else {
                throw new DebuggerError(`Could not parse position from '${entry.pos}' for SymbExLogEntry '${entry.value}'`);
            }
        }

        const formula = entry.value;

        let index = 0;
        if (previous) {
            index = previous.index + 1;
        } else if (parent) {
            index = parent.index + 1;
        }

        let prestate: State | undefined = undefined;
        if (entry.prestate) {
            prestate = State.from(entry.prestate);
        }

        let statement: Record = new Record(
            recordType,
            formula,
            index,
            position,
            prestate,
            parent,
            previous
        );

        // Build all children of the entry and make sure they are connected with siblings and parent
        if (entry.children) {
            let previousChild: Record;
            entry.children.forEach((entry) => {
                const child = Record.from(entry, statement, previousChild);

                // We might not get a child if it does not need to be visualized
                if (child) {
                    if (previousChild) {
                        previousChild.next = child;
                    }
                    previousChild = child;
                    statement.addChild(child);
                }
            });
        }

        return statement;
    }
}


export class StateView {

    private constructor(
                readonly store: { text: string, id?: string }[][] = [],
                readonly heap: { text: string, id?: string }[][] = [],
                readonly pathConditions: { text: string, id?: string }[][] = []
    ) {}

    public static from(state: State) {
        const store = state.store.map(v => [
            { text: `${v.name}: ${v.type}`, id: v.name },
            { text: ' -> ' },
            { text: v.value, id: v.value }
        ]);

        const heap = state.heap.map(c => {
            if (c instanceof FieldReference) {
                return [
                    { text: c.receiver, id: c.receiver },
                    { text: '.' },
                    { text: c.field, id: c.field },
                    { text: ' -> ' },
                    { text: c.value.toString(), id: c.value.toString() },
                    { text: ' # ' + c.permission }
                ];
            } else {
                return [ { text: c.toString() } ];
            }
        });

        const pcs = state.pathConditions.map(pc => [
            { text: pc.toString() }
        ]);

        return new StateView(store, heap, pcs);
    }
}

export class StatementView {

    private constructor(
                readonly type: string,
                readonly position: Position | undefined,
                readonly formula: string,
                readonly index: number,
                readonly children: StatementView[],
                readonly state?: StateView) {}


    public static from(statement: Record) {
        const type: string = statement.type.toString();
        const children: StatementView[] = statement.children.map(StatementView.from);

        let state: StateView | undefined = undefined;
        if (statement.prestate !== undefined) {
            state = StateView.from(statement.prestate);
        }

        return new StatementView(type,
                                 statement.position,
                                 statement.formula,
                                 statement.index,
                                 children,
                                 state);
    }
}