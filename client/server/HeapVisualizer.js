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
    static createEmptyGraph() {
        let emptyGraph = graphviz.digraph("G");
        emptyGraph.setNodeAttribut("shape", "record");
        emptyGraph.set("rankdir", "LR");
        this.setGraphColors(emptyGraph, this.getBgColor(), this.getForegroundColor());
        return emptyGraph;
    }
    static getBgColor() {
        if (Settings_1.Settings.settings.darkGraphs) {
            return "#272822";
        }
        else {
            return "white";
        }
    }
    static getForegroundColor() {
        if (Settings_1.Settings.settings.darkGraphs) {
            return "white";
        }
        else {
            return "black";
        }
    }
    // //TODO: show execution Tree Around State
    // public static executionTreeAroundStateToDot(state: Statement) {
    //     let graph = this.createEmptyGraph();
    // }
    static heapToDot(state, showSymbolicValues, showConcreteValues, model) {
        let count = 0;
        try {
            let g = this.createEmptyGraph();
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
                dummyNode.set("color", this.getBgColor());
                dummyNode.set("fontcolor", this.getBgColor());
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
            //build Predicate nodes
            //build FunctionApplication nodes
            state.heap.forEach(heapChunk => {
                if (heapChunk.parsed && heapChunk.name.type == Statement_1.NameType.FieldReferenceName && heapChunk.value.type == Statement_1.ValueType.ObjectReferenceOrScalarValue) {
                    //add the adge only if the value is known to exist
                    if (heapChunkFields.has(heapChunk.value.raw)) {
                        let edge = heap.addEdge(heapChunk.name.receiver, heapChunk.value.raw);
                        edge.set("label", heapChunk.name.field);
                    }
                }
                else if (heapChunk.name.type == Statement_1.NameType.PredicateName || heapChunk.name.type == Statement_1.NameType.FunctionApplicationName) {
                    heapEmpty = false;
                    //add predicate subgraph
                    let predicateCluster = heap.addCluster("cluster_" + heapChunk.name.receiver + "_" + (++count));
                    predicateCluster.set("style", "bold");
                    let label = heapChunk.name.type == Statement_1.NameType.PredicateName ? "Predicate" : "Function call";
                    predicateCluster.set("label", label + " " + heapChunk.name.receiver);
                    //add parameters into predicate cluster
                    for (let i = 0; i < heapChunk.name.arguments.length; i++) {
                        let parameter = heapChunk.name.arguments[i];
                        let negated;
                        if (parameter.startsWith("!")) {
                            //parameter is a negated boolean
                            negated = "not";
                            parameter = parameter.substring(1, parameter.length);
                        }
                        let argumentNode = predicateCluster.addNode(`predicate_${count}_arg${i}`);
                        if (parameter === FALSE || parameter === TRUE || /^\d+(\.\d+)$/.test(parameter)) {
                            //if its a scalar value, add it directly into the Predicate
                            argumentNode.set("label", `arg${i} = ${negated ? "!" : ""}${parameter}`);
                        }
                        else {
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
                    //add edge from Function Application to result
                    if (heapChunk.name.type == Statement_1.NameType.FunctionApplicationName && heapChunk.value.type == Statement_1.ValueType.ObjectReferenceOrScalarValue) {
                        let resultNode = predicateCluster.addNode(`predicate_${count}_result`);
                        resultNode.set("label", "Result");
                        if (!heapChunkFields.has(heapChunk.value.raw)) {
                            let resultValueNode = heap.addNode(heapChunk.value.raw);
                            resultValueNode.set("label", "<name>|");
                        }
                        let resultEdge = heap.addEdge(resultNode, heapChunk.value.raw);
                        if (heapChunk.name.field) {
                            resultEdge.set("label", heapChunk.name.field);
                        }
                    }
                }
            });
            //make the empty heap is shown
            if (heapEmpty) {
                let dummyNode = heap.addNode("heap_dummy");
                dummyNode.set("color", this.getBgColor());
                dummyNode.set("fontcolor", this.getBgColor());
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGVhcFZpc3VhbGl6ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0hlYXBWaXN1YWxpemVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUUxQixnQ0FBaUMsaUJBQWlCLENBQUMsQ0FBQTtBQUNuRCw0QkFBaUcsYUFBYSxDQUFDLENBQUE7QUFFL0csMkJBQXVCLFlBQVksQ0FBQyxDQUFBO0FBQ3BDLElBQUksUUFBUSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUVuQyxJQUFJLElBQUksR0FBRyxNQUFNLENBQUM7QUFDbEIsSUFBSSxJQUFJLEdBQUcsTUFBTSxDQUFDO0FBQ2xCLElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQztBQUVwQjtJQUVJLE9BQWUsVUFBVSxDQUFDLEtBQUssRUFBRSxLQUFhLEVBQUUsS0FBYTtRQUN6RCxJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUMsQ0FBQztRQUNuRCxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1QixPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1QixNQUFNLENBQUMsT0FBTyxDQUFDO0lBQ25CLENBQUM7SUFFRCxPQUFlLGdCQUFnQjtRQUMzQixJQUFJLFVBQVUsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZDLFVBQVUsQ0FBQyxlQUFlLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzlDLFVBQVUsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxjQUFjLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFBRSxJQUFJLENBQUMsa0JB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