import { TermVisitor } from "./TermTranslator";
import { Sort } from "./Sort";
import { Binary, BinaryOp, Unary, UnaryOp, SortWrapper, VariableTerm, Quantification, Application, Lookup, PredicateLookup, And, Or, Distinct, Ite, Let, Literal, SeqRanged, SeqSingleton, SeqUpdate, SetSingleton, MultisetSingleton, LogicalWrapper, BooleanWrapper } from "./Term";
import { Logger } from "../logger";
import { DebuggerError } from "../Errors";

export class TermSortVisitor implements TermVisitor<Sort> {

    public visitBinary(term: Binary): Sort {

        const leftSort = term.lhs.accept(this);
        const rightSort = term.rhs.accept(this);

        // Perm equality is implemented via a function, because we need to check
        // if fractions are multiples of each other, so it returns a Bool
        if (leftSort.is(Sort.Perm) && rightSort.is(Sort.Perm) && term.op === BinaryOp.Equals) {
            return Sort.Bool;
        }

        // We don't need to know the sorts of the operands to distinguish these
        switch (term.op) {
            // Booleans
            case BinaryOp.Implies: return Sort.Logical;
            case BinaryOp.Iff: return Sort.Logical;
            case BinaryOp.Equals: return Sort.Logical;
            case BinaryOp.CustomEquals: return Sort.Logical;
            // Combine
            case BinaryOp.Combine: return Sort.Snap;
        }

        if (leftSort.is(Sort.Int) && rightSort.is(Sort.Int)) {
            switch (term.op) {
                case BinaryOp.Minus: return Sort.Int;
                case BinaryOp.Plus: return Sort.Int;
                case BinaryOp.Times: return Sort.Int;
                case BinaryOp.Div: return Sort.Int;
                case BinaryOp.Mod: return Sort.Int;
                // Arithmetic comparisons
                case BinaryOp.Less: return Sort.Logical;
                case BinaryOp.AtMost: return Sort.Logical;
                case BinaryOp.AtLeast: return Sort.Logical;
                case BinaryOp.Greater: return Sort.Logical;
            }
        }

        if (leftSort.is(Sort.Perm) || rightSort.is(Sort.Perm)) {
            switch (term.op) {
                case BinaryOp.Plus: return Sort.Perm;
                case BinaryOp.Minus: return Sort.Perm;
                case BinaryOp.Times: return Sort.Perm;
                case BinaryOp.Div: return Sort.Perm;
                case BinaryOp.PermMin: return Sort.Perm;

                case BinaryOp.Less: return Sort.Logical;
                case BinaryOp.AtMost: return Sort.Logical;
                case BinaryOp.AtLeast: return Sort.Logical;
                case BinaryOp.Greater: return Sort.Logical;
            }
        }


        if (leftSort.is('Seq') || rightSort.is('Seq')) {
            const sort = leftSort.is('Seq') ? leftSort : rightSort;
            switch (term.op) {
                case BinaryOp.SeqAppend: return sort;
                case BinaryOp.SeqAt: return sort.elementsSort!;
                case BinaryOp.SeqTake: return sort;
                case BinaryOp.SeqDrop: return sort;

                case BinaryOp.SeqIn: return Sort.Logical;
            }
        }

        if (leftSort.is('Multiset')) {
            const sort = leftSort.is('Multiset') ? leftSort : rightSort;
            switch (term.op) {
                case BinaryOp.MultisetAdd: return sort;
                case BinaryOp.MultisetDifference: return sort;
                case BinaryOp.MultisetIntersection: return sort;
                case BinaryOp.MultisetUnion: return sort;
                case BinaryOp.MultisetSubset: return Sort.Logical;
                case BinaryOp.MultisetCount: return Sort.Int;
            }
        }
        
        if (leftSort.is('Set') || rightSort.is('Set')) {
            const setSort = leftSort.is('Set') ? leftSort : rightSort;
            switch (term.op) {
                case BinaryOp.SetAdd: return setSort;
                case BinaryOp.SetDifference: return setSort;
                case BinaryOp.SetIntersection: return setSort;
                case BinaryOp.SetUnion: return setSort;

                case BinaryOp.SetIn: return Sort.Logical;
                case BinaryOp.SetDisjoint: return Sort.Logical;
                case BinaryOp.SetSubset: return Sort.Logical;
            }

            Logger.error("Unexpected set operation: " + term);
            throw new DebuggerError("Unexpected set operation: " + term);
        }

        Logger.error("Unexpected binary operation: " + term);
        throw new DebuggerError("Unexpected binary operation: " + term);
    }

    public visitUnary(unary: Unary): Sort {
        switch (unary.op) {
            case UnaryOp.Not: return Sort.Logical;
            case UnaryOp.SeqLength: return Sort.Int;
            case UnaryOp.SetCardinality: return Sort.Int;
            case UnaryOp.MultiSetCardinality: return Sort.Int;
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
        return Sort.Logical;
    }

    public visitApplication(application: Application): Sort {
        return application.sort;
    }

    public visitLookup(lookup: Lookup): Sort {
        const fvfSort = lookup.fieldValueFunction.accept(this);
        if (fvfSort.is('FVF') && fvfSort.elementsSort) {
            return fvfSort.elementsSort;
        }
        Logger.error("Unexpected FVF sort: " + fvfSort);
        throw new DebuggerError("Unexpected FVF sort: " + fvfSort);
    }

    public visitPredicateLookup(lookup: PredicateLookup): Sort {
        const psfSort = lookup.predicateSnapFunction.accept(this);
        if (psfSort.is('PSF') && psfSort.elementsSort) {
            return psfSort.elementsSort;
        }
        Logger.error("Unexpected PSF sort: " + psfSort);
        throw new DebuggerError("Unexpected PSF sort: " + psfSort);
    }

    public visitAnd(_: And): Sort {
        return Sort.Logical;
    }

    public visitOr(_: Or): Sort {
        return Sort.Logical;
    }

    public visitDistinct(_: Distinct): Sort {
        return Sort.Bool;
    }
    public visitIte(ite: Ite): Sort {
        const thenSort = ite.thenBranch.accept(this);
        const elseSort = ite.elseBranch.accept(this);
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

    public visitSeqRanged(_: SeqRanged): Sort {
        return Sort.Seq(Sort.Int);
    }

    public visitSeqSingleton(seqSingleton: SeqSingleton): Sort {
        return Sort.Seq(seqSingleton.value.accept(this));
    }

    public visitSeqUpdate(seqUpdate: SeqUpdate): Sort {
        return seqUpdate.seq.accept(this);
    }

    public visitSetSingleton(setSingleton: SetSingleton): Sort {
        return Sort.Set(setSingleton.value.accept(this));
    }

    public visitMultiSetSingleton(multiSetSingleton: MultisetSingleton): Sort {
        return Sort.Multiset(multiSetSingleton.value.accept(this));
    }

    public visitLogicalWrapper(_: LogicalWrapper): Sort {
       return Sort.Logical;
    }

    public visitBooleanWrapper(_: BooleanWrapper): Sort {
        return Sort.Bool;
    }
}