import { SymbExLogEntry } from "../ViperProtocol";
import { DebuggerError } from "../Errors";
import { Statement } from "./Statement";

type VerifiableType = 'Method' | 'Predicate' | 'Function';


/** Represents one of the top-level constructs that can be verified */
export class Verifiable {

    public readonly type: VerifiableType;
    public readonly name: string;
    public readonly statements: Statement[];

    protected constructor(type: VerifiableType, name: string, statements: Statement[] = []) {
        this.type = type;
        this.name = name;
        this.statements = statements;
    }

    public static from(entry: SymbExLogEntry): Verifiable {
        if (!entry.kind) {
            throw new DebuggerError(`SymbExLogEntry has no kind: ${entry.value} @ ${entry.pos}`);
        }

        if (!entry.children) {
            throw new DebuggerError(`SymbExLogEntry has no childred: ${entry.value} @ ${entry.pos}`);
        }

        const kind = entry.kind.toLowerCase();
        const name = entry.value;
        const statements = entry.children.map((child, index, array) => Statement.from(child));

        if (kind === 'method') {
            return new Verifiable('Method', name, statements);
        } else if (kind === 'predicate') {
            return new Verifiable('Predicate', name, statements);
        } else if (kind === 'function') {
            return new Verifiable('Function', name, statements);
        } else {
            throw new DebuggerError(`Unexpected SymbExLogEntry kind '${entry.kind}'`);
        }
    }
}