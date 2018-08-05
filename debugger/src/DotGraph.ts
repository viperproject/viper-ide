import { Record } from './model/Record';
import { AlloyInstance } from './external';
import { AlloyTranslator } from './model/AlloyTranslator';
import { TranslationEnv } from './model/TranslationEnv';
import { sanitize } from './model/TermTranslator';
import { VariableTerm, Literal, Lookup } from './model/Term';
import { Logger } from './logger';


export interface DotElem {
    toString(): string;
}

class Label {
    public parts: string[];
    constructor(readonly label?: string) {
        this.parts = [];
        if (label) {
            this.parts.push(label);
        }
    }

    public toString() {
        if (this.parts.length > 1) {
            // const rows = this.parts.map(p => `<tr>${p}</tr>`).join('');
            // return `< <table border="0" cellborder="1" cellspacing="0">${rows}</table> >`;
            return this.parts.join(' | ');
        }
        return this.parts[0];
    }
}

class Node implements DotElem {
    private attributes: string[];
    constructor(readonly name: string, readonly label: Label) {
        this.attributes = [];
    }

    public attr(key: string, value: string) {
        this.attributes.push(key + '=' + value);
    }

    public toString() {
        const attrs = this.attributes.concat([`label="${this.label}"`]);
        return `${this.name} [${attrs.join(', ')}]`;
    }
}

export class DotGraph {
    private graphAttributes: string[];
    private nodeAttributes: string[];
    private edgeAttributes: string[];
    private elems: DotElem[];

    constructor(readonly name: string, readonly subgraph: boolean = false) {
        this.graphAttributes = [];
        this.nodeAttributes = [];
        this.edgeAttributes = [];
        this.elems = [];
    }

    attr(key: string, value: string) {
        this.graphAttributes.push(`${key}=${value}`);
    }

    nodeAttr(key: string, value: string) {
        this.nodeAttributes.push(`${key}=${value}`);
    }

    edgeAttr(key: string, value: string) {
        this.edgeAttributes.push(`${key}=${value}`);
    }

    add(elem: DotElem) {
        this.elems.push(elem);
    }

    toString(): string {
        return `${this.subgraph ? 'subgraph' : 'digraph'} ${this.name} {\n` +
            'compound = true;\n' +
            `graph [${this.graphAttributes.join(', ')}];\n` +
            `node [${this.nodeAttributes.join(', ')}];\n` +
            `edge [${this.edgeAttributes.join(', ')}];\n` +
            this.elems.map(e => e.toString()).join(';\n') +
            '}';
    }

    static from(state: Record, alloyInstance: AlloyInstance, env: TranslationEnv) {
        let graph = new DotGraph('G');
        graph.attr('bgcolor', 'none');
        graph.attr('rankdir', 'LR');
        graph.attr('color', '"#ffffff"');
        graph.attr('fontcolor', '"#ffffff"');
        graph.attr('fontname', '"Arial, Helvetica"');
        // graph.attr('newrank', 'true');
        graph.nodeAttr('shape', 'record');
        graph.nodeAttr('fontname', '"Arial, Helvetica"');
        graph.nodeAttr('fontsize', '11');
        graph.edgeAttr('color', '"#ffffff"');
        graph.edgeAttr('fontcolor', '"#ffffff"');
        graph.edgeAttr('fontname', '"Arial, Helvetica"');
        // graph.edgeAttr('fontsize', '11');

        let storeGraph = new DotGraph('clusterStore', true);
        storeGraph.attr('label', '< <u>Store</u> >');
        storeGraph.attr('labeljust', 'l');
        storeGraph.attr('style', 'dashed');
        storeGraph.attr('nodesep', '0.1');
        storeGraph.nodeAttr('color', '"#ffffff"');
        storeGraph.nodeAttr('fontcolor', '"#ffffff"');
        storeGraph.nodeAttr('shape', 'none');
        storeGraph.edgeAttr('color', '"#ffffff"');
        storeGraph.edgeAttr('fontcolor', '"#ffffff"');

        if (state.prestate) {
            state.prestate.store.forEach(v => {
                if (v.value instanceof VariableTerm) {
                    storeGraph.add(new Node(sanitize(v.value.id), new Label(`${v.name}: ${v.sort}\\l`)));
                } else if (v.value instanceof Literal) {
                    const label = new Label(`${v.name}: ${v.sort} == ${v.value.toString}\\l`);
                    storeGraph.add(new Node(sanitize(v.name), label));
                } else if (v.value instanceof Lookup) {
                    storeGraph.add(new Node("lookup" + sanitize(v.value.field), new Label(`${v.name}: ${v.sort} (lookup)\\l`)));
                } else {
                    Logger.error(`Unexpected value type in store: ${v.value}`);
                }
            });
        }

        const objType = `{this/${AlloyTranslator.Ref}}`;
        const nullType = `{this/${AlloyTranslator.Null}}`;
        let heapNodes: Map<string, Node> = new Map();
        alloyInstance.atoms.forEach(atom => {
            const name = sanitize(atom.name);
            if (atom.type === objType) {
                heapNodes.set(name, new Node(name, new Label()));
                // heapNodes.set(sanitize(atom.name), `[label="\\l"]`);
            } else if (atom.type === nullType) {
                const node = new Node(name, new Label("NULL"));
                node.attr('shape', 'plaintext');
                heapNodes.set(name, node);
                // heapNodes.set(sanitize(atom.name), `[shape=none, label="NULL\\l"]`);
            }
        });

        let integerNodes: Map<string, number> = new Map();

        let relations: string[] = [];
        alloyInstance.signatures.forEach(sig => {
            if (sig.label === 'this/' + AlloyTranslator.Store) {
                sig.fields.forEach(f => {
                    if (f.name !== "refTypedVars'") {
                        const name = sanitize(f.name).replace("'", "");
                        f.atoms.forEach(rel => {
                            const to = sanitize(rel[1]);
                            if (heapNodes.has(to)) {
                                relations.push(`${name}:e -> ${to}`);
                                // relations.push(`${f.name} -> ${to} [dir=both, arrowtail=dot]`);
                            }
                        });
                    }
                });
            } else if (sig.label === 'this/' + AlloyTranslator.Ref) {
                sig.fields.forEach(f => {
                    if (f.name !== "refTypedFields'") {
                        f.atoms.forEach(rel => {
                            const from = sanitize(rel[0]);
                            if (!heapNodes.has(from)) {
                                return;
                            }
                            const to = sanitize(rel[1]);
                            if (heapNodes.has(to)) {
                                // const label = `<td port="${f.name}">${f.name}</td>`;
                                const label = `<${f.name}> ${f.name}`;
                                heapNodes.get(from)!.label.parts.push(label);
                                relations.push(`${from}:${f.name} -> ${to}`);
                            } else if (integerNodes.has(to)) {
                                // const label = `<td port="${f.name}">${f.name} == ${integerNodes.get(to)}</td>`;
                                const label = `<${f.name}> ${f.name} == ${integerNodes.get(to)}`;
                                heapNodes.get(from)!.label.parts.push(label);
                            }
                        });
                    }
                });
            }
        });

        let heapGraph = new DotGraph('clusterHeap', true);
        heapGraph.attr('label', '< <u>Heap</u> >');
        // heapGraph.attr('labeljust', 'l');
        heapGraph.attr('style', 'dashed');
        // heapGraph.attr('nodesep', '0.1');
        heapGraph.nodeAttr('color', '"#ffffff"');
        heapGraph.nodeAttr('fontcolor', '"#ffffff"');
        heapGraph.nodeAttr('shape', 'record');
        heapGraph.edgeAttr('color', '"#ffffff"');
        heapGraph.edgeAttr('fontcolor', '"#ffffff"');
        
        if (heapNodes.size < 1) {
            heapGraph.add('heapEmpty [label="Heap Empty"]');
        } else {
            heapNodes.forEach((node, key) => {
                heapGraph.add(node.toString());
                // heapGraph.add(`${key} [label="${node.label.toString()}"]`);
            });
        }

        graph.add(storeGraph);
        graph.add(heapGraph);

        relations.forEach(rel => graph.add(rel));

        return graph;
    }
}