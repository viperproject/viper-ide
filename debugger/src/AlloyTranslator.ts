import { AlloyModelBuilder } from "./AlloyModel";
import { State } from "./states/Statement";
import { FieldChunk, QuantifiedFieldChunk } from "./states/Heap";
import { Logger } from "./logger";
import { VariableTerm } from "./states/Term";


export class TranslationEnv {
    private refTypedVariables: Set<string>;
    public fields: Map<string, string[]>;
    private references: Map<string, string>;
    private quantifiedVariables: Set<string> | undefined;
    public functions: Map<string, Set<string>>;

    constructor(readonly state: State) {
        this.references = new Map();
        this.refTypedVariables = new Set();

        state.store.forEach(v => {
            if (v.type === 'Ref' || v.type === 'Set[Ref]') {
                this.refTypedVariables.add(v.name);
                this.references.set(v.value, `Store.${v.name}`);
            }
        });

        this.fields = new Map();
        // FIXME: right now we assume all fields are references
        state.heap.forEach(heapChunk => {
            if (heapChunk instanceof FieldChunk) {
                const field = heapChunk.field;

                // Field receivers that are not in the store, for example from (variable.next.next)
                let found = this.resolve(heapChunk.receiver.toString());
                if (found === undefined) {
                    return;
                }

                // Update references map now, it could save us some search later
                this.references.set(heapChunk.snap.toString(), found + '.' + field);

                let f = this.fields.get(field);
                if (f !== undefined) {
                    f.push(found);
                } else {
                    this.fields.set(field, [found]);
                }
            }
        });

        this.functions = new Map();
    }

    public resolve(symbValue: string): string | undefined {
        let v = this.references.get(symbValue);
        if (v !== undefined) {
            return v;
        }

        if (this.quantifiedVariables !== undefined && this.quantifiedVariables.has(symbValue)) {
            return symbValue;
        }

        let fieldRef: FieldChunk | undefined = undefined;
        for (const heapChunk of this.state.heap) {
            if (heapChunk instanceof FieldChunk && heapChunk.snap.toString() === symbValue)  {
                fieldRef = heapChunk;
            }
        }

        if (fieldRef !== undefined) {
            let rec = this.resolve(fieldRef.receiver.toString());
            if (rec !== undefined) {
                const val = rec + '.' + fieldRef.field;
                this.references.set(symbValue, val);
                return val;
            }
        }

        // Only log non-temp variables
        if (!symbValue.startsWith("$t")) {
            Logger.warn(`Name resolution undefined for '${symbValue}'`);
        }
        return undefined;
    }

    withQuantifiedVariables(vars: Set<string>, f: () => void) {
        this.quantifiedVariables = vars;
        f();
        this.quantifiedVariables = undefined;
    }

    // TODO: We need to record the type of functions
    public recordFunction(namespace: string, name: string) {
        if (!this.functions.has(namespace)) {
            this.functions.set(namespace, new Set([name]));
        } else {
            this.functions.get(namespace)!.add(name);
        }
    }
}

export class AlloyTranslator {

    private env: TranslationEnv;

    constructor(readonly state: State) {
        this.env = new TranslationEnv(state);
    }

    public translate(): string {
        const builder = new AlloyModelBuilder();

        let allVariables: string[] = [];
        let storeDecls: string[] = [];
        this.state.store.forEach(v => {
            // TODO: Do they ever appear in the path conditions?
            // Skip additional variables introduced by Silicon
            if (v.name.match(/v@\d+@\d+/)) {
                return;
            }

            if (v.type === 'Ref') {
                storeDecls.push(`${v.name}: one Object`);
            } else if (v.type === 'Set[Ref]') {
                storeDecls.push(`${v.name}: set Object`);
            } else {
                Logger.error(`Store variables of type '${v.type} are not implemented yet.`);
                return;
            }
            allVariables.push(v.name);
        });
        storeDecls.push("variables': set Object");

        // TODO: Check if there are no variables?
        const variablesConstraint = "variables' = " + allVariables.join(" + ");

        builder.sig('one', 'Store', storeDecls, [variablesConstraint]);
        builder.blank();

        let allFields: Set<string> = new Set();
        const heapDecls: Set<string> = new Set(this.state.heap.map(hc => {
            if (hc instanceof FieldChunk) {
                allFields.add(hc.field);
                return `${hc.field}: lone Object`;
            } else if (hc instanceof QuantifiedFieldChunk) {
                allFields.add(hc.field);
                return `${hc.field}: lone Object`;
            } else {
                Logger.error(`Heap chunk translation not implemented yet: '${hc}'`);
                return hc.toString();
            }
        }));
        heapDecls.add("successors': set Object");

        // Constraint on successors of objects
        const fieldsConstraint = "successors' = " + ((allFields.size < 1) ? 'none' : [...allFields].join(" + "));

        builder.sig('', 'Object', [...heapDecls], [fieldsConstraint]);
        builder.blank();

        // The null reference
        builder.sig('lone', 'NULL in Object', [], ["successors' = none"]);
        builder.blank();

        builder.sig('one', "PermF", [...allFields].map(f => `${f}: (Object -> one Perm)`), []);
        builder.sig('abstract', "Perm", [], []);
        builder.sig('one', "W extends Perm", [], []);
        builder.sig('one', "R extends Perm", [], []);
        builder.sig('one', "Z extends Perm", [], []);
        builder.blank();

        if (allFields.size > 0) {
            builder.comment("Constraints on field permission/existence");
        }
        allFields.forEach(field => {
            builder.fact(`all o: Object | one o.${field} <=> PermF.${field}[o] in (W + R)`);
        });
        builder.blank();

        this.state.heap.forEach(chunk => {
            if (chunk instanceof FieldChunk) {
                const receiver = this.env.resolve((chunk.receiver as VariableTerm).id);
                builder.fact(`PermF.${chunk.field}[${receiver}] = ${chunk.perm.toAlloy(this.env)}`);
            } else if (chunk instanceof QuantifiedFieldChunk) {
                this.env.withQuantifiedVariables(new Set('r'), () => {
                    builder.fact(`all r: Object | PermF.${chunk.field}[r] = ${chunk.perm.toAlloy(this.env)}`);
                });
            }
        });
        builder.blank();

        this.state.pathConditions.forEach(pc => {
            let body = pc.toAlloy(this.env);
            if (body !== undefined) {
                builder.comment(JSON.stringify(pc));
                builder.fact(body);
            } else {
                builder.comment("!!! Non-translated fact");
                builder.comment(JSON.stringify(pc));
            }
            builder.blank();
        });

        for (let [namespace, names] of this.env.functions) {
            builder.sig('one', namespace, [...names].map(n => `${n}: (Object one -> one Object)`), []);
        }
        builder.blank();

        builder.comment("No object unreachable from the Store");
        builder.fact("Object = Store.variables'.*successors'");
        builder.blank();

        return builder.build();
    }
}