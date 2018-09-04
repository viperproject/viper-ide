import { State } from "./Record";
import { FieldChunk, QuantifiedFieldChunk, PredicateChunk, QuantifiedPredicateChunk } from "./Heap";
import { AlloyTranslator } from './AlloyTranslator';
import { VariableTerm } from "./Term";
import { Sort } from './Sort';
import { DebuggerError } from "../Errors";
import { sanitize } from "./TermTranslator";
import { StoreVariable } from "./StoreVariable";
import { Logger } from "../logger";
import { Signature } from "./AlloyModel";
import { mkString } from "../util";


export class TranslationEnv {

    public introduceMissingTempVars: boolean = true;
    public failOnMissingFunctions: boolean = false;

    public fields: Map<string, Sort>;
    public predicates: Map<string, PredicateChunk[]>;
    public storeVariables: Map<string, StoreVariable>;

    private freshVariables: Map<string, number>;
    public variablesToDeclare: Map<string, Sort>;
    private tempVariables: Set<string>;
    private additionalVariables: Set<string>;
    public recordedInstances: Map<string, string[]>;
    public neededMacros: Set<string>;

    public quantifiedSignatureCount: number;
    public recordedSignatures: Map<string, Signature>;

    public sortWrappers: Map<string, { from: Sort, to: Sort }>;
    public functions: Map<string, [Sort[], Sort]>;
    public permFunctions: Map<string, Sort>;
    public predPermFunctions: Map<string, Sort[]>;
    public lookupFunctions: [Sort, string][];
    public predLookupFunctions: [string, Sort[]][];

    public recordInterestingFunctions: boolean;
    public interestingFunctions: Set<string>;

    public userSorts: Set<string>;
    public sorts: Map<string, [Sort, string | undefined, string | undefined]>;

    public refReachingSignatures: Set<string>;

    // HACK: Kinda dirty, there surely is a better way
    public quantifierVariables: VariableTerm[] | undefined;
    public addToQuantifier: string | undefined;

    constructor(readonly state: State) {
        
        this.fields = new Map();
        this.predicates = new Map();
        this.storeVariables = new Map();

        this.freshVariables = new Map();
        this.variablesToDeclare = new Map();
        this.tempVariables = new Set();
        this.additionalVariables = new Set();
        this.recordedInstances = new Map();
        this.recordedSignatures = new Map();
        this.neededMacros = new Set();

        this.quantifiedSignatureCount = 0;

        this.sortWrappers = new Map();
        this.functions = new Map();
        this.permFunctions = new Map();
        this.predPermFunctions = new Map();
        this.lookupFunctions = [];
        this.predLookupFunctions = [];

        this.recordInterestingFunctions = true;
        this.interestingFunctions = new Set();

        this.userSorts = new Set();
        this.sorts = new Map();

        this.refReachingSignatures = new Set();

        state.store.forEach(v => {
            // We save the names of symbolic value for store variables
            if (v.value instanceof VariableTerm) {
                const sanitized = sanitize(v.value.id);
                this.variablesToDeclare.set(sanitized, v.sort);
                this.tempVariables.add(sanitized);
            }
            const name = v.name + "'";
            this.storeVariables.set(name, v);

            this.recordInstance(v.sort, 'Store.' + name);
        });

        state.heap.forEach(hc => {
            if (hc instanceof FieldChunk) {
                this.fields.set(hc.field, hc.sort);
            } else if (hc instanceof QuantifiedFieldChunk) {
                if (hc.sort.is('FVF') && hc.sort.elementsSort !== undefined) {
                    this.fields.set(hc.field, hc.sort.elementsSort);
                } else {
                    Logger.error('Unexpected quantified field sort: ' + hc.sort);
                }
            }

            if (hc instanceof PredicateChunk) {
                // We store all predicates chunk in a map, based on their id
                const ps = this.predicates.get(hc.id);
                if (ps) {
                    ps.push(hc);
                } else {
                    this.predicates.set(hc.id, [hc]);
                }
            } else if (hc instanceof QuantifiedPredicateChunk) {
                Logger.error("Something?");
            }
        });
    }

    public recordInstance(sort: Sort, name: string) {
        // Sets, Seqs and Multisets count towards the totoal of the generic signature
        // User sorts count towards their specific signature
        // Everything else counts towards the built-in signature
        let sigName: string;
        if (sort.is('Set')) {
            sigName = sort.id;
            if (sort.elementsSort) {
                this.recordInstance(sort.elementsSort, name + '.set_elems');

                if (sort.elementsSort.is(Sort.Ref)) {
                    this.refReachingSignatures.add(name + '.set_elems');
                }
            }
        } else if (sort.is('Multiset')) {
            sigName = sort.id;
            if (sort.elementsSort) {
                this.recordInstance(sort.elementsSort, name + '.(ms_elems.Int)');

                if (sort.elementsSort.is(Sort.Ref)) {
                    this.refReachingSignatures.add(name + '.(ms_elems.Int)');
                }
            }
        } else if (sort.is('Seq')) {
            sigName = sort.id;
            if (sort.elementsSort) {
                this.recordInstance(sort.elementsSort, name + '.seq_rel[Int]');

                if (sort.elementsSort.is(Sort.Ref)) {
                    this.refReachingSignatures.add(name + '.seq_rel[Int]');
                }
            }
        } else {
            sigName = this.translate(sort);
        }

        const recorded = this.recordedInstances.get(sigName);
        if (recorded !== undefined) {
            recorded.push(name);
        } else {
            this.recordedInstances.set(sigName, [name]);
        }
    }

    public recordNeededMacro(name: string) {
        this.neededMacros.add(name);
    }

    private getNormalFreshVariable(base: string, sort: Sort) {
        const count = this.freshVariables.get(base);
        let name: string;
        if (count !== undefined) {
            name = `${base}_${count + 1}'`;
            this.freshVariables.set(base, count + 1);
            this.variablesToDeclare.set(name, sort);
        } else {
            name = `${base}_0'`;
            this.freshVariables.set(base, 0);
            this.variablesToDeclare.set(name, sort);
        }
        this.recordInstance(sort, name);

        return name;
    }

    private getQuantifiedFreshVariable(base: string, sort: Sort) {
        const quantifierNumber = this.quantifiedSignatureCount;
        const sigName = 'fresh_quantifier_vars_' + quantifierNumber;
        let sig = this.recordedSignatures.get(sigName);
        if (sig === undefined) {
            sig = new Signature(sigName).withMultiplicity('one');
            this.recordedSignatures.set(sigName, sig);
        }

        const count = sig.numberOfMembers();
        let varName: string;
        if (count > 0) {
            varName = `${base}_${count + 1}'`;
        } else {
            varName = `${base}_0'`;
        }

        const parts = this.quantifierVariables!.map(v => this.translate(v.sort));
        parts.push("lone " + this.translate(sort));

        sig.withMember(varName + ": " + parts.join(' -> '));

        const varNames = this.quantifierVariables!.map(v => sanitize(v.id));
        return sigName + '.' + varName + mkString(varNames, '[', ', ', ']');
    }

    public getFreshVariable(base: string, sort: Sort) {
        if (this.quantifierVariables !== undefined) {
            return this.getQuantifiedFreshVariable(base, sort);
        } else { 
            return this.getNormalFreshVariable(base, sort);
        }
    }

    public resolve(variable: VariableTerm): string | undefined {
        if (this.additionalVariables.has(variable.id)) {
            return variable.id;
        }

        // if (this.heapSnapshots.has(variable.id)) {
        //     return AlloyTranslator.Heap + '.' + sanitize(variable.id);
        // }

        if (this.tempVariables.has(sanitize(variable.id))) {
            return variable.id;
        }

        if (variable.id.startsWith("$t") && this.introduceMissingTempVars) {
            return this.recordTempVariable(variable);
        }

        return undefined;
    }

    public translate(sort: Sort): string {
        if (sort.is(Sort.Ref)) {
            return AlloyTranslator.Ref;
        }
        if (sort.is('Set') && sort.elementsSort !== undefined) {
            const elementSort = this.translate(sort.elementsSort);
            const name = "Set_" + elementSort;
            const constraint = 'set_elems in ' + elementSort;
            this.recordSort(name, sort, "Set", constraint);
            return name;
        }
        if (sort.is('Seq') && sort.elementsSort !== undefined) {
            const elementSort = this.translate(sort.elementsSort);
            const name = "Seq_" + elementSort;
            const constraint = 'univ.seq_rel in ' + elementSort;
            this.recordSort(name, sort, "Seq", constraint);
            return name;
        }
        if (sort.is('Multiset') && sort.elementsSort !== undefined) {
            const elementSort = this.translate(sort.elementsSort);
            const name = "Multiset_" + elementSort;
            const constraint = 'ms_elems.univ in ' + elementSort;
            this.recordSort(name, sort, "Multiset", constraint);
            return name;
        }

        if (sort.is(Sort.Int)) {
            return AlloyTranslator.Int;
        }
        if (sort.is(Sort.Snap)) {
            return AlloyTranslator.Snap;
        }
        if (sort.is(Sort.Bool)) {
            return AlloyTranslator.Bool;
        }
        if (sort.is(Sort.Perm)) {
            return AlloyTranslator.Perm;
        }

        if (sort.id === "UserSort" && sort.elementsSort) {
            const userSort = `User_${sort.elementsSort.id}'`;
            this.recordUserSort(userSort);
            return userSort;
        }

        if (sort.id === "FVF" && sort.elementsSort) {
            const name = 'FVF_' + this.translate(sort.elementsSort);
            this.recordSort(name, sort);
            return name;
        }

        if (sort.id === 'PSF' && sort.elementsSort) {
            const name = 'PSF_' + this.translate(sort.elementsSort);
            this.recordSort(name, sort);
            return name;
        }

        throw new DebuggerError(`Unexpected sort '${sort}'`);
    }

    evaluateWithAdditionalVariables<T>(vars: string[], f: () => T) {
        vars.forEach(v => this.additionalVariables.add(v));
        const res = f();
        vars.forEach(v => this.additionalVariables.delete(v));
        return res;
    }

    public recordFunction(name: string, argSorts: Sort[], retSort: Sort) {
        if (!this.functions.has(name)) {
            this.functions.set(name, [argSorts, retSort]);

            if (this.recordInterestingFunctions) {
                this.interestingFunctions.add(name);
            }
        }
    }

    public recordPermFunction(name: string, snapSort: Sort) {
        if (!this.permFunctions.has(name)) {
            this.permFunctions.set(name, snapSort);
        }
    }

    public recordPredPermFunction(name: string, sorts: Sort[]) {
        if (!this.predPermFunctions.has(name)) {
            this.predPermFunctions.set(name, sorts);
        }
    }

    public recordSort(name: string, sort: Sort, base?: string, constraint?: string) {
        this.sorts.set(name, [sort, base, constraint]);
    }

    public recordUserSort(userSort: string) {
        this.userSorts.add(userSort);
    }

    public recordTempVariable(variable: VariableTerm): string {
        const sanitized = sanitize(variable.id);
        if (!this.tempVariables.has(sanitized)) {
            this.variablesToDeclare.set(sanitized, variable.sort);
            this.tempVariables.add(sanitized);
            this.recordInstance(variable.sort, sanitized);
        }
        return sanitized;
    }
}