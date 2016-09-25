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
        //nodes: DotNode[] = [];
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
        if (sourceCluster.nodes.has(source)) {
            sourceCluster.nodes.get(source).hasOutEdge = true;
        }
        this.graph.edges.push(new DotEdge(sourceCluster.name + "_" + source.trim(), destinationCluster.name + "_" + destination.trim(), label, sourceField, destinationField, style));
    }
    addDashedEdge(sourceCluster, source, destinationCluster, destination, label, sourceField, destinationField) {
        if (sourceCluster.nodes.has(source)) {
            sourceCluster.nodes.get(source).hasOutEdge = true;
        }
        this.graph.edges.push(new DotEdge(sourceCluster.name + "_" + source.trim(), destinationCluster.name + "_" + destination.trim(), label, sourceField, destinationField, "dashed"));
    }
    addEdgeFromCluster(sourceCluster, destinationCluster, destination, label, sourceField, destinationField, style) {
        let source = sourceCluster.nodes.values().next().value.name;
        if (!source) {
            source = sourceCluster.addNode("dummy", "", true).name;
        }
        this.graph.edges.push(new DotEdge(sourceCluster.name + "_" + source.trim(), destinationCluster.name + "_" + destination.trim(), label, sourceField, destinationField, style, sourceCluster.name));
    }
    addNode(name, label, invisible = false) {
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
            node = new DotNode(this, name, label, invisible);
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
        return `subgraph cluster_${this.name} {
graph [${DotGraph.combine(this.clusterAttributes, ", ")}];
${DotGraph.combine(this.clusters, "\n")}
${DotGraph.combineNodes(this.nodes, "\n")}
}`;
    }
}
exports.DotCluster = DotCluster;
class DotNode {
    constructor(cluster, name, label, invisible = false) {
        this.hasOutEdge = false;
        this.cluster = cluster;
        this.name = name;
        this.label = label;
        this.invisible = invisible;
    }
    pretty() {
        let color = this.invisible ? ', color = "' + this.cluster.graph.bgColor + '", fontcolor = "' + this.cluster.graph.bgColor + '"' : '';
        return `"${this.cluster.name}_${this.name}" [ label = "${(this.label || "")}"${color}];`;
    }
}
exports.DotNode = DotNode;
class DotEdge {
    constructor(source, destination, label, sourceField, destinationField, style, ltail) {
        this.source = source;
        this.sourceField = sourceField;
        this.destination = destination;
        this.destinationField = destinationField;
        this.label = label;
        this.style = style;
        this.ltail = ltail;
    }
    pretty() {
        let style = this.style ? ', style = "' + this.style + '"' : '';
        let ltail = this.ltail ? ', ltail = "cluster_' + this.ltail + '"' : '';
        return `"${this.source}"${this.sourceField ? ":" + this.sourceField : ""} -> "${this.destination}"${this.destinationField ? ":" + this.destinationField : ""} [ label = "${(this.label || "")}"${style}${ltail}];`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRG90R3JhcGguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0RvdEdyYXBoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQU8xQjtJQUdJLFlBQVksSUFBWSxFQUFFLEtBQWE7UUFDbkMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDOUIsQ0FBQztJQUNELE1BQU07UUFDRixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLFNBQVMsSUFBSSxJQUFJLENBQUMsSUFBSSxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDakQsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDMUMsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDO1FBQ2pELENBQUM7SUFDTCxDQUFDO0FBQ0wsQ0FBQztBQUVEO0lBV0ksWUFBWSxJQUFZLEVBQUUsT0FBZSxFQUFFLEtBQWEsRUFBRSxPQUFlLEVBQUUsS0FBYTtRQVR4RixvQkFBZSxHQUFtQixFQUFFLENBQUM7UUFDckMsbUJBQWMsR0FBbUIsRUFBRSxDQUFDO1FBQ3BDLG1CQUFjLEdBQW1CLEVBQUUsQ0FBQztRQUtwQyxVQUFLLEdBQVcsQ0FBQyxDQUFDO1FBbUJsQixhQUFRLEdBQWlCLEVBQUUsQ0FBQztRQUM1Qix3QkFBd0I7UUFDeEIsVUFBSyxHQUFjLEVBQUUsQ0FBQztRQWxCbEIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxD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