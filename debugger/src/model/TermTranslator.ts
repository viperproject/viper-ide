import { Term, Binary, Unary, SortWrapper, VariableTerm, Quantification, Application, Lookup, PredicateLookup, And, Or, Distinct, Ite, Let, Literal, SeqRanged, SeqSingleton, SeqUpdate, SetSingleton, MultisetSingleton } from "./Term";
import { TranslationEnv } from "./TranslationEnv";
import { AlloyTranslator } from './AlloyTranslator';
import { DebuggerError } from "../Errors";
import { getSort, Sort } from "./Sort";

export function sanitize(name: string) {
    return name.replace(/@/g, "_")
               .replace(/^\$/g, "")
               .replace(/\$/g, "_");
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

    // TODO: implement this properly
    public static getFieldKey(sort: Sort) {
        if (sort.id === Sort.Int) {
            return '.v';
        }

        return '';
    }

    private application(name: string, args: string[], from: TranslationRes[]): TranslationRes {
        return translatedFrom(name + mkString(args, '[', ', ', ']'), from);
    }

    public toAlloy(term: Term): TranslationRes {

        if (term instanceof Binary && term.rhs instanceof Binary && term.rhs.op === "Combine") {
            const left = this.toAlloy(term.lhs);
            if (left.res === undefined) {
                return leftover(term, "Left-hand side operand not translated", left.leftovers);
            }
            const combine = term.rhs;
            const combineLeft = this.toAlloy(combine.lhs);
            const combineRight = this.toAlloy(combine.rhs);

            if (combineLeft.res === undefined) {
                return leftover(combine, "Left-hand side operand not translated", combineLeft.leftovers);
            }

            if (combineRight.res === undefined) {
                return leftover(combine, "Right-hand side operand not translated", combineRight.leftovers);
            }

            return translatedFrom(`${left.res}.left = ${combineLeft.res} && ${left.res}.right = ${combineRight.res}`, [combineLeft, combineRight]);
        }

        if (term instanceof Binary) {
            const left = this.toAlloy(term.lhs);
            if (left.res === undefined) {
                return leftover(term, "Left-hand side operand not translated", left.leftovers);
            }

            const right = this.toAlloy(term.rhs); if (right.res === undefined) {
                return leftover(term, "Right-hand side operand not translated", right.leftovers);
            }

            // Alloy operators only have one equal sign, but are otherwise the same as the Viper ones.
            const alloyOp = term.op.replace("==", "=");

            const leftSort = getSort(term.lhs);
            const rightSort = getSort(term.rhs);

            if (leftSort.id === Sort.Int || rightSort.id === Sort.Int) {

                const leftRes = left.res + (term.lhs instanceof Literal ? '' : TermTranslator.getFieldKey(leftSort));
                const rightRes = right.res + (term.rhs instanceof Literal ? '' : TermTranslator.getFieldKey(rightSort));

                const pred = (name: string) => {
                    return this.application(name, [leftRes, rightRes], [left, right]);
                };

                switch (term.op) {
                    case '-': return pred('minus');
                    case '+': return pred('plus');
                    case '*': return pred('mul');
                    case '/': return pred('div');
                    case '%': return pred('rem');
                    case '<': return translatedFrom(`(${leftRes} ${alloyOp} ${rightRes})`, [left, right]);
                    case '<=': return translatedFrom(`(${leftRes} ${alloyOp} ${rightRes})`, [left, right]);
                    case '>': return translatedFrom(`(${leftRes} ${alloyOp} ${rightRes})`, [left, right]);
                    case '>=': return translatedFrom(`(${leftRes} ${alloyOp} ${rightRes})`, [left, right]);
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

            // Literals are wrapped inside other signatures, we need the name of the "field" that holds the actual value
            let leftFieldKey = '';
            if (term.rhs instanceof Literal) {
                leftFieldKey = TermTranslator.getFieldKey(leftSort);
            }
            const leftRes = left.res + leftFieldKey;

            let rightFieldKey = '';
            if (term.lhs instanceof Literal) {
                rightFieldKey = TermTranslator.getFieldKey(rightSort);
            }
            const rightRes = right.res + rightFieldKey;

            if (alloyOp === 'Combine') {
                Logger.error("Was not expecting to get here, all combines should be handled from above");
                throw new DebuggerError("Was not expecting to get here, all combines should be handled from above");
            }

            // If we are not dealing with a combine, then return a "regular" binary expression
            return translatedFrom(`(${leftRes} ${alloyOp} ${rightRes})`, [left, right]);
        }

        if (term instanceof Unary) {
            const operand  = this.toAlloy(term.p); 
            if (!operand.res) {
                return leftover(term, "Operand not translated", operand.leftovers);
            }

            return translatedFrom(`${term.op}(${operand.res})`, [operand]);
        }

        // TODO: Fix this
        if (term instanceof SortWrapper) {
            return this.toAlloy(term.term);
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
            const tVars = term.vars.map(v => v.toAlloyWithType());

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

                    if (!tBody!.res) {
                        return leftover(term, "Could not translate quantified variables", tBody!.leftovers);
                    }

                    return translatedFrom(`${mult} ${tVars.join(", ")} | ${tBody.res}`, [tBody]);
                });
        }

        if (term instanceof Application) {
            const applicableSanitized = sanitize(term.applicable);

            if (applicableSanitized.endsWith('trigger')) {
                // TODO: Do we want to ignore these in the end?
                return leftover(term, "Explicitely ignoring trigger applications for now", []);
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

            const sorts: Sort[] = [];
            term.args.forEach(a => {
                const s = getSort(a);
                if (s === undefined) {
                    throw new DebuggerError(`Could not determine sort of '${a.toString()}' in ` + term.toString());
                }
                sorts.push(s);
            });
            sorts.push(term.sort);

            this.env.recordFunction(applicableSanitized, sorts);
            const callName = `${AlloyTranslator.Function}.${applicableSanitized}`;
            const callArgs = translated.map(a => a.res).join(", ");
            return translatedFrom(`${callName}[${callArgs}]`, translated)
                        .withQuantifiedVariables(tVars);
        }

        // TODO: Do we need proper lookups?
        if (term instanceof Lookup) {
            const receiver = this.toAlloy(term.receiver);
            if (!receiver.res) {
                return leftover(term, "Could not translate receiver", receiver.leftovers);
            }

            return translatedFrom(receiver.res + "." + term.field, [receiver]);
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
                } else if (term.value === AlloyTranslator.ReadPerm) {
                    return translatedFrom(AlloyTranslator.ReadPerm, []);
                } else if (term.value === AlloyTranslator.NoPerm) {
                    return translatedFrom(AlloyTranslator.NoPerm, []);
                }
                // TODO: proper fresh name?
                const freshName = this.env.getFreshName("p");
                const quantifiedVariables = [`one ${freshName}: ${AlloyTranslator.Perm}`];
                let additionalFacts: string[] = [];

                const parts = term.value.split('/');
                additionalFacts = [
                    `${freshName} in ${AlloyTranslator.ReadPerm}`,
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

        // TODO: Implement this
        if (term instanceof SetSingleton) {
            return leftover(term, "SetSingleton translation not implemented", []);
        }

        // TODO: Implement this
        if (term instanceof MultisetSingleton) {
            return leftover(term, "MultiSetSingleton translation not implemented", []);
        }

        throw new DebuggerError(`Unexpected term: ${term.toString()}`);
    }
}
