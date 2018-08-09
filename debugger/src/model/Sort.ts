import { mustHave, Term, Binary, Unary, And, Or, Ite, Lookup, SetSingleton, BinaryOp, UnaryOp, SortWrapper, VariableTerm, Quantification, Application, PredicateLookup, Distinct, Literal, Let, SeqRanged, SeqSingleton, SeqUpdate, MultisetSingleton, LogicalWrapper } from "./Term";
import { Logger } from "../logger";
import { DebuggerError } from "../Errors";
import { TermVisitor } from "./TermTranslator";


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

class TermSortVisitor implements TermVisitor<Sort> {

    public visitBinary(term: Binary): Sort {
        // We don't need to know the sorts of the operands to distinguish these
        switch (term.op) {
            // Booleans
            case BinaryOp.Implies: return new Sort(Sort.Logical);
            case BinaryOp.Iff: return new Sort(Sort.Logical);
            case BinaryOp.Equals: return new Sort(Sort.Logical);
            // Combine
            case BinaryOp.Combine: return new Sort(Sort.Snap);
        }

        const leftSort = term.lhs.accept(this);
        const rightSort = term.rhs.accept(this);

        if (leftSort.id === Sort.Int && rightSort.id === Sort.Int) {
            switch (term.op) {
                case BinaryOp.Minus: return new Sort(Sort.Int);
                case BinaryOp.Plus: return new Sort(Sort.Int);
                case BinaryOp.Times: return new Sort(Sort.Int);
                case BinaryOp.Div: return new Sort(Sort.Int);
                case BinaryOp.Mod: return new Sort(Sort.Int);
                // Arithmetic comparisons
                case BinaryOp.Less: return new Sort(Sort.Logical);
                case BinaryOp.AtMost: return new Sort(Sort.Logical);
                case BinaryOp.AtLeast: return new Sort(Sort.Logical);
                case BinaryOp.Greater: return new Sort(Sort.Logical);
            }
        }

        if (leftSort.id === Sort.Set) {
            switch (term.op) {
                case BinaryOp.SetAdd: return new Sort(Sort.Set);
                case BinaryOp.SetDifference: return new Sort(Sort.Set);
                case BinaryOp.SetIntersection: return new Sort(Sort.Set);
                case BinaryOp.SetUnion: return new Sort(Sort.Set);

                case BinaryOp.SetIn: return new Sort(Sort.Bool);
                case BinaryOp.SetSubset: return new Sort(Sort.Bool);
                case BinaryOp.SetDisjoint: return new Sort(Sort.Bool);
            }
        }

        if (leftSort.id === Sort.Perm || rightSort.id === Sort.Perm) {
            switch (term.op) {
                case BinaryOp.Plus: return new Sort(Sort.Perm);
                case BinaryOp.Minus: return new Sort(Sort.Perm);
                case BinaryOp.Times: return new Sort(Sort.Perm);
                case BinaryOp.Div: return new Sort(Sort.Perm);

                case BinaryOp.Less: return new Sort(Sort.Bool);
                case BinaryOp.AtMost: return new Sort(Sort.Bool);
                case BinaryOp.AtLeast: return new Sort(Sort.Bool);
                case BinaryOp.Greater: return new Sort(Sort.Bool);
            }
        }


        if (leftSort.id === Sort.Seq) {
        }

        if (leftSort.id === Sort.Multiset) {
        }
        
        if (leftSort.id === Sort.Set || rightSort.id === Sort.Set) {
            const setSort = leftSort.id === Sort.Set ? leftSort : rightSort;
            switch (term.op) {
                case BinaryOp.SetAdd: return setSort;
                case BinaryOp.SetDifference: return setSort;
                case BinaryOp.SetIntersection: return setSort;
                case BinaryOp.SetUnion: return setSort;

                case BinaryOp.SetDisjoint: return new Sort(Sort.Bool);
                case BinaryOp.SetIn: return new Sort(Sort.Bool);
                case BinaryOp.SetSubset: return new Sort(Sort.Bool);
            }

            Logger.error("Unexpected set operation: " + term);
            throw new DebuggerError("Unexpected set operation: " + term);
        }

        Logger.error("Unexpected binary operation: " + term);
        throw new DebuggerError("Unexpected binary operation: " + term);
    }

    public visitUnary(unary: Unary): Sort {
        switch (unary.op) {
            case UnaryOp.Not: return new Sort(Sort.Logical);
            case UnaryOp.SeqLength: return new Sort(Sort.Int);
            case UnaryOp.SetCardinality: return new Sort(Sort.Int);
            case UnaryOp.MultiSetCardinality: return new Sort(Sort.Int);
        }

        Logger.error("Unexpected unary operation: " + unary);
        throw new DebuggerError("Unexpected unary operation: " + unary);
    }

    public visitSortWrapper(sortWrapper: SortWrapper): Sort {
        return sortWrapper.sort;
    }

    public visitVariableTerm(variable: VariableTerm): Sort {
        return variable.sort;
    }

    public visitQuantification(quantification: Quantification): Sort {
        Logger.error("Unexpected sort retrieval on quantifications: " + quantification);
        throw new DebuggerError("Unexpected sort retrieval on quantifications: " + quantification);
    }

    public visitApplication(application: Application): Sort {
        return application.sort;
    }

    public visitLookup(lookup: Lookup): Sort {
        const fvfSort = getSort(lookup.fieldValueFunction);
        if (fvfSort.id === Sort.FVF && fvfSort.elementsSort) {
            return fvfSort.elementsSort;
        }
        Logger.error("Unexpected FVF sort: " + fvfSort);
        throw new DebuggerError("Unexpected FVF sort: " + fvfSort);
    }

    public visitPredicateLookup(lookup: PredicateLookup): Sort {
        Logger.error("Predicate lookup sort retrieval not implemented");
        throw new DebuggerError("Predicate lookup sort retrieval not implemented");
    }

    public visitAnd(_: And): Sort {
        return new Sort(Sort.Bool);
    }

    public visitOr(_: Or): Sort {
        return new Sort(Sort.Bool);
    }

    public visitDistinct(_: Distinct): Sort {
        return new Sort(Sort.Bool);
    }
    public visitIte(ite: Ite): Sort {
        const thenSort = getSort(ite.thenBranch);
        const elseSort = getSort(ite.elseBranch);
        if (thenSort.id === elseSort.id) {
            return thenSort;
        } else {
            Logger.error("Mismatching sorts in ternary conditional :" + thenSort + ", " + elseSort);
            throw new DebuggerError("Mismatching sorts in ternary conditional :" + thenSort + ", " + elseSort);
        }
    }

    public visitLet(term: Let): Sort {
        Logger.error("Unexpected sort retrieval on let: " + term);
        throw new DebuggerError("Unexpected sort retrieval on let: " + term);
    }

    public visitLiteral(literal: Literal): Sort {
        return literal.sort;
    }

    public visitSeqRanged(seqRanged: SeqRanged): Sort {
        return new Sort(Sort.Seq, new Sort(Sort.Int));
    }

    public visitSeqSingleton(seqSingleton: SeqSingleton): Sort {
        return new Sort(Sort.Seq, seqSingleton.accept(this));
    }

    public visitSeqUpdate(seqUpdate: SeqUpdate): Sort {
        Logger.error("Unexpected sort retrieval on seq update: " + seqUpdate);
        throw new DebuggerError("Unexpected sort retrieval on seq update: " + seqUpdate);
    }

    public visitSetSingleton(setSingleton: SetSingleton): Sort {
        return new Sort(Sort.Seq, setSingleton.accept(this));
    }

    public visitMultiSetSingleton(multiSetSingleton: MultisetSingleton): Sort {
        return new Sort(Sort.Seq, multiSetSingleton.accept(this));
    }
     public visitLogicalWrapper(_: LogicalWrapper): Sort {
        return new Sort(Sort.Logical);
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
    export const Logical = 'Logical';

    export const sortVisitor = new TermSortVisitor();
}

export function getSort(term: Term): Sort {
    return term.accept(Sort.sortVisitor);
}

