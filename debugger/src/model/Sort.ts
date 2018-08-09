import { mustHave, Term } from "./Term";
import { Logger } from "../logger";
import { DebuggerError } from "../Errors";
import { TermSortVisitor } from "./SortVisitor";


export class Sort {
    public static Ref = new Sort('Ref');
    public static Int = new Sort('Int');
    public static Bool = new Sort('Bool');
    public static Snap = new Sort('Snap');
    public static Perm = new Sort('Perm');
    public static UserSort = new Sort('UserSort');
    public static Logical = new Sort('Logical');
    public static Set = (elementsSort: Sort) => new Sort('Set', Sort.from(elementsSort));
    public static Seq = (elementsSort: Sort) => new Sort('Seq', Sort.from(elementsSort));
    public static Multiset = (elementsSort: Sort) => new Sort('Multiset', Sort.from(elementsSort));
    public static FVF = (elementsSort: Sort) => new Sort('FVF', Sort.from(elementsSort));

    public static sortVisitor = new TermSortVisitor();

    constructor(readonly id: string, readonly elementsSort?: Sort) {}

    public is(other: Sort | 'Set' | 'Seq' | 'Multiset' | 'FVF'): boolean {
        if (other instanceof Sort) {
            if (this.elementsSort === undefined) {
                return this.id === other.id && this.elementsSort === other.elementsSort;
            } else {
                return this.id === other.id &&
                        other.elementsSort !== undefined && this.elementsSort.is(other.elementsSort);
            }
        }

        return this.id === other;
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

        if (obj.id === 'Ref') { return Sort.Ref; }
        if (obj.id === 'Int') { return Sort.Int; }
        if (obj.id === 'Bool') { return Sort.Bool; }
        if (obj.id === 'Snap') { return Sort.Snap; }
        if (obj.id === 'Perm') { return Sort.Perm; }
        if (obj.id === 'UserSort') { return Sort.UserSort; }
        if (obj.id === 'Logical') { return Sort.Logical; }

        if (obj.id === 'Set') { return Sort.Set(Sort.from(obj.elementsSort)); }
        if (obj.id === 'Seq') { return Sort.Seq(Sort.from(obj.elementsSort)); }
        if (obj.id === 'Multiset') { return Sort.Multiset(Sort.from(obj.elementsSort)); }
        if (obj.id === 'FVF') { return Sort.FVF(Sort.from(obj.elementsSort)); }

        Logger.error("Could not parse sort from: " + JSON.stringify(obj));
        throw new DebuggerError("Could not parse sort from: " + JSON.stringify(obj));
    }
}


export function getSort(term: Term): Sort {
    return term.accept(Sort.sortVisitor);
}

