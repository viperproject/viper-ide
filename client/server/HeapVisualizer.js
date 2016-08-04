'use strict';
const Log_1 = require('./Log');
const Statement_1 = require('./Statement');
const Settings_1 = require('./Settings');
let graphviz = require("graphviz");
let NULL = "Null";
let TRUE = "True";
let FALSE = "False";
class HeapVisualizer {
    static heapToDot(state, showSymbolicValues, showConcreteValues) {
        let count = 0;
        try {
            let g = graphviz.digraph("G");
            g.setNodeAttribut("shape", "record");
            g.set("rankdir", "LR");
            if (Settings_1.Settings.settings.darkGraphs) {
                g.set("bgcolor", "#272822");
                g.set("color", "white");
                g.set("fontcolor", "white");
                g.setNodeAttribut("color", "white");
                g.setNodeAttribut("fontcolor", "white");
                g.setEdgeAttribut("color", "white");
                g.setEdgeAttribut("fontcolor", "white");
            }
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
                    let isValueNull = this.isKnownToBeNull(chunk.value.raw, state, showConcreteValues);
                    if (chunk.value.type != Statement_1.ValueType.NoValue && (showSymbolicValues || isValueNull)) {
                        label += " = " + (isValueNull ? NULL : chunk.value.raw);
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
                let isValueNull = this.isKnownToBeNull(variable.value, state, showConcreteValues);
                if (variable.value && (showSymbolicValues || isValueNull)) {
                    variableValue += " = " + (isValueNull ? NULL : variable.value);
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
                        if (parameter === FALSE || parameter === TRUE || /^\d+(\.\d+)$/.test(parameter)) {
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
    //TODO: could be optimized if needed using a hash map storing all variables with value null
    static isKnownToBeNull(symbolicValue, state, showConcreteValues) {
        if (symbolicValue === NULL)
            return true;
        for (let i = 0; i < state.conditions.length; i++) {
            let cond = state.conditions[i];
            if (cond.type == Statement_1.ConditionType.NullityCondition && cond.value && cond.lhs === symbolicValue) {
                return true;
            }
        }
        ;
        if (showConcreteValues) {
        }
        return false;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGVhcFZpc3VhbGl6ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0hlYXBWaXN1YWxpemVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUcxQiw0QkFBdUYsYUFBYSxDQUFDLENBQUE7QUFFckcsMkJBQXVCLFlBQVksQ0FBQyxDQUFBO0FBQ3BDLElBQUksUUFBUSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUVuQyxJQUFJLElBQUksR0FBRyxNQUFNLENBQUM7QUFDbEIsSUFBSSxJQUFJLEdBQUcsTUFBTSxDQUFDO0FBQ2xCLElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQztBQUVwQjtJQUVJLE9BQWMsU0FBUyxDQUFDLEtBQWdCLEVBQUUsa0JBQTJCLEVBQUUsa0JBQTJCO1FBQzlGLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLElBQUksQ0FBQztZQUNELElBQUksQ0FBQyxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDOUIsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDckMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDdkIsRUFBRSxDQUFBLENBQUMsbUJBQVEsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUEsQ0FBQztnQkFDN0IsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQzNCLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUN2QixDQUFDLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBQyxPQUFPLENBQUMsQ0FBQztnQkFDM0IsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLEVBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ25D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