import { Statement } from './states/Statement';
import { Variable } from './states/Variable';
import { NullityCondition, EqualityCondition } from './states/Condition';
import { HeapChunk, FieldReference } from './states/Heap';
import { Debugger } from './Debugger';
import { DebuggerError } from './Errors';
import { resolve } from 'dns';

type VariableSignature = {
    name: string,
    facts: string[]
};

export class AlloyModel {

    private ref_vars: Set<string>;
    private fields: Map<string, string[]>;
    private facts: string[];
    private referencesMap: Map<string, string>;

    constructor (state: Statement) {
        let references = state.store.filter(v => v.type === 'Ref');
        this.ref_vars = new Set(references.map(r => r.name));

        this.referencesMap = new Map();
        references.forEach(r => this.referencesMap.set(r.value, `var_${r.name}.value`));

        let resolve: (symbValue: string) => string | undefined = (symbValue: string) => {
            let v = this.referencesMap.get(symbValue);
            if (v !== undefined) {
                return v;
            }

            let fieldRef: FieldReference | undefined = undefined;
            for (const heapChunk of state.heap) {
                if (heapChunk instanceof FieldReference && heapChunk.value.toString() === symbValue)  {
                    fieldRef = heapChunk;
                }
            }

            if (fieldRef !== undefined) {
                let rec = resolve(fieldRef.receiver);
                if (rec !== undefined) {
                    const val = rec + '.' + fieldRef.field;
                    this.referencesMap.set(symbValue, val);
                    return val;
                }
            }

            return undefined;
        }

        this.fields = new Map();
        // FIXME: right now we assume all fields are references
        state.heap.forEach(heapChunk => {
            if (heapChunk instanceof FieldReference) {
                const field = heapChunk.field;
                let symbolicReceiver = heapChunk.receiver;

                // Field receivers that are not in the store, for example from (variable.next.next)
                let found = resolve(heapChunk.receiver);
                if (found === undefined) {
                    return;
                }

                // Update references map now, it could save us some search later
                this.referencesMap.set(heapChunk.value.toString(), found + '.' + field);

                if (this.fields.has(field)) {
                    this.fields.get(field)!.push(found);
                } else {
                    this.fields.set(field, [found]);
                }
            }
        });

        // TODO: This resolution could become rather slow if we have many path conditions?
        this.facts = [];
        state.pathConditions.forEach(pc => {
            if (pc instanceof NullityCondition) {
                let variable = this.referencesMap.get(pc.variable);
                if (variable !== undefined) {
                    this.facts.push(pc.isPositive ? `no ${variable}` : `one ${variable}`);
                }
            }

            else if (pc instanceof EqualityCondition) {
                let lhsVar = this.referencesMap.get(pc.lhs);
                let rhsVar = this.referencesMap.get(pc.rhs);

                if (lhsVar !== undefined && rhsVar !== undefined) {
                    this.facts.push(pc.isPositive ? `${lhsVar} = ${rhsVar}` : `${lhsVar} != ${rhsVar}`);
                }
            }
        });
    }

    build() {
        let object_bound = this.ref_vars.size + 3;

        let stuff = [
            "abstract sig Var { value: lone Object }",
            "sig Object {"
        ];
        let successors: string[] = [];

        for (const field of this.fields.keys()) {
            stuff.push(`  ${field}: lone Object,`);
            successors.push(field);
        }

        stuff.push('  successors: set Object');
        stuff.push('} {');
        if (successors.length > 0) {
            stuff.push('  successors = ' + successors.join(' + '));
        } else {
            stuff.push('  #successors = 0');
        }
        stuff.push('}');
        stuff = stuff.concat([
            "",
            "fact NoObjectUnreachableFromStore { Object = Var.value.*successors }",
            ""
        ]);

        for (const [name, facts] of this.ref_vars.entries()) {
            stuff.push(`one sig var_${name} extends Var {}`);
        }
        stuff.push("");

        for (const [field, receivers] of this.fields.entries()) {
            stuff.push(`fact { all obj: Object - (${receivers.join(' + ')}) | no obj.${field} }`);

            if (receivers.length > 1) {
                stuff.push(`fact { disjoint[${receivers.join(', ')}] }`);
            }

            stuff.push("");
        }

        this.facts.forEach(fact => stuff.push(`fact { ${fact} }`));
        stuff.push("");

        let pred = [
            "pred example {}",
            `run example for ${object_bound} Object`
        ];

        let model = stuff.concat(pred);
        return model.join('\n');
    }
}