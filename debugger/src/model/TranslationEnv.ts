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
    public storeVariables: Map<string, StoreVariable>;
    public heapSnapshots: Set<string>;

    public introduceMissingTempVars: boolean = true;
    private freshVariables: Map<string, number>;
    public variablesToDeclare: Map<string, Sort>;
    private tempVariables: Set<string>;
    private additionalVariables: Set<string>;
    public recordedInstances: Map<string, string[]>;

    public sortWrappers: Map<string, Sort>;
    public functions: Map<string, Sort[]>;
    public lookupFunctions: [Sort, string][];
    public totalCombines: number;

    public userSorts: Set<string>;
    public sorts: Set<string>;

    constructor(readonly state: State) {
        
        this.fields = new Map();
        this.predicates = new Map();
        this.storeVariables = new Map();
        this.heapSnapshots = new Set();

        this.freshVariables = new Map();
        this.variablesToDeclare = new Map();
        this.tempVariables = new Set();
        this.additionalVariables = new Set();
        this.recordedInstances = new Map();

        this.sortWrappers = new Map();
        this.functions = new Map();
        this.lookupFunctions = [];
        this.totalCombines = 0;

        this.userSorts = new Set();
        this.sorts = new Set();

        state.store.forEach(v => {
            // We save the names of symbolic value for store variables
            if (v.value instanceof VariableTerm) {
                const sanitized = sanitize(v.value.id)
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
    }
    
    public recordInstance(sort: Sort, name: string) {
        const sortName = this.translate(sort);
        const recorded = this.recordedInstances.get(sortName);
        if (recorded !== undefined) {
            recorded.push(name);
        } else {
            this.recordedInstances.set(sortName, [name]);
        }
    }

    public getFreshVariable(base: string, sort: Sort) {
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
        this.variablesToDeclare.set(sanitized, variable.sort);
        this.tempVariables.add(sanitized);
        return sanitized;
    }
}