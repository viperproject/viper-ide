import { Position, Range } from 'vscode';
import { SymbExLogEntry, SymbExLogState } from '../external';
import { DebuggerError } from '../Errors';
import { HeapChunk } from './Heap';
import { Term } from './Term';
import { StoreVariable } from './StoreVariable';


export class State {
    constructor(
        readonly store: StoreVariable[],
        readonly heap: HeapChunk[],
        readonly oldHeap: HeapChunk[],
        readonly pathConditions: Term[]
    ) {}

    public static from(symbExLogState: SymbExLogState): State {
        const store = symbExLogState.store.map(StoreVariable.from);
        const heap = symbExLogState.heap.map(HeapChunk.from);
        const oldHeap = symbExLogState.oldHeap.map(HeapChunk.from);
        const pathConditions = symbExLogState.pcs.map(Term.from);

        return new State(store, heap, oldHeap, pathConditions);
    }
}

type RecordType = 'Execute' | 'Evaluate' | 'Consume' | 'Produce' | 'Other';
let index = 0;

export class Record {

    readonly children: Record[];
    next: Record | undefined;

    constructor(readonly type: RecordType,
                readonly formula: string,
                readonly index: number,
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

        let prestate: State | undefined = undefined;
        if (entry.prestate) {
            prestate = State.from(entry.prestate);
        }

        let record: Record = new Record(
            recordType,
            formula,
            index,
            position,
            prestate,
            parent,
            previous
        );
        index = index + 1;

        // Build all children of the entry and make sure they are connected with siblings and parent
        if (entry.children) {
            let previousChild: Record;
            entry.children.forEach((entry) => {
                const child = Record.from(entry, record, previousChild);

                // We might not get a child if it does not need to be visualized
                if (child) {
                    if (previousChild) {
                        previousChild.next = child;
                    }
                    previousChild = child;
                    record.addChild(child);
                }
            });
        }

        return record;
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
            { text: `${v.name}: ${v.sort}`, id: v.name },
            { text: ' -> ' },
            { text: v.value.toString(), id: v.value.toString() }
        ]);

        const heap = state.heap.map(c => [{ text: c.toString() }]);
        const pcs = state.pathConditions.map(pc => [{ text: pc.toString() }]);

        return new StateView(store, heap, pcs);
    }
}

export class RecordView {

    private constructor(
                readonly type: string,
                readonly position: Position | undefined,
                readonly formula: string,
                readonly index: number,
                readonly children: RecordView[],
                readonly state?: StateView) {}


    public static from(record: Record) {
        const type: string = record.type.toString();
        const children: RecordView[] = record.children.map(RecordView.from);

        let state: StateView | undefined = undefined;
        if (record.prestate !== undefined) {
            state = StateView.from(record.prestate);
        }

        return new RecordView(type,
                                 record.position,
                                 record.formula,
                                 record.index,
                                 children,
                                 state);
    }
}