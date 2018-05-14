import { SymbExLogStore } from '../ViperProtocol';
import { DebuggerError } from '../Errors';

export class Variable {

    private constructor(readonly name: string,
                        readonly type: string,
                        readonly value: string) {}

    public static from(storeEntry: SymbExLogStore): Variable {
        const parts = storeEntry.value.split('->');
        if (parts.length !== 2) {
            throw new DebuggerError(`Store variable with unexpected format '${storeEntry.value}'`);
        }

        return new Variable(parts[0].trim(), storeEntry.type, parts[1].trim());
    }
}
