import { SymbExLogEntry } from "../ViperProtocol";
import { DebuggerError } from "../Errors";
import { Record } from "./Record";

type VerifiableType = 'Method' | 'Predicate' | 'Function';


/** Represents one of the top-level constructs that can be verified */
export class Verifiable {

    public readonly type: VerifiableType;
    public readonly name: string;
    public readonly records: Record[];

    protected constructor(type: VerifiableType, name: string, records: Record[] = []) {
        this.type = type;
        this.name = name;
        this.records = records;
    }

    public static from(entry: SymbExLogEntry): Verifiable {
        if (!entry.kind) {
            throw new DebuggerError(`SymbExLogEntry has no kind: ${entry.value} @ ${entry.pos}`);
        }

        // TODO: Some proper checks here for which verifiables are allowed not to have children
        if (!entry.children) {
            // Logger.error(`SymbExLogEntry has no children: ${entry.value} @ ${entry.pos}`);
            // entry.children = [];
            throw new DebuggerError(`SymbExLogEntry has no children: ${entry.value} @ ${entry.pos}`);
        }

        const kind = entry.kind.toLowerCase();
        const name = entry.value;
        let previous: Record;
        const records = entry.children.reduce((acc, child) => {
                const record = Record.from(child, undefined, previous);

                // Record might be null if it does not need to be visualized, only keep those we care about
                if (record) {
                    if (previous) {
                        previous.next = record;
                    }
                    previous = record;

                    acc.push(record);
                }

                return acc;
        }, <Record[]>[]);

        if (kind === 'method') {
            return new Verifiable('Method', name, records);
        } else if (kind === 'predicate') {
            return new Verifiable('Predicate', name, records);
        } else if (kind === 'function') {
            return new Verifiable('Function', name, records);
        } else {
            throw new DebuggerError(`Unexpected SymbExLogEntry kind '${entry.kind}'`);
        }
    }
}