'use strict';
const Log_1 = require('./Log');
class DotAttribute {
    constructor(name, value) {
        this.name = name.trim();
        this.value = value.trim();
    }
    pretty() {
        if (this.name == "rankdir" || this.name == "shape") {
            return this.name + " = " + this.value;
        }
        else {
            return this.name + ' = "' + this.value + '"';
        }
    }
}
class DotGraph {
    constructor(name, bgColor, color, rankdir, shape) {
        this.graphAttributes = [];
        this.nodeAttributes = [];
        this.edgeAttributes = [];
        this.count = 0;
        this.clusters = [];
        this.edges = [];
        if (name.indexOf("_") > 0)
            Log_1.Log.error("The graph name cannot contain _");
        this.name = name;
        //graphAttributes
        this.graphAttributes.push(new DotAttribute("rankdir", rankdir));
        this.graphAttributes.push(new DotAttribute("bgcolor", bgColor));
        this.bgColor = bgColor;
        this.graphAttributes.push(new DotAttribute("color", color));
        this.graphAttributes.push(new DotAttribute("fontcolor", color));
        //nodeAttributes
        this.nodeAttributes.push(new DotAttribute("shape", shape));
        this.nodeAttributes.push(new DotAttribute("color", color));
        this.nodeAttributes.push(new DotAttribute("fontcolor", color));
        //edgeAttributes
        this.edgeAttributes.push(new DotAttribute("color", color));
        this.edgeAttributes.push(new DotAttribute("fontcolor", color));
    }
    toDot() {
        try {
            return `digraph ${this.name} {
compound = true
graph [${DotGraph.combine(this.graphAttributes, ", ")}];
node [${DotGraph.combine(this.nodeAttributes, ", ")}];
edge [${DotGraph.combine(this.edgeAttributes, ", ")}];
${DotGraph.combine(this.clusters, "\n")}
${DotGraph.combine(this.edges, "\n")}
}`;
        }
        catch (e) {
            Log_1.Log.error("Error converting graph to dot" + e);
        }
    }
    addCluster(name, style, label) {
        if (name.indexOf("_") > 0)
            Log_1.Log.error("cluster names cannot contain _");
        //ensure uniqueness
        name = this.name + "_" + (this.count++) + "_" + name.trim();
        let cluster = new DotCluster(this, name, style, label);
        this.clusters.push(cluster);
        return cluster;
    }
    static combine(dotElements, separator) {
        if (!dotElements || dotElements.length == 0) {
            return "";
        }
        return dotElements.map(elem => elem.pretty()).reduce((a, b) => a + separator + b);
    }
    static combineNodes(dotNodes, separator) {
        let temp = [];
        dotNodes.forEach((value, key) => {
            temp.push(value);
        });
        return this.combine(temp, separator);
    }
}
exports.DotGraph = DotGraph;
class DotCluster {
    constructor(graph, name, style, label) {
        this.clusterAttributes = [];
        this.nodes = new Map();
        this.clusters = [];
        this.graph = graph;
        this.name = name;
        //clusterAttributes
        this.clusterAttributes.push(new DotAttribute("style", style));
        this.clusterAttributes.push(new DotAttribute("label", label));
    }
    addEdge(sourceCluster, source, destinationCluster, destination, label, sourceField, destinationField, style) {
        this.doAddEdge(sourceCluster, source, destinationCluster, destination, label, sourceField, destinationField, style);
    }
    addDashedEdge(sourceCluster, source, destinationCluster, destination, label, sourceField, destinationField) {
        this.doAddEdge(sourceCluster, source, destinationCluster, destination, label, sourceField, destinationField, "dashed");
    }
    addEdgeFromCluster(sourceCluster, destinationCluster, destination, label, sourceField, destinationField, style) {
        this.doAddEdge(sourceCluster, null, destinationCluster, destination, label, sourceField, destinationField, style, sourceCluster.name);
    }
    doAddEdge(sourceCluster, source, destinationCluster, destination, label, sourceField, destinationField, style, ltail) {
        if ((!source || sourceCluster.nodes.has(source)) && destinationCluster.nodes.has(destination)) {
            let sourceNode;
            if (source) {
                sourceNode = sourceCluster.nodes.get(source);
            }
            else {
                //addEdgeFromCluster
                sourceNode = sourceCluster.nodes.values().next().value;
                if (!sourceNode) {
                    sourceNode = sourceCluster.addNode("dummy", "", true);
                }
            }
            let destinationNode = destinationCluster.nodes.get(destination);
            sourceNode.hasOutEdge = true;
            this.graph.edges.push(new DotEdge(sourceCluster, sourceNode, destinationCluster, destinationNode, label, sourceField, destinationField, style, ltail));
        }
    }
    addNode(name, label, invisible = false, style) {
        //ensure uniqueness between nodes from different clusters
        name = name.trim();
        let node;
        if (this.nodes.has(name)) {
            node = this.nodes.get(name);
            if (label) {
                node.label = label;
            }
        }
        else {
            node = new DotNode(this, name, label, invisible, style);
            this.nodes.set(name, node);
        }
        return node;
    }
    addCluster(name, style, label) {
        if (name.indexOf("_") > 0)
            Log_1.Log.error("cluster names cannot contain _");
        //ensure uniqueness
        name = this.name + "_" + (this.graph.count++) + "_" + name.trim();
        let cluster = new DotCluster(this.graph, name, style, label);
        this.clusters.push(cluster);
        return cluster;
    }
    pretty() {
        if (this.nodes.size == 0 && this.clusters.length == 0) {
            this.addNode("dummy", "", true);
        }
        return `subgraph cluster_${this.name} {
graph [${DotGraph.combine(this.clusterAttributes, ", ")}];
${DotGraph.combine(this.clusters, "\n")}
${DotGraph.combineNodes(this.nodes, "\n")}
}`;
    }
}
exports.DotCluster = DotCluster;
class DotNode {
    constructor(cluster, name, label, invisible = false, style) {
        this.hasOutEdge = false;
        this.cluster = cluster;
        this.name = name;
        this.invisible = invisible;
        this.style = style;
        this.label = label;
    }
    static escapeLabel(label) {
        if (!label)
            return label;
        return label.replace(/([<>\{\}|])/g, "\\$1");
    }
    pretty() {
        let color = this.invisible ? ', color = "' + this.cluster.graph.bgColor + '", fontcolor = "' + this.cluster.graph.bgColor + '"' : '';
        return `"${this.cluster.name}_${this.name}" [ label = "${(this.label || "")}"${color}${(this.style ? ' style="' + this.style + '"' : "")}];`;
    }
}
exports.DotNode = DotNode;
class DotEdge {
    constructor(sourceCluster, sourceNode, destinationCluster, destinationNode, label, sourceField, destinationField, style, ltail) {
        this.sourceCluster = sourceCluster;
        this.sourceNode = sourceNode;
        this.sourceField = sourceField;
        this.destinationCluster = destinationCluster;
        this.destinationNode = destinationNode;
        this.destinationField = destinationField;
        this.label = label;
        this.style = style;
        this.ltail = ltail;
    }
    pretty() {
        let style = this.style ? ', style = "' + this.style + '"' : '';
        let ltail = this.ltail ? ', ltail = "cluster_' + this.ltail + '"' : '';
        return `"${this.sourceCluster.name}_${this.sourceNode.name}"${this.sourceField ? ":" + this.sourceField : ""} -> "${this.destinationCluster.name}_${this.destinationNode.name}"${this.destinationField ? ":" + this.destinationField : ""} [ label = "${(this.label || "")}"${style}${ltail}];`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRG90R3JhcGguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0RvdEdyYXBoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUcxQjtJQUdJLFlBQVksSUFBWSxFQUFFLEtBQWE7UUFDbkMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDOUIsQ0FBQztJQUNELE1BQU07UUFDRixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLFNBQVMsSUFBSSxJQUFJLENBQUMsSUFBSSxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDakQsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDMUMsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDO1FBQ2pELENBQUM7SUFDTCxDQUFDO0FBQ0wsQ0FBQztBQUVEO0lBV0ksWUFBWSxJQUFZLEVBQUUsT0FBZSxFQUFFLEtBQWEsRUFBRSxPQUFlLEVBQUUsS0FBYTtRQVR4RixvQkFBZSxHQUFtQixFQUFFLENBQUM7UUFDckMsbUJBQWMsR0FBbUIsRUFBRSxDQUFDO1FBQ3BDLG1CQUFjLEdBQW1CLEVBQUUsQ0FBQztRQUtwQyxVQUFLLEdBQVcsQ0FBQyxDQUFDO1FBbUJsQixhQUFRLEdBQWlCLEVBQUUsQ0FBQztRQUM1QixVQUFLLEdBQWMsRUFBRSxDQUFDO1FBakJsQixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUFD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RyxLQUFLLENBQUM7SUFDdkIsQ0FBQztJQUVELE1BQU07UUFDRixJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLGFBQWEsR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7UUFDL0QsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssR0FBRyxxQkFBcUIsR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7UUFDdkUsTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLFdBQVcsR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLFdBQVcsR0FBRyxFQUFFLFFBQVEsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxFQUFFLGVBQWUsQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEtBQUssR0FBRyxLQUFLLElBQUksQ0FBQztJQUNwUyxDQUFDO0FBQ0wsQ0FBQztBQUFBIn0=