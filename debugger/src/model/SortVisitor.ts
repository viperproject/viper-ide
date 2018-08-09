import { TermVisitor } from "./TermTranslator";
import { Sort } from "./Sort";
import { Binary, BinaryOp, Unary, UnaryOp, SortWrapper, VariableTerm, Quantification, Application, Lookup, PredicateLookup, And, Or, Distinct, Ite, Let, Literal, SeqRanged, SeqSingleton, SeqUpdate, SetSingleton, MultisetSingleton, LogicalWrapper } from "./Term";
import { Logger } from "../logger";
import { DebuggerError } from "../Errors";

export class TermSortVisitor implements TermVisitor<Sort> {

    public visitBinary(term: Binary): Sort {
        // We don't need to know the sorts of the operands to distinguish these
        switch (term.op) {
            // Booleans
            case BinaryOp.Implies: return Sort.Logical;
            case BinaryOp.Iff: return Sort.Logical;
            case BinaryOp.Equals: return Sort.Logical;
            // Combine
            case BinaryOp.Combine: return Sort.Snap;
        }

        const leftSort = term.lhs.accept(this);
        const rightSort = term.rhs.accept(this);

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

        if (leftSort.is('Set')) {
            switch (term.op) {
                case BinaryOp.SetAdd: return leftSort;
                case BinaryOp.SetDifference: return leftSort;
                case BinaryOp.SetIntersection: return leftSort;
                case BinaryOp.SetUnion: return leftSort;

                case BinaryOp.SetIn: return Sort.Bool;
                case BinaryOp.SetSubset: return Sort.Bool;
                case BinaryOp.SetDisjoint: return Sort.Bool;
            }
        }

        if (leftSort.is(Sort.Perm) || rightSort.is(Sort.Perm)) {
            switch (term.op) {
                case BinaryOp.Plus: return Sort.Perm;
                case BinaryOp.Minus: return Sort.Perm;
                case BinaryOp.Times: return Sort.Perm;
                case BinaryOp.Div: return Sort.Perm;

                case BinaryOp.Less: return Sort.Bool;
                case BinaryOp.AtMost: return Sort.Bool;
                case BinaryOp.AtLeast: return Sort.Bool;
                case BinaryOp.Greater: return Sort.Bool;
            }
        }


        if (leftSort.is('Seq')) {
        }

        if (leftSort.is('Multiset')) {
        }
        
        if (leftSort.is('Set') || rightSort.is('Set')) {
            const setSort = leftSort.is('Set') ? leftSort : rightSort;
            switch (term.op) {
                case BinaryOp.SetAdd: return setSort;
                case BinaryOp.SetDifference: return setSort;
                case BinaryOp.SetIntersection: return setSort;
                case BinaryOp.SetUnion: return setSort;

                case BinaryOp.SetDisjoint: return Sort.Bool;
                case BinaryOp.SetIn: return Sort.Bool;
                case BinaryOp.SetSubset: return Sort.Bool;
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
        Logger.error("Unexpected sort retrieval on quantifications: " + quantification);
        throw new DebuggerError("Unexpected sort retrieval on quantifications: " + quantification);
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
        Logger.error("Predicate lookup sort retrieval not implemented");
        throw new DebuggerError("Predicate lookup sort retrieval not implemented");
    }

    public visitAnd(_: And): Sort {
        return Sort.Bool;
    }

    public visitOr(_: Or): Sort {
        return Sort.Bool;
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

    public visitSeqRanged(seqRanged: SeqRanged): Sort {
        return Sort.Seq(Sort.Int);
    }

    public visitSeqSingleton(seqSingleton: SeqSingleton): Sort {
        return Sort.Seq(seqSingleton.accept(this));
    }

    public visitSeqUpdate(seqUpdate: SeqUpdate): Sort {
        Logger.error("Unexpected sort retrieval on seq update: " + seqUpdate);
        throw new DebuggerError("Unexpected sort retrieval on seq update: " + seqUpdate);
    }

    public visitSetSingleton(setSingleton: SetSingleton): Sort {
        return Sort.Seq(setSingleton.accept(this));
    }

    public visitMultiSetSingleton(multiSetSingleton: MultisetSingleton): Sort {
        return Sort.Seq(multiSetSingleton.accept(this));
    }
     public visitLogicalWrapper(_: LogicalWrapper): Sort {
        return Sort.Logical;
     }
}