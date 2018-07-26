import { SymbExLogStoreVariable } from '../external';
import { Term } from './Term';
import { Sort } from './Sort';

export class StoreVariable {

    private constructor(readonly name: string,
                        readonly sort: Sort,
                        readonly value: Term) {}

    public static from(storeEntry: SymbExLogStoreVariable): StoreVariable {
        return new StoreVariable(storeEntry.name, Sort.from(storeEntry.sort), Term.from(storeEntry.value));
    }

    public toString(): string {
        return  `${this.name}: ${this.sort} := ${this.value}`;
    }
}
