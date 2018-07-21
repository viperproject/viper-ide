import { SymbExLogStoreVariable } from '../external';
import { Term } from './Term';

export class StoreVariable {

    private constructor(readonly name: string,
                        readonly sort: string,
                        readonly value: Term) {}

    public static from(storeEntry: SymbExLogStoreVariable): StoreVariable {
        return new StoreVariable(storeEntry.name, storeEntry.sort, Term.from(storeEntry.value));
    }

    public toString(): string {
        return  `${this.name}: ${this.sort} := ${this.value}`;
    }
}
