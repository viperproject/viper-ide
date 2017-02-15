'use strict';
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const Statement_1 = require('./Statement');
const DotGraph_1 = require('./DotGraph');
const Settings_1 = require('./Settings');
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
    static executionTreeAroundStateToDot(state) {
        try {
            let graph = new DotGraph_1.DotGraph("G", this.getBgColor(), this.getForegroundColor(), "TB", "record");
            let cluster = graph.addCluster("executionTree", "invis", "Partial Execution Trace");
            //add current node
            let parent;
            if (state.parent) {
                parent = state.getClientParent();
                if (!parent) {
                    parent = state.verifiable.root;
                }
            }
            if (!parent) {
                parent = state;
            }
            this.addChildToExecutionTree(state.index, cluster, parent);
            return graph.toDot();
        }
        catch (e) {
            Log_1.Log.error("Graphviz Error building ExecutionTree: " + e);
        }
    }
    static addChildToExecutionTree(currentState, cluster, state, parentNode, showChildren = true) {
        if (!state)
            return;
        if (state.kind == "WellformednessCheck" || state.isTrivialState)
            return;
        //add node
        let currentLabel = state.toDotLabel();
        let currentNodeName = state.index + " " + currentLabel;
        let isCurrentState = currentState == state.index;
        let currentNode = cluster.addNode(currentNodeName, currentLabel, false, (isCurrentState ? "bold" : (state.canBeShownAsDecoration ? null : "dotted")));
        //addEdge
        if (parentNode) {
            cluster.addEdge(cluster, parentNode.name, cluster, currentNode.name);
        }
        //add children
        if (state.children && state.children.length > 0 && (!state.canBeShownAsDecoration || showChildren || isCurrentState)) {
            let firstChild = state.children[0];
            let lastChild = state.children[state.children.length - 1];
            if (firstChild.index > currentState || lastChild.index < currentState) {
                //only show firstChild
                this.addChildToExecutionTree(currentState, cluster, firstChild, currentNode, false);
                //add all structural nodes
                for (let i = 1; i < state.children.length; i++) {
                    let child = state.children[i];
                    if (!child.canBeShownAsDecoration) {
                        this.addChildToExecutionTree(currentState, cluster, child, currentNode, false);
                    }
                }
            }
            else {
                let currentStateIndex = -1;
                state.children.forEach((state, index) => {
                    if (state.index == currentState) {
                        currentStateIndex = index;
                    }
                });
                if (currentStateIndex >= 0) {
                    //current state is in children list
                    this.addChildToExecutionTree(currentState, cluster, state.children[currentStateIndex - 1], currentNode, false);
                    this.addChildToExecutionTree(currentState, cluster, state.children[currentStateIndex], currentNode, false);
                    this.addChildToExecutionTree(currentState, cluster, state.children[currentStateIndex + 1], currentNode, false);
                }
                else {
                    //show all children 
                    state.children.forEach(child => {
                        this.addChildToExecutionTree(currentState, cluster, child, currentNode, false);
                    });
                }
            }
        }
    }
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
                    Log_1.Log.log("Warning, I don't know how to visualize the heap chunk " + JSON.stringify(heapChunk), ViperProtocol_1.LogLevel.Debug);
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
                        if (parameter && (parameter.toLowerCase() === FALSE.toLowerCase() || parameter.toLowerCase() === TRUE.toLowerCase() || parameter === NULL.toLowerCase() || /^\d+(\.\d+)?$/.test(parameter))) {
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
        let isPrimitiveValue = symbolicValue && (symbolicValue.toLowerCase() === FALSE.toLowerCase() || symbolicValue.toLowerCase() === TRUE.toLowerCase() || symbolicValue === NULL.toLowerCase() || /^\d+(\.\d+)?$/.test(symbolicValue));
        if (symbolicValue && (showSymbolicValues || isPrimitiveValue || isValueNull)) {
            result += " = " + (isValueNull ? NULL : symbolicValue);
            if (showConcreteValues && showSymbolicValues && concreteValue) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGVhcFZpc3VhbGl6ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0hlYXBWaXN1YWxpemVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUUxQixnQ0FBc0MsaUJBQWlCLENBQUMsQ0FBQTtBQUN4RCw0QkFBaUYsYUFBYSxDQUFDLENBQUE7QUFDL0YsMkJBQTRDLFlBQVksQ0FBQyxDQUFBO0FBQ3pELDJCQUF1QixZQUFZLENBQUMsQ0FBQTtBQUVwQyxJQUFJLElBQUksR0FBRyxNQUFNLENBQUM7QUFDbEIsSUFBSSxJQUFJLEdBQUcsTUFBTSxDQUFDO0FBQ2xCLElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQztBQUVwQjtJQUVJLE9BQWUsVUFBVTtRQUNyQixFQUFFLENBQUMsQ0FBQyxtQkFBUSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQ2hELE1BQU0sQ0FBQyxTQUFTLENBQUM7UUFDckIsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osTUFBTSxDQUFDLE9BQU8sQ0FBQztRQUNuQixDQUFDO0lBQ0wsQ0FBQztJQUNELE9BQWUsa0JBQWtCO1FBQzdCLEVBQUUsQ0FBQyxDQUFDLG1CQUFRLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDaEQsTUFBTSxDQUFDLE9BQU8sQ0FBQztRQUNuQixDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixNQUFNLENBQUMsT0FBTyxDQUFDO1FBQ25CLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBYyw2QkFBNkIsQ0FBQyxLQUFnQjtRQUN4RCxJQUFJLENBQUM7WUFDRCxJQUFJLEtBQUssR0FBRyxJQUFJLG1CQUFRLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFBRSxJQUFJLENBQUMsa0JBQWtC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