import { mustHave, Term, Binary } from "./Term";

export class Sort {
    constructor(readonly id: string, readonly elementsSort?: Sort) {}

    public static from(obj: any): Sort {
        mustHave('sort', obj, ['id']);

        if (!('elementsSort' in obj)) {
            return new Sort(obj.id);
        } else {
            return new Sort(obj.id, Sort.from(obj.elementsSort));
        }
    }

    public toString(): string {
        if (this.elementsSort) {
            return `${this.id}[${this.elementsSort.toString()}]`;
        } else {
            return this.id;
        }
    }
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