import { State } from "./Record";
import { FieldChunk, QuantifiedFieldChunk, PredicateChunk, MagicWandChunk } from "./Heap";
import { AlloyTranslator } from './AlloyTranslator';
import { VariableTerm  } from "./Term";
import { Sort } from './Sort';
import { DebuggerError } from "../Errors";
import { sanitize } from "./TermTranslator";
import { StoreVariable } from "./StoreVariable";
import { Logger } from "../logger";


export class TranslationEnv {

    public fields: Map<string, Sort>;
    public predicates: Map<string, PredicateChunk[]>;
    private freshNames: Map<string, number>;
    private freshVariables: Map<string, number>;
    public freshVariablesToDeclare: [string, Sort][];
    public sortWrappers: Map<string, Sort>;

    private additionalVariables: Set<string>;
    public storeVariables: Map<string, StoreVariable>;
    public heapSnapshots: Set<string>;
    public tempVariables: Map<string, Sort>;
    public functions: Map<string, Sort[]>;
    public actualFucntions: Map<string, Sort[]>;
    public lookupFunctions: [Sort, string][];
    public totalCombines: number;
    public introduceMissingTempVars: boolean = true;
    public userSorts: Set<string>;
    public sorts: Set<string>;

    constructor(readonly state: State) {
        
        this.fields = new Map();
        this.predicates = new Map();
        this.freshNames = new Map();
        this.freshVariables = new Map();
        this.freshVariablesToDeclare = [];
        this.sortWrappers = new Map();

        this.storeVariables = new Map();
        this.heapSnapshots = new Set();
        this.additionalVariables = new Set();
        this.tempVariables = new Map();
        this.userSorts = new Set();
        this.sorts = new Set();

        state.store.forEach(v => {
            // We save the names of symbolic value for store variables
            if (v.value instanceof VariableTerm) {
                this.tempVariables.set(sanitize(v.value.id), v.sort);
            }
            this.storeVariables.set(v.name, v);
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

            if (hc instanceof FieldChunk || hc instanceof PredicateChunk || hc instanceof MagicWandChunk) {
                if (hc.snap instanceof VariableTerm) {
                    this.heapSnapshots.add(hc.snap.id);
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
            }
        });

        this.functions = new Map();
        this.actualFucntions = new Map();
        this.lookupFunctions = [];
        this.totalCombines = 0;
    }

    public getFreshVariable(base: string, sort: Sort) {
        const count = this.freshVariables.get(base);
        if (count !== undefined) {
            const name = `${base}_${count + 1}'`;
            this.freshVariables.set(base, count + 1);
            this.freshVariablesToDeclare.push([name, sort]);
            return name;
        } else {
            const name = `${base}_0'`;
            this.freshVariables.set(base, 0);
            this.freshVariablesToDeclare.push([name, sort]);
            return name;
        }
    }

    public getFreshName(base: string) {
        const count = this.freshNames.get(base);
        if (count !== undefined) {
            this.freshNames.set(base, count + 1);
            return `${base}_${count + 1}'`;
        } else {
            this.freshNames.set(base, 0);
            return `${base}_0'`;
        }
    }

    public clearFreshNames() {
        this.freshNames.clear();
    }

    public resolve(variable: VariableTerm): string | undefined {
        if (this.additionalVariables.has(variable.id)) {
            return variable.id;
        }

        if (this.heapSnapshots.has(variable.id)) {
            return AlloyTranslator.Heap + '.' + sanitize(variable.id);
        }

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
            const name = "Set_" + this.translate(sort.elementsSort);
            this.recordSort(name, "Set");
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

        // TODO: sanititze names + it should be someone else's business to record the user sort
        if (sort.id === "UserSort" && sort.elementsSort) {
            const userSort = sort.elementsSort.id;
            this.recordUserSort(userSort);
            return userSort;
        }

        if (sort.id === "FVF" && sort.elementsSort) {
            const name = 'FVF_' + this.translate(sort.elementsSort);
            this.recordSort(name);
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

    public recordFunction(name: string, sorts: Sort[]) {
        if (!this.functions.has(name)) {
            this.functions.set(name, sorts);
        }
    }

    public recordSort(sort: string, base?: string) {
        if (base !== undefined) {
            this.sorts.add(sort + " extends " + base);
        } else {
            this.sorts.add(sort);
        }
    }

    public recordUserSort(userSort: string) {
        this.userSorts.add(userSort);
    }

    public recordTempVariable(variable: VariableTerm): string {
        const sanitized = sanitize(variable.id);
        this.tempVariables.set(sanitized, variable.sort);
        return sanitized;
    }
}