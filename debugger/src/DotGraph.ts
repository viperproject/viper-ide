import { Record } from './states/Statement';


export interface DotElem {
    toString(): string;
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

    addGraphAttribute(attr: string) {
        this.graphAttributes.push(attr);
    }

    addNodeAttribute(attr: string) {
        this.nodeAttributes.push(attr);
    }

    addEdgeAttribute(attr: string) {
        this.edgeAttributes.push(attr);
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

    static from(state: Record, additionalDotInfo: string = "") {
        let graph = new DotGraph('G');
        graph.addGraphAttribute('bgcolor=none');
        graph.addGraphAttribute('rankdir=LR');
        graph.addGraphAttribute('color="#ffffff"');
        graph.addGraphAttribute('fontcolor="#ffffff"');
        // graph.addGraphAttribute('newrank=true');
        graph.addNodeAttribute('shape=record');
        graph.addEdgeAttribute('color="#ffffff"');
        graph.addEdgeAttribute('fontcolor="#ffffff"');

        let storeGraph = new DotGraph('clusterStore', true);
        storeGraph.addGraphAttribute('label=< <u>Store</u> >');
        storeGraph.addGraphAttribute('labeljust=l');
        storeGraph.addGraphAttribute('style=dashed');
        storeGraph.addGraphAttribute('nodesep=0.1');
        storeGraph.addNodeAttribute('color="#ffffff"');
        storeGraph.addNodeAttribute('fontcolor="#ffffff"');
        storeGraph.addNodeAttribute('shape=none');
        storeGraph.addEdgeAttribute('color="#ffffff"');
        storeGraph.addEdgeAttribute('fontcolor="#ffffff"');

        if (state.prestate) {
            state.prestate.store.forEach((v: any) => {
                let label = `${v.name}: ${v.type}`;
                let node = `var_${v.name} [label="${label}\\l"]`;
                storeGraph.add(node);
            });
        }

        let heapNodes: string[] = [];
        let additionalRelations: string[] = [];
        additionalDotInfo.split('\n').forEach(line => {
            if (line.startsWith('heapNode ')) {
                heapNodes.push(line.substr(9));
            } else {
                additionalRelations.push(line);
            }
        });

        let heapGraph = new DotGraph('clusterHeap', true);
        heapGraph.addGraphAttribute('label=< <u>Heap</u> >');
        heapGraph.addGraphAttribute('labeljust=l');
        heapGraph.addGraphAttribute('style=dashed');
        heapGraph.addNodeAttribute('color="#ffffff"');
        heapGraph.addNodeAttribute('fontcolor="#ffffff"');
        heapGraph.addNodeAttribute('shape=record');
        heapGraph.addEdgeAttribute('color="#ffffff"');
        heapGraph.addEdgeAttribute('fontcolor="#ffffff"');

        let counter = 0;
        if (heapNodes.length < 1) {
            heapGraph.add('heapEmpty [label="Heap Empty"]');
        } else {
            heapNodes.forEach(node => heapGraph.add(node));
        }

        graph.add(storeGraph);
        graph.add(heapGraph);

        additionalRelations.forEach(rel => graph.add(rel));

        return graph;
    }
}