import { Term, Binary, Unary, SortWrapper, VariableTerm, Quantification, Application, Lookup, PredicateLookup, And, Or, Distinct, Ite, Let, Literal, SeqRanged, SeqSingleton, SeqUpdate, SetSingleton, MultisetSingleton } from "./Term";
import { TranslationEnv } from "./AlloyTranslator";
import { DebuggerError } from "../Errors";
import { getSort, Sort } from "./Sort";

export function sanitize(name: string) {
    return name.replace(/@/g, "_");
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

    public getFreshName(original: string) {
        return original + "'";
    }

    // TODO: implement this properly
    public getFieldKey(sort: Sort) {
        if (sort.id === 'Int') {
            return '.v';
        }

        return '';
    }

    public toAlloy(term: Term): TranslationRes {

        if (term instanceof Binary) {
            const left = this.toAlloy(term.lhs);
            const right = this.toAlloy(term.rhs);

            if (!left.res) {
                return leftover(term, "Left-hand side operand not translated", left.leftovers);
            }

            if (!right.res) {
                return leftover(term, "Right-hand side operand not translated", right.leftovers);
            }

            // Alloy operators only have one equal sign, but are otherwise the same as the Viper ones.
            const alloyOp = term.op.replace("==", "=");

            const leftFieldKey = (term.rhs instanceof Literal) ? this.getFieldKey(term.rhs.sort) : '';
            const leftRes = left.res + leftFieldKey;

            const rightFieldKey = (term.lhs instanceof Literal) ? this.getFieldKey(term.lhs.sort) : '';
            const rightRes = right.res + rightFieldKey;


            // If we are not dealing with a combine, then return a "regular" binary expression
            if (alloyOp !== 'Combine') {
                return translatedFrom(`(${leftRes} ${alloyOp} ${rightRes})`, [left, right]);
            }

            // We need a fresh name to refer to the combine instance and additional facts to constrain its values
            const freshName = this.getFreshName("c");
            const quantifiedVariables = [`one ${freshName}: Combine`];
            const additionalFacts: string[] = [
                `${freshName}.left = ${leftRes}`,
                `${freshName}.right = ${rightRes}`,
            ];
            this.env.recordCombine();

            // In the end, the translated combine is simply the fresh name
            return translatedFrom(freshName, [left, right])
                    .withQuantifiedVariables(quantifiedVariables)
                    .withAdditionalFacts(additionalFacts);
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

            // We save INV functions in a sapearate "namespace"
            if (term.applicable.match(/inv@\d+@\d+/)) {
                this.env.recordInverseFunction(applicableSanitized, sorts);
                return translatedFrom(`Inv.${applicableSanitized}[${args.map(a => a.res).join(", ")}]`, args);
            } else {
                this.env.recordFunction(applicableSanitized, sorts);
                return translatedFrom(`Fun.${applicableSanitized}[${args.map(a => a.res).join(", ")}]`, args);
            }
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
            if (term.sort.id === 'Ref' && term.value === "Null") {
                return translatedFrom("NULL", []);
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
