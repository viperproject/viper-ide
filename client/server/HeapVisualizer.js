'use strict';
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const Statement_1 = require('./Statement');
const DotGraph_1 = require('./DotGraph');
const Settings_1 = require('./Settings');
let graphviz = require("graphviz");
let NULL = "Null";
let TRUE = "True";
let FALSE = "False";
class HeapVisualizer {
    static getBgColor() {
        if (Settings_1.Settings.settings.advancedFeatures.darkGraphs) {
            return "#272822";
        }
        else {
            return "white";
        }
    }
    static getForegroundColor() {
        if (Settings_1.Settings.settings.advancedFeatures.darkGraphs) {
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
    static heapToDotUsingOwnDotGraph(state, useOldHeap, showSymbolicValues, showConcreteValues, model) {
        let count = 0;
        try {
            //either select heap or oldHeap
            let heapChunks = useOldHeap ? state.oldHeap : state.heap;
            let graph = new DotGraph_1.DotGraph("G", this.getBgColor(), this.getForegroundColor(), "LR", "record");
            let store = graph.addCluster("store", "dotted", "Store");
            let heap = graph.addCluster("heap", "dotted", "Heap");
            let heapEmpty = true;
            let allNodes = [];
            //read all heap Chunks to find out all existing nodes in the heap,
            //gather information about fields
            let heapChunkFields = new Map();
            heapChunks.forEach(heapChunk => {
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
                if (Settings_1.Settings.settings.advancedFeatures.simpleMode) {
                    heap.addNode(receiver);
                }
                else {
                    heapEmpty = false;
                    let label = "<name>|<fields>";
                    fields.forEach(chunk => {
                        label += this.getHeapChunkLabel(chunk, showSymbolicValues, showConcreteValues, model, state) + "\\l";
                    });
                    //add heapChunk node
                    heap.addNode(receiver, label);
                }
            });
            //populate the store
            let vars = new Map();
            if (state.store.length > 0) {
                state.store.forEach((variable) => {
                    //add variable node
                    let variableLabel = this.getVariableLabel(variable, showSymbolicValues, showConcreteValues, model, state);
                    let variableNode = store.addNode(variable.name, variableLabel);
                    vars.set(variable.name, variableNode);
                    allNodes.push({ variable: variable, node: variableNode });
                });
            }
            //add pointers inside heap
            //build Predicate nodes
            //build FunctionApplication nodes
            heapChunks.forEach(heapChunk => {
                if (heapChunk.parsed && heapChunk.name.type == Statement_1.NameType.FieldReferenceName && heapChunk.value.type == Statement_1.ValueType.ObjectReferenceOrScalarValue) {
                    //add the adge only if the value is known to exist
                    if (heapChunkFields.has(heapChunk.value.raw)) {
                        let edge = heap.addEdge(heap, heapChunk.name.receiver, heap, heapChunk.value.raw, heapChunk.name.field, "fields");
                    }
                }
                else if (heapChunk.name.type == Statement_1.NameType.PredicateName || heapChunk.name.type == Statement_1.NameType.FunctionApplicationName) {
                    heapEmpty = false;
                    //add predicate subgraph
                    let label = heapChunk.name.type == Statement_1.NameType.PredicateName ? "Predicate" : "";
                    let cluster;
                    if (heapChunk.name.type == Statement_1.NameType.PredicateName) {
                        cluster = heap.addCluster(heapChunk.name.receiver, "bold", "Predicate " + heapChunk.name.receiver);
                    }
                    else {
                        cluster = store.addCluster(heapChunk.name.receiver, "bold", "Function call " + heapChunk.name.receiver);
                    }
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
                            let argumentNode = cluster.addNode(`arg${i}`, `arg${i} = ${negated ? "!" : ""}${parameter}`);
                        }
                        else {
                            let argumentNode = cluster.addNode(`arg${i}`, `arg ${i}`);
                            if (heapChunkFields.has(parameter)) {
                                heap.addDashedEdge(heap, parameter, cluster, argumentNode.name, negated);
                            }
                            else {
                                //try to add edge from variable to predicate argument;
                                state.store.forEach(element => {
                                    if (element.value === parameter) {
                                        store.addDashedEdge(store, vars.get(element.name).name, cluster, argumentNode.name, negated);
                                    }
                                });
                                //try to add edge from field to predicate argument
                                heapChunks.forEach(chunk => {
                                    if (chunk.name.type == Statement_1.NameType.FieldReferenceName && chunk.value.raw === parameter) {
                                        store.addDashedEdge(heap, chunk.name.receiver, cluster, argumentNode.name, (negated ? "!" : "") + chunk.name.field, "fields");
                                    }
                                });
                            }
                        }
                    }
                    //add edge from Function Application to result
                    if (heapChunk.name.type == Statement_1.NameType.FunctionApplicationName && heapChunk.value.type == Statement_1.ValueType.ObjectReferenceOrScalarValue) {
                        //let resultNode = cluster.addNode('result', "Result")
                        if (!heapChunkFields.has(heapChunk.value.raw)) {
                            let resultNode;
                            if (Settings_1.Settings.settings.advancedFeatures.simpleMode) {
                                resultNode = heap.addNode(heapChunk.value.raw, "");
                            }
                            else {
                                resultNode = heap.addNode(heapChunk.value.raw, "<name>|<fields>" + (heapChunk.name.field || ""));
                            }
                        }
                        let resultEdge = heap.addEdgeFromCluster(cluster, heap, heapChunk.value.raw, null, "name", null, null);
                    }
                }
            });
            //add pointers from the store to the heap
            if (state.store.length > 0) {
                state.store.forEach((variable) => {
                    //add pointer from local vars to heap if the heap chunk exists
                    store.addEdge(store, variable.name, heap, variable.value, "", null, "name");
                });
            }
            if (!Settings_1.Settings.settings.advancedFeatures.simpleMode) {
                //add types for nodes with no outgoing arrows and no values
                allNodes.forEach((value, key) => {
                    if (!value.node.hasOutEdge && value.node.label.indexOf("=") < 0) {
                        value.node.label += value.variable.type ? ": " + value.variable.type : "";
                    }
                });
            }
            return graph.toDot();
        }
        catch (e) {
            Log_1.Log.error("Graphviz Error: " + e);
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
        if (Settings_1.Settings.settings.advancedFeatures.simpleMode)
            return result;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGVhcFZpc3VhbGl6ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0hlYXBWaXN1YWxpemVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUUxQixnQ0FBaUMsaUJBQWlCLENBQUMsQ0FBQTtBQUNuRCw0QkFBaUcsYUFBYSxDQUFDLENBQUE7QUFFL0csMkJBQTRDLFlBQVksQ0FBQyxDQUFBO0FBQ3pELDJCQUF1QixZQUFZLENBQUMsQ0FBQTtBQUNwQyxJQUFJLFFBQVEsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7QUFFbkMsSUFBSSxJQUFJLEdBQUcsTUFBTSxDQUFDO0FBQ2xCLElBQUksSUFBSSxHQUFHLE1BQU0sQ0FBQztBQUNsQixJQUFJLEtBQUssR0FBRyxPQUFPLENBQUM7QUFFcEI7SUFFSSxPQUFlLFVBQVU7UUFDckIsRUFBRSxDQUFDLENBQUMsbUJBQVEsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUNoRCxNQUFNLENBQUMsU0FBUyxDQUFDO1FBQ3JCLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLE1BQU0sQ0FBQyxPQUFPLENBQUM7UUFDbkIsQ0FBQztJQUNMLENBQUM7SUFDRCxPQUFlLGtCQUFrQjtRQUM3QixFQUFFLENBQUMsQ0FBQyxtQkFBUSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQ2hELE1BQU0sQ0FBQyxPQUFPLENBQUM7UUFDbkIsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osTUFBTSxDQUFDLE9BQU8sQ0FBQztRQUNuQixDQUFDO0lBQ0wsQ0FBQztJQUVELDJDQUEyQztJQUMzQyxrRUFBa0U7SUFDbEUsMkNBQTJDO0lBQzNDLElBQUk7SUFFSixPQUFjLHlCQUF5QixDQUFDLEtBQWdCLEVBQUUsVUFB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