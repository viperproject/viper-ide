import { Term, Binary, Unary, SortWrapper, VariableTerm, Quantification, Application, Lookup, PredicateLookup, And, Or, Distinct, Ite, Let, Literal, SeqRanged, SeqSingleton, SeqUpdate, SetSingleton, MultisetSingleton } from "./Term";
import { TranslationEnv } from "./AlloyTranslator";
import { DebuggerError } from "../Errors";
import { Logger } from "../logger";

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
    constructor(readonly res: string | undefined, readonly leftovers: Leftover[]) {}
}

function translated(res: string, leftovers: Leftover[]) {
    return new TranslationRes(res, leftovers);
}

function leftover(leftover: Term, reason: string, other: Leftover[]) {
    return new TranslationRes(undefined, [new Leftover(leftover, reason, other)]);
}


export class TermTranslator {
    constructor(readonly env: TranslationEnv) {}

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

            const alloyOp = term.op.replace("==", "=");
            if (alloyOp === 'Combine') {
                return leftover(term, "Combines not translated", left.leftovers.concat(right.leftovers));
            }

            return translated(`(${left.res} ${alloyOp} ${right.res})`, left.leftovers.concat(right.leftovers));
        }

        if (term instanceof Unary) {
            const operand  = this.toAlloy(term.p); 
            if (!operand.res) {
                return leftover(term, "Operand not translated", operand.leftovers);
            }

            return translated(`${term.op}(${operand.res})`, operand.leftovers);
        }

        // TODO: Fix this
        if (term instanceof SortWrapper) {
            Logger.debug(term.toString());
            return this.toAlloy(term.term);
        }

        if (term instanceof VariableTerm) {
            const resolved = this.env.resolve(term.id);
            if (!resolved) {
                return leftover(term, `Could not resolve name '${term.id.toString()}'`, []);
            }

            return translated(sanitize(resolved), []);
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

                    return translated(`${mult} ${tVars.join(", ")} | ${tBody.res}`, tBody.leftovers);
                });
        }

        if (term instanceof Application) {
            const applicableSanitized = sanitize(term.applicable);
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

            // We save INV functions in a sapearate namespace
            if (term.applicable.match(/inv@\d+@\d+/)) {
                this.env.recordFunction('INV', applicableSanitized);

                return translated(`INV.${applicableSanitized}[${args.map(a => a.res).join(", ")}]`, leftovers);
            } else {
                return translated(`Fun.${applicableSanitized}(${args.map(a => a.res).join(", ")})`, leftovers);
            }
        }

        // TODO: Do we need proper lookups?
        if (term instanceof Lookup) {
            const receiver = this.toAlloy(term.receiver);
            if (!receiver.res) {
                return leftover(term, "Could not translate receiver", receiver.leftovers);
            }

            return translated(receiver.res + "." + term.field, receiver.leftovers);
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

            if (term instanceof And) {
                return translated("(" + terms.map(t => t.res).join(" && ") + ")", leftovers);
            } else {
                return translated("(" + terms.map(t => t.res).join(" || ") + ")", leftovers);
            }
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

            return translated(`(${cond.res} implies ${thenBranch.res} else ${elseBranch.res})`, leftovers);
        }

        // TODO: Implement this
        if (term instanceof Let) {
            return leftover(term, "Let translation not implemented", []);
        }

        if (term instanceof Literal) {
            if (term.sort.id === 'Ref' && term.value === "Null") {
                return translated("NULL", []);
            }

            return translated(term.value, []);
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
