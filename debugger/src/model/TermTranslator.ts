import { Binary, Unary, VariableTerm, Quantification, Application, Lookup, PredicateLookup, And, Or, Distinct, Ite, Let, Literal, SeqRanged, SeqSingleton, SeqUpdate, SetSingleton, MultisetSingleton, SortWrapper, Term, BinaryOp } from "./Term";
import { TranslationEnv } from "./TranslationEnv";
import { Logger } from "../logger";
import { getSort, Sort } from "./Sort";
import { DebuggerError } from "../Errors";
import { mkString } from "../util";
import { AlloyTranslator } from "./AlloyTranslator";


export interface TermVisitor<T> {
    visitBinary(binary: Binary): T;
    visitUnary(unary: Unary): T;
    visitSortWrapper(sortWrapper: SortWrapper): T;
    visitVariableTerm(variabe: VariableTerm): T;
    visitQuantification(quantification: Quantification): T;
    visitApplication(application: Application): T;
    visitLookup(lookup: Lookup): T;
    visitPredicateLookup(lookup: PredicateLookup): T;
    visitAnd(and: And): T;
    visitOr(or: Or): T;
    visitDistinct(distinct: Distinct): T;
    visitIte(ite: Ite): T;
    visitLet(term: Let): T;
    visitLiteral(literal: Literal): T;
    visitSeqRanged(seqRanged: SeqRanged): T;
    visitSeqSingleton(seqSingleton: SeqSingleton): T;
    visitSeqUpdate(seqUpdate: SeqUpdate): T;
    visitSetSingleton(setSingleton: SetSingleton): T;
    visitMultiSetSingleton(multiSetSeingleton: MultisetSingleton): T;
}

export function sanitize(name: string) {
    return name.replace(/^\$/g, "")
               .replace(/[@[\]$]/g, "_");
}

export class Leftover {
    constructor(readonly leftover: Term, readonly reason: string, readonly other: Leftover[]) {}

    toString() {
        return this.reason + ": " + this.leftover.toString();
    }

    toStringWithChildren(indent = 0): string {
        return this.reason + ": " + this.leftover.toString() + "\n" +
            this.other.map(o => o.toStringWithChildren(indent + 1));
    }
}

export class TranslationRes {
    constructor(readonly res: string | undefined,
                readonly leftovers: Leftover[],
                readonly quantifiedVariables: string[],
                readonly additionalFacts: string[]) {}
    
    public withQuantifiedVariables(quantifiedVariables: string[]) {
        quantifiedVariables.forEach(v => this.quantifiedVariables.push(v));
        return this;
    }

    public withAdditionalFacts(additionalFacts: string[]) {
        additionalFacts.forEach(f => this.additionalFacts.push(f));
        return this;
    }
}
function translatedFrom(res: string, others: TranslationRes[]) {
    let leftovers = others.reduce((acc, curr) => acc.concat(curr.leftovers), [] as Leftover[]);
    let quantifiedVariables = others.reduce((acc, curr) => acc.concat(curr.quantifiedVariables), [] as string[]);
    let additionalFacts = others.reduce((acc, curr) => acc.concat(curr.additionalFacts), [] as string[]);

    return new TranslationRes(res, leftovers, quantifiedVariables, additionalFacts);
}

function leftover(leftover: Term, reason: string, other: Leftover[]) {
    return new TranslationRes(undefined, [new Leftover(leftover, reason, other)], [], []);
}

export class TermTranslatorVisitor implements TermVisitor<TranslationRes> {

    constructor(readonly env: TranslationEnv) {}

    private funCall(name: string, args: Term[]): TranslationRes {
        const tArgs: TranslationRes[] = [];
        args.forEach(a => {
            const res = a.accept(this);
            if (res.res === undefined) {
                Logger.error("Could not translate argument: " + res);
                return leftover(a, "Could not translate argument", []);
            }
            tArgs.push(res);
        });

        return translatedFrom(`${name}[${tArgs.map(a => a.res).join(", ")}]`, tArgs);
    }

    private application(name: string, args: string[], from: TranslationRes[]): TranslationRes {
        return translatedFrom(name + mkString(args, '[', ', ', ']'), from);
    }

    visitBinary(binary: Binary): TranslationRes {
        if (binary.op === "Combine") {
            this.env.totalCombines += 1;
            return this.funCall("combine", [binary.lhs, binary.rhs]);
        }

        const left = binary.lhs.accept(this);
        if (left.res === undefined) {
            return leftover(binary, "Left-hand side operand not translated", left.leftovers);
        }

        const right = binary.rhs.accept(this);
        if (right.res === undefined) {
            return leftover(binary, "Right-hand side operand not translated", right.leftovers);
        }

        // Alloy operators only have one equal sign, but are otherwise the same as the Viper ones.
        let alloyOp = binary.op.replace("==", "=");

        const leftSort = getSort(binary.lhs);
        const rightSort = getSort(binary.rhs);

        const res = (s: string) => translatedFrom(s, [left, right]);

        // If the left and right terms are of Bool sort and not the result of a computation, then we need to wrap 
        // them to perform the operation
        if (leftSort.id === Sort.Bool || rightSort.id === Sort.Bool) {
            if (binary.op === '==>' || binary.op === 'implies' || binary.op === '==') {
                if (binary.op === '==') {
                    alloyOp = "&&";
                }
                let lhs = left.res;
                if ((binary.lhs instanceof VariableTerm || binary.lhs instanceof Application || binary.lhs instanceof Lookup)
                        && leftSort.id === Sort.Bool) {
                    lhs = `isTrue[${left.res}]`;
                }
                let rhs = right.res;
                if ((binary.rhs instanceof VariableTerm || binary.rhs instanceof Application || binary.rhs instanceof Lookup)
                        && leftSort.id === Sort.Bool) {
                    rhs = `isTrue[${right.res}]`;
                }
                return translatedFrom(`(${lhs} ${alloyOp} ${rhs})`, [left, right]);
            } else {
                Logger.error("Unexpected operator for operands of type Bool :" + binary);
                throw new DebuggerError("Unexpected operator for operands of type Bool :" + binary);
            }
        }

        if (leftSort.id === Sort.Set || rightSort.id === Sort.Set) {
            switch (binary.op) {
                case BinaryOp.SetAdd: return res(`(${left.res} + ${right.res})`);
                case BinaryOp.SetDifference: return res(`(${left.res} - ${right.res})`);
                case BinaryOp.SetIntersection: return res(`(${left.res} & ${right.res})`);
                case BinaryOp.SetUnion: return res(`(${left.res} + ${right.res})`);

                case BinaryOp.SetIn: return res(`${left.res} in ${right.res}`);
                case BinaryOp.SetSubset: return res(`${left.res} in ${right.res}`);
                case BinaryOp.SetDisjoint: return res(`disj[${left.res}, ${right.res}]`);
            }
        }

        if (leftSort.id === Sort.Int || rightSort.id === Sort.Int) {
            switch (binary.op) {
                case '-': return this.application('minus', [left.res, right.res], [left, right]);
                case '+': return this.application('plus', [left.res, right.res], [left, right]);
                case '*': return this.application('mul', [left.res, right.res], [left, right]);
                case '/': return this.application('div', [left.res, right.res], [left, right]);
                case '%': return this.application('rem', [left.res, right.res], [left, right]);
                case '<': return translatedFrom(`(${left.res} ${alloyOp} ${right.res})`, [left, right]);
                case '<=': return translatedFrom(`(${left.res} ${alloyOp} ${right.res})`, [left, right]);
                case '>': return translatedFrom(`(${left.res} ${alloyOp} ${right.res})`, [left, right]);
                case '>=': return translatedFrom(`(${left.res} ${alloyOp} ${right.res})`, [left, right]);
            }
        }

        // TODO: IntPermTimes, IntPermDIv, PermMin, 
        // Operations on permissions are translated to predicate calls
        if (leftSort.id === Sort.Perm || rightSort.id === Sort.Perm) {
            const pred = (name: string) => this.application(name, [left.res!, right.res!], [left, right]);
            switch (binary.op) {
                case '<': return pred('perm_less');
                case '<=': return pred('perm_at_most');
                case '+': return pred('perm_plus');
                case '-': return pred('perm_minus');
                // Int-Perm multiplication always has the integer on the left in Silicon
                case '*': return leftSort.id === Sort.Int ? pred('int_perm_mul') : pred('perm_mul');
                // Int-Perm division always has the integer on the left in Silicon
                case '/': return pred('int_perm_div');
                case 'PermMin': return pred('perm_min');
                case '==': return translatedFrom(`(${left.res} = ${right.res})`, [left, right]);
                default: Logger.error(`Unexpected perm operator: ${binary.op}`);
            }
        }

        // If we are not dealing with a combine, then return a "regular" binary expression
        return translatedFrom(`(${left.res} ${alloyOp} ${right.res})`, [left, right]);
    }

    visitUnary(unary: Unary): TranslationRes {
        const operand  = unary.p.accept(this); 
        if (!operand.res) {
            return leftover(unary, "Operand not translated", operand.leftovers);
        }
        const termSort = getSort(unary.p);

        if (unary.op === "SetCardinality:" && termSort.id === Sort.Set) {
                return translatedFrom(`#(${operand.res})`, [operand]);
        }

        if ((unary.p instanceof VariableTerm || unary.p instanceof Application || unary.p instanceof Lookup)
                && termSort.id === Sort.Bool) {
            if (unary.op === "!") {
                return translatedFrom(`isFalse[${operand.res}]`, [operand]);
            }
        }

        return translatedFrom(`${unary.op}(${operand.res})`, [operand]);
    }

    visitSortWrapper(sortWrapper: SortWrapper): TranslationRes {
        const fromSort = getSort(sortWrapper.term);
        const toSort = sortWrapper.sort;

        const funName = `sortwrapper_${this.env.translate(fromSort)}_to_${this.env.translate(toSort)}`;
        if (!this.env.sortWrappers.has(funName)) {
            this.env.sortWrappers.set(funName, fromSort);
        }

        return this.funCall(funName.toLowerCase(), [sortWrapper.term]);
    }

    visitVariableTerm(variable: VariableTerm): TranslationRes {
        const resolved = this.env.resolve(variable);
        if (resolved) {
            return translatedFrom(sanitize(resolved), []);
        }
        return leftover(variable, `Could not retrieve variable '${variable.toString()}'`, []);
    }

    visitQuantification(quantification: Quantification): TranslationRes {
        const tVars = quantification.vars.map(v => `${sanitize(v.id)}: ${this.env.translate(v.sort)}`);

        let mult: string;
        if (quantification.quantifier === 'QA') {
            mult = 'all';
        } else if (quantification.quantifier === 'QE') {
            mult = 'some';
        } else {
            throw new DebuggerError(`Unexpected quantifier '${quantification.quantifier}'`);
        }

        // Inside quantifiers, the quantified variables are defined as well
        return this.env.evaluateWithAdditionalVariables(
            quantification.vars.map(v => v.id),
            () => {
                const tBody = quantification.body.accept(this);

                if (!tBody.res) {
                    return leftover(quantification, "Could not translate quantified variables", tBody!.leftovers);
                }

                return translatedFrom(tBody.res, [tBody])
                            .withQuantifiedVariables(tVars.map(v => `${mult} ${v}`));
            });

    }

    visitApplication(application: Application): TranslationRes {
        const applicableSanitized = sanitize(application.applicable);

        if (applicableSanitized.endsWith('trigger')) {
            // TODO: Do we want to ignore these in the end?
            return leftover(application, "Explicitely ignoring trigger applications", []);
        }

        if (applicableSanitized.startsWith("sm") && application.sort.id === Sort.FVF) {
            if (this.env.introduceMissingTempVars) {
                const snapshotMapVar = new VariableTerm(applicableSanitized, application.sort);
                this.env.recordTempVariable(snapshotMapVar);
                return snapshotMapVar.accept(this);
            } else {
                return leftover(application, "Not introducing new variable for snapshot map", []);
            }
        }

        if (applicableSanitized.startsWith("pTaken")) {
            if (!this.env.actualFucntions.has(applicableSanitized)) {
                return this.funCall(applicableSanitized, application.args);
            }
        }

        const args = application.args.map(a => a.accept(this));

        // Collect the leftovers from the translation of all arguments
        const leftovers = args.reduce(
            (acc, current) => acc.concat(current.leftovers),
            <Leftover[]>[]
        );

        // Translating some of the arguments has failed.
        if (args.some(a => a.res === undefined)) {
            return leftover(application, "Could not translate some of the arguments", leftovers);
        }

        const sorts = application.args.map(a => getSort(a));
        sorts.push(application.sort);

        this.env.recordFunction(applicableSanitized, sorts);
        const callName = `${AlloyTranslator.Function}.${applicableSanitized}`;
        const callArgs = args.map(a => a.res).join(", ");
        return translatedFrom(`${callName}[${callArgs}]`, args);
    }

    visitLookup(lookup: Lookup): TranslationRes {
        const receiver = lookup.receiver.accept(this);
        if (!receiver.res) {
            return leftover(lookup, "Could not translate receiver", receiver.leftovers);
        }

        const returnSort = getSort(lookup.fieldValueFunction);
        if (!(returnSort.id === Sort.FVF && returnSort.elementsSort !== undefined)) {
            Logger.error(`Expected sort to a FVF, but was '${returnSort}': ` + lookup);
            throw new DebuggerError(`Expected sort to a FVF, but was '${returnSort}': ` + lookup);
        }

        const name = 'lookup_' + lookup.field;
        const f = new Application(name,
                                    [lookup.fieldValueFunction, lookup.receiver],
                                    returnSort.elementsSort);
        this.env.lookupFunctions.push([returnSort, lookup.field]);
        
        return f.accept(this);
    }

    // TODO: Implement this
    visitPredicateLookup(lookup: PredicateLookup): TranslationRes {
        return leftover(lookup, "Predicate Lookups not implemented", []);
    }

    visitAnd(and: And): TranslationRes {
        const terms = and.terms.map(t => t.accept(this));

        // Collect the leftovers from the translation of all terms
        const leftovers = terms.reduce(
            (acc, current) => acc.concat(current.leftovers),
            <Leftover[]>[]
        );

        // Translating some of the arguments has failed.
        if (terms.some(a => a.res === undefined)) {
            return leftover(and, "Could not translate some of the terms", leftovers);
        }

        return translatedFrom("(" + terms.map(t => t.res).join(" && ") + ")", terms);
    }

    visitOr(or: Or): TranslationRes {
        const terms = or.terms.map(t => t.accept(this));

        // Collect the leftovers from the translation of all terms
        const leftovers = terms.reduce(
            (acc, current) => acc.concat(current.leftovers),
            <Leftover[]>[]
        );

        // Translating some of the arguments has failed.
        if (terms.some(a => a.res === undefined)) {
            return leftover(or, "Could not translate some of the terms", leftovers);
        }

        return translatedFrom("(" + terms.map(t => t.res).join(" && ") + ")", terms);
    }

    // TODO: Implement this
    visitDistinct(distinct: Distinct): TranslationRes {
        return leftover(distinct, "'Distinct' term is not implemented", []);
    }

    visitIte(ite: Ite): TranslationRes {
        const cond = ite.condition.accept(this);
        const thenBranch = ite.thenBranch.accept(this);
        const elseBranch = ite.elseBranch.accept(this);

        const leftovers = cond.leftovers.concat(thenBranch.leftovers).concat(elseBranch.leftovers);
        if (!cond.res || !thenBranch.res || !elseBranch.res) {
            return leftover(ite, "Could not translate 'Ite'", leftovers);
        }

        const res = `(${cond.res} implies ${thenBranch.res} else ${elseBranch.res})`;
        return translatedFrom(res, [cond, thenBranch, elseBranch]);
    }

    // TODO: Implement this
    visitLet(term: Let): TranslationRes {
        return leftover(term, "Let translation not implemented", []);
    }

    visitLiteral(literal: Literal): TranslationRes {
        if (literal.sort.id === Sort.Ref && literal.value === "Null") {
            return translatedFrom("NULL", []);
        }

        if (literal.sort.id === Sort.Snap && literal.value === '_') {
            return translatedFrom(AlloyTranslator.Unit, []);
        }

        if (literal.sort.id === Sort.Perm) {
            if (literal.value === AlloyTranslator.WritePerm) {
                return translatedFrom(AlloyTranslator.WritePerm, []);
            } else if (literal.value === AlloyTranslator.NoPerm) {
                return translatedFrom(AlloyTranslator.NoPerm, []);
            }
            // TODO: proper fresh name?
            const freshName = this.env.getFreshName("p");
            const quantifiedVariables = [`one ${freshName}: ${AlloyTranslator.Perm}`];
            let additionalFacts: string[] = [];

            const parts = literal.value.split('/');
            additionalFacts = [
                `${freshName} in ${AlloyTranslator.Perm}`,
                `${freshName}.num = ${parts[0]}`,
                `${freshName}.denom = ${parts[1]}`
            ];

            // In the end, the translated combine is simply the fresh name
            return translatedFrom(freshName, [])
                    .withQuantifiedVariables(quantifiedVariables)
                    .withAdditionalFacts(additionalFacts);
        }

        return translatedFrom(literal.value, []);
    }

    // TODO: Implement this
    visitSeqRanged(seqRanged: SeqRanged): TranslationRes {
        return leftover(seqRanged, "SeqRanged translation not implemented", []);
    }

    // TODO: Implement this
    visitSeqSingleton(seqSingleton: SeqSingleton): TranslationRes {
        return leftover(seqSingleton, "SeqSingleton translation not implemented", []);
    }

    // TODO: Implement this
    visitSeqUpdate(seqUpdate: SeqUpdate): TranslationRes {
        return leftover(seqUpdate, "SeqUpdate translation not implemented", []);
    }

    // TODO: Implement this
    visitSetSingleton(setSingleton: SetSingleton): TranslationRes {
        return leftover(setSingleton, "SetSingleton translation not implemented", []);
    }

    // TODO: Implement this
    visitMultiSetSingleton(multiSetSeingleton: MultisetSingleton): TranslationRes {
        return leftover(multiSetSeingleton, "MultisetSingleton translation not implemented", []);
    }
}