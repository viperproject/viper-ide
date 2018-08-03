import { State } from "./Record";
import { FieldChunk, QuantifiedFieldChunk, PredicateChunk, MagicWandChunk } from "./Heap";
import { AlloyTranslator } from './AlloyTranslator';
import { VariableTerm  } from "./Term";
import { Sort } from './Sort';
import { DebuggerError } from "../Errors";
import { sanitize } from "./TermTranslator";
import { StoreVariable } from "./StoreVariable";



export class TranslationEnv {

    public fields: Map<string, FieldChunk | QuantifiedFieldChunk>;
    public predicates: Map<string, PredicateChunk[]>;
    private freshNames: Map<string, number>;
    private freshVariables: Map<string, number>;

    private quantifiedVariables: Set<string>;
    public storeVariables: Map<string, StoreVariable>;
    public heapSnapshots: Set<string>;
    public tempVariables: Map<string, Sort>;
    public functions: Map<string, Sort[]>;
    public totalCombines: number;
    public introduceMissingTempVars: boolean = true;
    public userSorts: Set<string>;

    constructor(readonly state: State) {
        
        this.fields = new Map();
        this.predicates = new Map();
        this.freshNames = new Map();
        this.freshVariables = new Map();

        this.storeVariables = new Map();
        this.heapSnapshots = new Set();
        this.quantifiedVariables = new Set();
        this.tempVariables = new Map();
        this.userSorts = new Set;

        state.store.forEach(v => {
            // We save the names of symbolic value for store variables
            if (v.value instanceof VariableTerm) {
                this.tempVariables.set(sanitize(v.value.id), v.sort);
            }
            this.storeVariables.set(v.name, v);
        });

        state.heap.forEach(hc => {
            if (hc instanceof FieldChunk) {
                this.fields.set(hc.field, hc);
            } else if (hc instanceof QuantifiedFieldChunk) {
                this.fields.set(hc.field, hc);
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
        this.totalCombines = 0;
    }

    public getFreshVariable(base: string) {
        const count = this.freshVariables.get(base);
        if (count !== undefined) {
            this.freshVariables.set(base, count + 1);
            return `${base}_${count + 1}'`;
        } else {
            this.freshVariables.set(base, 0);
            return `${base}_0'`;
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
        if (this.quantifiedVariables.has(variable.id)) {
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

    public declarationSignature(sort: Sort) {
        // TODO: Complete this
        if (sort.id === Sort.Int ||
                sort.id === Sort.Ref ||
                sort.id === Sort.Bool ||
                sort.id === Sort.Snap ||
                sort.id === Sort.UserSort) {
            return 'one ' + this.translate(sort);
        }
        if (sort.id === 'Set') {
            return 'set ' + this.translate(sort);
        }

        throw new DebuggerError(`Unexpected sort '${sort}'`);
    }

    public translate(sort: Sort): string {
        if (sort.isRefLike()) {
            return AlloyTranslator.Ref;
        }
        if (sort.id === Sort.Int) {
            return AlloyTranslator.Int;
        }
        if (sort.id === Sort.Snap) {
            return AlloyTranslator.Snap;
        }
        if (sort.id === Sort.Bool) {
            return AlloyTranslator.Bool;
        }
        if (sort.id === Sort.Perm) {
            return AlloyTranslator.Perm;
        }

        // TODO: sanititze names
        if (sort.id === "UserSort" && sort.elementsSort) {
            const userSort = sort.elementsSort.id;
            this.recordUserSort(userSort);
            return userSort;
        }

        if (sort.id === "FVF" && sort.elementsSort) {
            return 'FVF_' + this.translate(sort.elementsSort);
        }

        throw new DebuggerError(`Unexpected sort '${sort}'`);
    }

    evaluateWithQuantifiedVariables<T>(vars: string[], f: () => T) {
        vars.forEach(v => this.quantifiedVariables.add(v));
        const res = f();
        vars.forEach(v => this.quantifiedVariables.delete(v));
        return res;
    }

    public recordFunction(name: string, sorts: Sort[]) {
        if (!this.functions.has(name)) {
            this.functions.set(name, sorts);
        }
    }

    public recordCombine(name: string) {
        // HACK: fix this?
        this.tempVariables.set(name, new Sort(Sort.Snap));
        this.totalCombines += 1;
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