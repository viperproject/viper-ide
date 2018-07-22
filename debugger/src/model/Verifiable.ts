import { SymbExLogEntry } from "../external";
import { DebuggerError } from "../Errors";
import { Record } from "./Record";
import { Term } from "./Term";

type VerifiableType = 'Method' | 'Predicate' | 'Function';


/** Represents one of the top-level constructs that can be verified */
export class Verifiable {

    protected constructor(
        readonly type: VerifiableType,
        readonly name: string,
        readonly records: Record[] = [],
        readonly lastSMTQuery?: Term
    ) {}

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

        let lastSMTQuery: Term | undefined = undefined;
        if (entry.lastSMTQuery) {
            lastSMTQuery = Term.from(entry.lastSMTQuery);
        }

        let verifiableType: VerifiableType;
        if (kind === 'method') {
            verifiableType = 'Method';
        } else if (kind === 'predicate') {
            verifiableType = 'Predicate';
        } else if (kind === 'function') {
            verifiableType = 'Function';
        } else {
            throw new DebuggerError(`Unexpected SymbExLogEntry kind '${entry.kind}'`);
        }

        return new Verifiable(verifiableType, name, records, lastSMTQuery);
    }
}