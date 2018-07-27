import { mustHave, Term, Binary } from "./Term";


export class Sort {
    constructor(readonly id: string, readonly elementsSort?: Sort) {}

    /** Tell if the sort is a Ref or contains Refs (e.g. sets, sequences, ...). */
    public isRefLike(): boolean {
        return this.id === 'Ref' || (this.elementsSort !== undefined && this.elementsSort.isRefLike());
    }

    public toString(): string {
        if (this.elementsSort) {
            return `${this.id}[${this.elementsSort.toString()}]`;
        } else {
            return this.id;
        }
    }

    /** Build a sort from a JSON object. */
    public static from(obj: any): Sort {
        mustHave('sort', obj, ['id']);

        if ('name' in obj && obj.id === 'UserSort') {
            return new Sort(obj.id, new Sort(obj.name));
        } 

        if (!('elementsSort' in obj)) {
            return new Sort(obj.id);
        }

        return new Sort(obj.id, Sort.from(obj.elementsSort));
    }
}

export namespace Sort {
    export const Ref = 'Ref';
    export const Int = 'Int';
    export const Bool = 'Bool';
    export const Snap = 'Snap';
    export const Perm = 'Perm';
    export const Set = 'Set';
    export const Seq = 'Seq';
    export const Multiset = 'Multiset';
    export const UserSort = 'UserSort';
}


export interface WithSort {
    sort: Sort;
}

export function hasSort(object: any): object is WithSort {
    return 'sort' in object;
}

export function getSort(term: Term): Sort | undefined {
    if (hasSort(term)) {
        return term.sort;
    }
    
    if (term instanceof Binary) {
        return getSort(term.lhs) || getSort(term.rhs);
    }

    return undefined;
}