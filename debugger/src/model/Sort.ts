import { mustHave, Term, Binary, Unary, And, Or, Ite, Lookup } from "./Term";
import { Logger } from "../logger";
import { DebuggerError } from "../Errors";


export class Sort {
    constructor(readonly id: string, readonly elementsSort?: Sort) {}

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
    export const FVF = 'FVF';
    export const Multiset = 'Multiset';
    export const UserSort = 'UserSort';
}


export interface WithSort {
    sort: Sort;
}

export function hasSort(object: any): object is WithSort {
    return 'sort' in object;
}

export function getSort(term: Term): Sort {
    if (hasSort(term)) {
        return term.sort;
    }

    // TODO: Fix this
    if (term instanceof Binary) {
        const leftSort = getSort(term.lhs);
        const rightSort = getSort(term.rhs);
        if (leftSort.id === rightSort.id) {
            return leftSort;
        } else if (term.op === "in" || term.op ===  "==>" || term.op === "<==>") {
            return new Sort(Sort.Bool);
        } else {
            Logger.error("Mismatching sorts in binary operation :" + leftSort + ", " + rightSort);
            throw new DebuggerError("Mismatching sorts in binary operation :" + leftSort + ", " + rightSort);
        }
    }
    if (term instanceof Unary) {
        return getSort(term.p);
    }

    if (term instanceof And || term instanceof Or) {
        const sorts = term.terms.map(t => getSort(t));
        const first = sorts[0];
        // if (sorts.some(s => s.id !== first.id)) {
        //     Logger.error("Mismatching sorts:" + sorts);
        //     throw new DebuggerError("Mismatching sorts:" + sorts);
        // } else {
        return first;
        // }
    }

    if (term instanceof Ite) {
        const thenSort = getSort(term.thenBranch);
        const elseSort = getSort(term.elseBranch);
        if (thenSort.id === elseSort.id) {
            return thenSort;
        } else {
            Logger.error("Mismatching sorts in ternary conditional :" + thenSort + ", " + elseSort);
            throw new DebuggerError("Mismatching sorts in ternary conditional :" + thenSort + ", " + elseSort);
        }
    }

    // TODO: Fix this
    if (term instanceof Lookup) {
        const fvfSort = getSort(term.fieldValueFunction);
        if (fvfSort.id === Sort.FVF && fvfSort.elementsSort) {
            return fvfSort.elementsSort;
        }
    }

    Logger.error("Could not determine the sort of :" + term);
    throw new DebuggerError("Could not determine the sort of :" + term);
}