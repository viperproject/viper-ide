'use strict';
const Log_1 = require('./Log');
const Statement_1 = require('./Statement');
let graphviz = require("graphviz");
class HeapVisualizer {
    static heapToDot(state, showSymbolicValues, showConcreteValues) {
        let count = 0;
        try {
            let g = graphviz.digraph("G");
            g.setNodeAttribut("shape", "record");
            g.set("rankdir", "LR");
            let store = g.addCluster("cluster_store");
            store.set("style", "dotted");
            store.set("label", "Store");
            let heap = g.addCluster("cluster_heap");
            heap.set("style", "dotted");
            heap.set("label", "Heap");
            //read all heap Chunks to find out all existing nodes in the heap,
            //gather information about fields
            let heapChunkFields = new Map();
            state.heap.forEach(heapChunk => {
                if (!heapChunk.parsed) {
                    Log_1.Log.log("Warning, I don't know how to visualize the heap chunk " + JSON.stringify(heapChunk.name));
                }
                else {
                    if (heapChunk.name.type == Statement_1.NameType.FieldReferenceName && heapChunk.value.type == Statement_1.ValueType.ObjectReferenceOrScalarValue) {
                        let receiver = heapChunk.name.receiver;
                        if (!heapChunkFields.has(receiver)) {
                            heapChunkFields.set(receiver, []);
                        }
                        heapChunkFields.get(receiver).push(heapChunk);
                    }
                }
            });
            //add all nodes with the appropriate fields to the heap
            heapChunkFields.forEach((fields, receiver) => {
                let heapChunkNode = heap.addNode(receiver);
                let label = "<name>";
                fields.forEach(chunk => {
                    label += `|<${chunk.name.field}>${chunk.name.field}`;
                    if (showSymbolicValues && chunk.value.type != Statement_1.ValueType.NoValue) {
                        label += " = " + chunk.value.raw;
                        if (showConcreteValues && chunk.value.concreteValue) {
                            label += "(=" + chunk.value.concreteValue + ")";
                        }
                    }
                });
                heapChunkNode.set("label", label);
            });
            //populate the store and add pointers from store to heap
            let vars = new Map();
            state.store.forEach(variable => {
                let variableNode = store.addNode(variable.name);
                vars.set(variable.name, variableNode);
                //set variable value
                let variableValue = variable.name;
                //add symbolic and concrete values;
                if (showSymbolicValues && variable.value) {
                    variableValue += " = " + variable.value;
                    if (showConcreteValues && variable.concreteValue) {
                        variableValue += "(=" + variable.concreteValue + ")";
                    }
                }
                variableNode.set("label", variableValue);
                if (heapChunkFields.has(variable.value)) {
                    g.addEdge(variable.name, variable.value);
                }
            });
            //add pointers inside heap
            //also build Predicate nodes
            state.heap.forEach(heapChunk => {
                if (heapChunk.parsed && heapChunk.name.type == Statement_1.NameType.FieldReferenceName && heapChunk.value.type == Statement_1.ValueType.ObjectReferenceOrScalarValue) {
                    //add the adge only if the value is known to exist
                    if (heapChunkFields.has(heapChunk.value.raw)) {
                        let edge = heap.addEdge(heapChunk.name.receiver, heapChunk.value.raw);
                        edge.set("label", heapChunk.name.field);
                    }
                }
                else if (heapChunk.name.type == Statement_1.NameType.PredicateName) {
                    //add predicate subgraph
                    let predicateCluster = heap.addCluster("cluster_" + heapChunk.name.receiver + "_" + (++count));
                    predicateCluster.set("style", "bold");
                    predicateCluster.set("label", "Predicate " + heapChunk.name.receiver);
                    //skip the fist argument (it's the snapshot argument)
                    for (let i = 1; i < heapChunk.name.arguments.length; i++) {
                        let parameter = heapChunk.name.arguments[i];
                        let negated;
                        if (parameter.startsWith("!")) {
                            //we have a negated boolean
                            negated = "not";
                            parameter = parameter.substring(1, parameter.length);
                        }
                        if (parameter === "False" || parameter === "True" || /^\d+(\.\d+)$/.test(parameter)) {
                            let argumentNode = predicateCluster.addNode(`predicate_${count}_arg${i} = ${negated ? "!" : ""}${parameter}`);
                            argumentNode.set("label", `arg${i} = ${negated ? "!" : ""}${parameter}`);
                        }
                        else {
                            let argumentNode = predicateCluster.addNode(`predicate_${count}_arg ${i}`);
                            argumentNode.set("label", `arg ${i}`);
                            if (heapChunkFields.has(parameter)) {
                                let edge = heap.addEdge(parameter, argumentNode);
                                this.configureEdge(edge, negated, "dashed");
                            }
                            else {
                                //try to add edge from variable to predicate argument;
                                state.store.forEach(element => {
                                    if (element.value === parameter) {
                                        let edge = heap.addEdge(vars.get(element.name), argumentNode);
                                        this.configureEdge(edge, negated, "dashed");
                                    }
                                });
                                //try to add edge from field to predicate argument
                                state.heap.forEach(chunk => {
                                    if (chunk.name.type == Statement_1.NameType.FieldReferenceName && chunk.value.raw === parameter) {
                                        let edge = heap.addEdge(chunk.name.receiver, argumentNode);
                                        this.configureEdge(edge, (negated ? "!" : "") + chunk.name.field, "dashed");
                                    }
                                });
                            }
                        }
                    }
                }
            });
            return g.to_dot();
        }
        catch (e) {
            Log_1.Log.error("Graphviz Error: " + e);
        }
    }
    static configureEdge(edge, label, style) {
        if (style) {
            edge.set("style", style);
        }
        if (label) {
            edge.set("label", label);
        }
    }
}
exports.HeapVisualizer = HeapVisualizer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGVhcFZpc3VhbGl6ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0hlYXBWaXN1YWxpemVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUcxQiw0QkFBd0UsYUFBYSxDQUFDLENBQUE7QUFFdEYsSUFBSSxRQUFRLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBRW5DO0lBRUksT0FBYyxTQUFTLENBQUMsS0FBZ0IsRUFBRSxrQkFBMkIsRUFBRSxrQkFBMkI7UUFFOUYsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsSUFBSSxDQUFDO1lBQ0QsSUFBSSxDQUFDLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUM5QixDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQztZQUNyQyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUN2QixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUMsVUFBVSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQzFDLEtBQUssQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzdCLEtBQUssQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzVCLElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDeEMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDNUIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFFMUIsa0VBQWtFO1lBQ2xFLGlDQUFpQztZQUNqQyxJQUFJLGVBQWUsR0FBRyxJQUFJLEdBQUcsRUFBdUIsQ0FBQztZQUNyRCxLQUFLLENB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