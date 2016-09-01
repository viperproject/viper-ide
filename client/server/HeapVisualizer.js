'use strict';
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const Statement_1 = require('./Statement');
const Settings_1 = require('./Settings');
let graphviz = require("graphviz");
let NULL = "Null";
let TRUE = "True";
let FALSE = "False";
class HeapVisualizer {
    static addCluster(graph, label, style) {
        let cluster = graph.addCluster("cluster_" + label);
        cluster.set("style", style);
        cluster.set("label", label);
        return cluster;
    }
    static heapToDot(state, showSymbolicValues, showConcreteValues, model) {
        let count = 0;
        try {
            let g = graphviz.digraph("G");
            g.setNodeAttribut("shape", "record");
            g.set("rankdir", "LR");
            //light theme
            let bgColor = "white";
            let color = "black";
            if (Settings_1.Settings.settings.darkGraphs) {
                //dark theme
                bgColor = "#272822";
                color = "white";
            }
            this.setGraphColors(g, bgColor, color);
            let store = this.addCluster(g, "Store", "dotted");
            let heap = this.addCluster(g, "Heap", "dotted");
            let heapEmpty = true;
            //read all heap Chunks to find out all existing nodes in the heap,
            //gather information about fields
            let heapChunkFields = new Map();
            state.heap.forEach(heapChunk => {
                if (!heapChunk.parsed) {
                    Log_1.Log.log("Warning, I don't know how to visualize the heap chunk " + JSON.stringify(heapChunk.name), ViperProtocol_1.LogLevel.Debug);
                }
                else if (heapChunk.name.type == Statement_1.NameType.FieldReferenceName && heapChunk.value.type == Statement_1.ValueType.ObjectReferenceOrScalarValue) {
                    let receiver = heapChunk.name.receiver;
                    if (!heapChunkFields.has(receiver)) {
                        heapChunkFields.set(receiver, []);
                    }
                    heapChunkFields.get(receiver).push(heapChunk);
                }
            });
            //add all nodes with the appropriate fields to the heap
            heapChunkFields.forEach((fields, receiver) => {
                heapEmpty = false;
                let label = "<name>|";
                fields.forEach(chunk => {
                    label += this.getHeapChunkLabel(chunk, showSymbolicValues, showConcreteValues, model, state) + "\\l";
                });
                //add heapChunk node
                let heapChunkNode = heap.addNode(receiver);
                heapChunkNode.set("label", label);
            });
            //populate the store and add pointers from store to heap
            let vars = new Map();
            if (state.store.length == 0) {
                let dummyNode = store.addNode("store_dummy");
                dummyNode.set("color", bgColor);
                dummyNode.set("fontcolor", bgColor);
            }
            else {
                state.store.forEach(variable => {
                    //add variable node
                    let variableNode = store.addNode(variable.name);
                    vars.set(variable.name, variableNode);
                    let variableLabel = this.getVariableLabel(variable, showSymbolicValues, showConcreteValues, model, state);
                    variableNode.set("label", variableLabel);
                    //add pointer from local vars to heap if the heap chunk exists
                    if (heapChunkFields.has(variable.value)) {
                        g.addEdge(variable.name, variable.value);
                    }
                });
            }
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
                    heapEmpty = false;
                    //add predicate subgraph
                    let predicateCluster = heap.addCluster("cluster_" + heapChunk.name.receiver + "_" + (++count));
                    predicateCluster.set("style", "bold");
                    predicateCluster.set("label", "Predicate " + heapChunk.name.receiver);
                    //add parameters into predicate cluster
                    for (let i = 0; i < heapChunk.name.arguments.length; i++) {
                        let parameter = heapChunk.name.arguments[i];
                        let negated;
                        if (parameter.startsWith("!")) {
                            //parameter is a negated boolean
                            negated = "not";
                            parameter = parameter.substring(1, parameter.length);
                        }
                        if (parameter === FALSE || parameter === TRUE || /^\d+(\.\d+)$/.test(parameter)) {
                            //if its a scalar value, add it directly into the Predicate
                            let argumentNode = predicateCluster.addNode(`predicate_${count}_arg${i} = ${negated ? "!" : ""}${parameter}`);
                            argumentNode.set("label", `arg${i} = ${negated ? "!" : ""}${parameter}`);
                        }
                        else {
                            let argumentNode = predicateCluster.addNode(`predicate_${count}_arg ${i}`);
                            argumentNode.set("label", `arg ${i}`);
                            if (heapChunkFields.has(parameter)) {
                                this.addPredicateEdge(heap, parameter, argumentNode, negated);
                            }
                            else {
                                //try to add edge from variable to predicate argument;
                                state.store.forEach(element => {
                                    if (element.value === parameter) {
                                        this.addPredicateEdge(heap, vars.get(element.name), argumentNode, negated);
                                    }
                                });
                                //try to add edge from field to predicate argument
                                state.heap.forEach(chunk => {
                                    if (chunk.name.type == Statement_1.NameType.FieldReferenceName && chunk.value.raw === parameter) {
                                        this.addPredicateEdge(heap, chunk.name.receiver, argumentNode, (negated ? "!" : "") + chunk.name.field);
                                    }
                                });
                            }
                        }
                    }
                }
            });
            //make the empty heap is shown
            if (heapEmpty) {
                let dummyNode = heap.addNode("heap_dummy");
                dummyNode.set("color", bgColor);
                dummyNode.set("fontcolor", bgColor);
            }
            return g.to_dot();
        }
        catch (e) {
            Log_1.Log.error("Graphviz Error: " + e);
        }
    }
    static addPredicateEdge(cluster, lhs, rhs, label) {
        let edge = cluster.addEdge(lhs, rhs);
        edge.set("style", "dashed");
        if (label) {
            edge.set("label", label);
        }
    }
    static getVariableLabel(variable, showSymbolicValues, showConcreteValues, model, state) {
        return this.getLabel(variable.name, variable.value, variable.concreteValue, showSymbolicValues, showConcreteValues, model, state);
    }
    static getHeapChunkLabel(chunk, showSymbolicValues, showConcreteValues, model, state) {
        return this.getLabel(chunk.name.field, chunk.value.raw, chunk.value.concreteValue, showSymbolicValues, showConcreteValues, model, state);
    }
    //the label consists of name and symbolic and concrete values if requested
    static getLabel(name, symbolicValue, concreteValue, showSymbolicValues, showConcreteValues, model, state) {
        let result = name;
        //add symbolic and concrete values;
        let isValueNull = this.isKnownToBeNull(symbolicValue, state, showConcreteValues, model);
        if (symbolicValue && (showSymbolicValues || isValueNull)) {
            result += " = " + (isValueNull ? NULL : symbolicValue);
            if (showConcreteValues && concreteValue) {
                result += "(=" + concreteValue + ")";
            }
        }
        return result;
    }
    static setGraphColors(graph, background, foreground) {
        graph.set("bgcolor", background);
        graph.set("color", foreground);
        graph.set("fontcolor", foreground);
        graph.setNodeAttribut("color", foreground);
        graph.setNodeAttribut("fontcolor", foreground);
        graph.setEdgeAttribut("color", foreground);
        graph.setEdgeAttribut("fontcolor", foreground);
    }
    //TODO: could be optimized if needed using a hash map storing all variables with value null
    static isKnownToBeNull(symbolicValue, state, showConcreteValues, model) {
        if (symbolicValue === NULL)
            return true;
        for (let i = 0; i < state.pcs.length; i++) {
            let cond = state.pcs[i];
            if (cond.type == Statement_1.ConditionType.NullityCondition && cond.value && cond.lhs === symbolicValue) {
                return true;
            }
        }
        ;
        if (showConcreteValues) {
            if (model.values.has(symbolicValue)) {
                let concreteValue = model.values.get(symbolicValue);
                return concreteValue.toLowerCase() === NULL;
            }
        }
        return false;
    }
}
exports.HeapVisualizer = HeapVisualizer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGVhcFZpc3VhbGl6ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0hlYXBWaXN1YWxpemVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUUxQixnQ0FBaUMsaUJBQWlCLENBQUMsQ0FBQTtBQUNuRCw0QkFBaUcsYUFBYSxDQUFDLENBQUE7QUFFL0csMkJBQXVCLFlBQVksQ0FBQyxDQUFBO0FBQ3BDLElBQUksUUFBUSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUVuQyxJQUFJLElBQUksR0FBRyxNQUFNLENBQUM7QUFDbEIsSUFBSSxJQUFJLEdBQUcsTUFBTSxDQUFDO0FBQ2xCLElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQztBQUVwQjtJQUVJLE9BQWUsVUFBVSxDQUFDLEtBQUssRUFBRSxLQUFhLEVBQUUsS0FBYTtRQUN6RCxJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUMsQ0FBQztRQUNuRCxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1QixPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1QixNQUFNLENBQUMsT0FBTyxDQUFDO0lBQ25CLENBQUM7SUFFRCxPQUFjLFNBQVMsQ0FBQyxLQUFnQixFQUFFLGtCQUEyQixFQUFFLGtCQUEyQixFQUFFLEtBQVk7UUFDNUcsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsSUFBSSxDQUFDO1lBQ0QsSUFBSSxDQUFDLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUM5QixDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQztZQUNyQyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxJ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