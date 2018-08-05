import { Term, Binary, Unary, SortWrapper, VariableTerm, Quantification, Application, Lookup, PredicateLookup, And, Or, Distinct, Ite, Let, Literal, SeqRanged, SeqSingleton, SeqUpdate, SetSingleton, MultisetSingleton } from "./Term";
import { TranslationEnv } from "./TranslationEnv";
import { AlloyTranslator } from './AlloyTranslator';
import { DebuggerError } from "../Errors";
import { getSort, Sort } from "./Sort";
import { mkString } from "../util";
import { Logger } from "../logger";
import { BinaryOp } from './Term';

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


export class TermTranslator {
    constructor(readonly env: TranslationEnv) {}

    private funCall(name: string, args: Term[]): TranslationRes {
        const tArgs = args.map(a => this.toAlloy(a));

        const nonTranslated = tArgs.find(a => a.res === undefined);
        if (nonTranslated !== undefined) {
            Logger.error("Could not translate argument: " + nonTranslated);
            return leftover(nonTranslated, "Could not translate argument", []);
        }

        return translatedFrom(`${name}[${tArgs.map(a => a.res).join(", ")}]`, tArgs);
    }

    private application(name: string, args: string[], from: TranslationRes[]): TranslationRes {
        return translatedFrom(name + mkString(args, '[', ', ', ']'), from);
    }

    public toAlloy(term: Term): TranslationRes {

        if (term instanceof Binary && term.op === "Combine") {
            this.env.totalCombines += 1;
            return this.funCall("combine", [term.lhs, term.rhs]);
        }

        // TODO: MultiSets / Seqs
        if (term instanceof Binary) {
            const left = this.toAlloy(term.lhs);
            if (left.res === undefined) {
                return leftover(term, "Left-hand side operand not translated", left.leftovers);
            }

            const right = this.toAlloy(term.rhs);
            if (right.res === undefined) {
                return leftover(term, "Right-hand side operand not translated", right.leftovers);
            }

            // Alloy operators only have one equal sign, but are otherwise the same as the Viper ones.
            let alloyOp = term.op.replace("==", "=");

            const leftSort = getSort(term.lhs);
            const rightSort = getSort(term.rhs);

            const res = (s: string) => translatedFrom(s, [left, right]);

            // If the left and right terms are of Bool sort and not the result of a computation, then we need to wrap 
            // them to perform the operation
            if (leftSort.id === Sort.Bool || rightSort.id === Sort.Bool) {
                if (term.op === '==>' || term.op === 'implies' || term.op === '==') {
                    if (term.op === '==') {
                        alloyOp = "&&";
                    }
                    let lhs = left.res;
                    if ((term.lhs instanceof VariableTerm || term.lhs instanceof Application || term.lhs instanceof Lookup)
                            && leftSort.id === Sort.Bool) {
                        lhs = `isTrue[${left.res}]`;
                    }
                    let rhs = right.res;
                    if ((term.rhs instanceof VariableTerm || term.rhs instanceof Application || term.rhs instanceof Lookup)
                            && leftSort.id === Sort.Bool) {
                        rhs = `isTrue[${right.res}]`;
                    }
                    return translatedFrom(`(${lhs} ${alloyOp} ${rhs})`, [left, right]);
                } else {
                    Logger.error("Unexpected operator for operands of type Bool :" + term);
                    throw new DebuggerError("Unexpected operator for operands of type Bool :" + term);
                }
            }

            if (leftSort.id === Sort.Set || rightSort.id === Sort.Set) {
                switch (term.op) {
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
                switch (term.op) {
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
                switch (term.op) {
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
                    default: Logger.error(`Unexpected perm operator: ${term.op}`);
                }
            }

            if (alloyOp === 'Combine') {
                Logger.error("Was not expecting to get here, all combines should be handled from above");
                throw new DebuggerError("Was not expecting to get here, all combines should be handled from above");
            }

            // If we are not dealing with a combine, then return a "regular" binary expression
            return translatedFrom(`(${left.res} ${alloyOp} ${right.res})`, [left, right]);
        }

        if (term instanceof Unary) {
            const operand  = this.toAlloy(term.p); 
            if (!operand.res) {
                return leftover(term, "Operand not translated", operand.leftovers);
            }
            const termSort = getSort(term.p);

            if (term.op === "SetCardinality:" && termSort.id === Sort.Set) {
                    return translatedFrom(`#(${operand.res})`, [operand]);
            }

            if ((term.p instanceof VariableTerm || term.p instanceof Application || term.p instanceof Lookup)
                    && termSort.id === Sort.Bool) {
                if (term.op === "!") {
                    return translatedFrom(`isFalse[${operand.res}]`, [operand]);
                }
            }

            return translatedFrom(`${term.op}(${operand.res})`, [operand]);
        }

        // TODO: Fix this
        if (term instanceof SortWrapper) {
            const fromSort = getSort(term.term);
            const toSort = term.sort;

            const funName = `sortwrapper_${this.env.translate(fromSort)}_to_${this.env.translate(toSort)}`;
            if (!this.env.sortWrappers.has(funName)) {
                this.env.sortWrappers.set(funName, fromSort);
            }

            return this.funCall(funName.toLowerCase(), [term.term]);

            // const application = new Application(funName, [term.term], toSort); 
            // return this.toAlloy(application);
            // return leftover(term, "Not translating SortWrappers", []);
        }

        if (term instanceof VariableTerm) {
            const resolved = this.env.resolve(term);
            if (resolved) {
                return translatedFrom(sanitize(resolved), []);
            }
            return leftover(term, `Could not retrieve variable '${term.toString()}'`, []);
        }

        if (term instanceof Quantification) {
            const tVars = term.vars.map(v => `${sanitize(v.id)}: ${this.env.translate(v.sort)}`);

            let mult: string;
            if (term.quantifier === 'QA') {
                mult = 'all';
            } else if (term.quantifier === 'QE') {
                mult = 'some';
            } else {
                throw new DebuggerError(`Unexpected quantifier '${term.quantifier}'`);
            }

            // Inside quantifiers, the quantified variables are defined as well
            return this.env.evaluateWithQuantifiedVariables(
                term.vars.map(v => v.id),
                () => {
                    const tBody = this.toAlloy(term.body);

                    if (!tBody.res) {
                        return leftover(term, "Could not translate quantified variables", tBody!.leftovers);
                    }

                    return translatedFrom(tBody.res, [tBody])
                                .withQuantifiedVariables(tVars.map(v => `${mult} ${v}`));
                });
        }

        if (term instanceof Application) {
            const applicableSanitized = sanitize(term.applicable);

            if (applicableSanitized.endsWith('trigger')) {
                // TODO: Do we want to ignore these in the end?
                return leftover(term, "Explicitely ignoring trigger applications", []);
            }

            if (applicableSanitized.startsWith("sm") && term.sort.id === Sort.FVF) {
                if (this.env.introduceMissingTempVars) {
                    const snapshotMapVar = new VariableTerm(applicableSanitized, term.sort);
                    this.env.recordTempVariable(snapshotMapVar);
                    return this.toAlloy(snapshotMapVar);
                } else {
                    return leftover(term, "Not introducing new variable for snapshot map", []);
                }
            }

            if (applicableSanitized.startsWith("pTaken")) {
                if (!this.env.actualFucntions.has(applicableSanitized)) {
                    return this.funCall(applicableSanitized, term.args);
                }
            }

            const args = term.args.map(a => this.toAlloy(a));

            // Collect the leftovers from the translation of all arguments
            const leftovers = args.reduce(
                (acc, current) => acc.concat(current.leftovers),
                <Leftover[]>[]
            );

            // Translating some of the arguments has failed.
            if (args.some(a => a.res === undefined)) {
                return leftover(term, "Could not translate some of the arguments", leftovers);
            }

            const sorts = term.args.map(a => getSort(a));
            sorts.push(term.sort);

            this.env.recordFunction(applicableSanitized, sorts);
            const callName = `${AlloyTranslator.Function}.${applicableSanitized}`;
            const callArgs = args.map(a => a.res).join(", ");
            return translatedFrom(`${callName}[${callArgs}]`, args);
        }

        if (term instanceof Lookup) {
            const receiver = this.toAlloy(term.receiver);
            if (!receiver.res) {
                return leftover(term, "Could not translate receiver", receiver.leftovers);
            }

            const returnSort = getSort(term.fieldValueFunction);
            if (!(returnSort.id === Sort.FVF && returnSort.elementsSort !== undefined)) {
                Logger.error(`Expected sort to a FVF, but was '${returnSort}': ` + term);
                throw new DebuggerError(`Expected sort to a FVF, but was '${returnSort}': ` + term);
            }

            const f = new Application('lookup_' + term.field,
                                      [term.fieldValueFunction, term.receiver],
                                      returnSort.elementsSort);
            return this.toAlloy(f);

            // return translatedFrom(receiver.res + "." + term.field, [receiver]);
        }

        // TODO: Implement this
        if (term instanceof PredicateLookup) {
            return leftover(term, "Predicate Lookups not implemented", []);
        }

        if (term instanceof And || term instanceof Or) {
            const terms = term.terms.map(t => this.toAlloy(t));

            // Collect the leftovers from the translation of all terms
            const leftovers = terms.reduce(
                (acc, current) => acc.concat(current.leftovers),
                <Leftover[]>[]
            );

            // Translating some of the arguments has failed.
            if (terms.some(a => a.res === undefined)) {
                return leftover(term, "Could not translate some of the terms", leftovers);
            }

            const op = term instanceof And ? " && " : " || ";
            return translatedFrom("(" + terms.map(t => t.res).join(op) + ")", terms);
        }

        // TODO: Implement this
        if (term instanceof Distinct) {
            return leftover(term, "'Distinct' term is not implemented", []);
        }

        if (term instanceof Ite) {
            const cond = this.toAlloy(term.condition);
            const thenBranch = this.toAlloy(term.thenBranch);
            const elseBranch = this.toAlloy(term.elseBranch);

            const leftovers = cond.leftovers.concat(thenBranch.leftovers).concat(elseBranch.leftovers);
            if (!cond.res || !thenBranch.res || !elseBranch.res) {
                return leftover(term, "Could not translate 'Ite'", leftovers);
            }

            const res = `(${cond.res} implies ${thenBranch.res} else ${elseBranch.res})`;
            return translatedFrom(res, [cond, thenBranch, elseBranch]);
        }

        // TODO: Implement this
        if (term instanceof Let) {
            return leftover(term, "Let translation not implemented", []);
        }

        if (term instanceof Literal) {
            if (term.sort.id === Sort.Ref && term.value === "Null") {
                return translatedFrom("NULL", []);
            }

            if (term.sort.id === Sort.Snap && term.value === '_') {
                return translatedFrom(AlloyTranslator.Unit, []);
            }

            if (term.sort.id === Sort.Perm) {
                if (term.value === AlloyTranslator.WritePerm) {
                    return translatedFrom(AlloyTranslator.WritePerm, []);
                } else if (term.value === AlloyTranslator.NoPerm) {
                    return translatedFrom(AlloyTranslator.NoPerm, []);
                }
                // TODO: proper fresh name?
                const freshName = this.env.getFreshName("p");
                const quantifiedVariables = [`one ${freshName}: ${AlloyTranslator.Perm}`];
                let additionalFacts: string[] = [];

                const parts = term.value.split('/');
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

            return translatedFrom(term.value, []);
        }

        // TODO: Implement this
        if (term instanceof SeqRanged) {
            return leftover(term, "SeqRanged translation not implemented", []);
        }

        // TODO: Implement this
        if (term instanceof SeqSingleton) {
            return leftover(term, "SeqSingleton translation not implemented", []);
        }

        // TODO: Implement this
        if (term instanceof SeqUpdate) {
            return leftover(term, "SeqUpdate translation not implemented", []);
        }

        // TODO: Sets of sets
        // Substantially everything in Alloy is a set, so we can simply translate the value
        if (term instanceof SetSingleton) {
            const value = this.toAlloy(term.value);
            if (value.res) {
                return translatedFrom(`{ ${value.res} }`, [value]);
            } else {
                return leftover(term, "Could not translate set value", value.leftovers);
            }
        }

        // TODO: Implement this
        if (term instanceof MultisetSingleton) {
            return leftover(term, "MultiSetSingleton translation not implemented", []);
        }

        throw new DebuggerError(`Unexpected term: ${term.toString()}`);
    }
}
