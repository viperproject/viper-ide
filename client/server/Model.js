'use strict';
const Log_1 = require('./Log');
class Model {
    constructor() {
        this.values = new Map();
    }
    extendModel(model) {
        if (!model) {
            Log_1.Log.error("cannot extend model with 'undefined'");
            return;
        }
        model = model.trim();
        if (!model.startsWith("\"") || !model.endsWith("\"")) {
            Log_1.Log.error("model is expected to be in quotes");
            return;
        }
        //remove quotes
        model = model.substring(1, model.length - 1);
        model = model.replace(/\s+/g, " ");
        //remove functions from model
        model = model.replace(/ [^ ]*?\s-> \{.*?\}/g, "");
        let parts = model.split(" ");
        for (var i = 2; i < parts.length; i += 3) {
            let name = parts[i - 2];
            let value = parts[i];
            if (value.startsWith("(")) {
                while (!value.endsWith(")") && ++i < parts.length) {
                    value += " " + parts[i];
                }
            }
            // if (this.values.has(name)) {
            //     if (this.values.get(name) != value) {
            //         Log.error("model inconsistency: " + name + " has values " + this.values.get(name) + " and " + value);
            //     }
            // }
            this.values.set(name, value);
        }
    }
    pretty() {
        let result = "";
        this.values.forEach((value, name) => {
            result = result + "\n" + name + " -> " + value;
        });
        return result;
    }
}
exports.Model = Model;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTW9kZWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL01vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQVExQjtJQUdJO1FBQ0ksSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztJQUM1QyxDQUFDO0lBRU0sV0FBVyxDQUFDLEtBQWE7UUFDNUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO1lBQ2xELE1BQU0sQ0FBQztRQUNYLENBQUM7UUFDRCxLQUFLLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3JCLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ25ELFNBQUcsQ0FBQyxLQUFLLENBQUMsbUNBQW1DLENBQUMsQ0FBQztZQUMvQyxNQUFNLENBQUM7UUFDWCxDQUFDO1FBQ0QsZUFBZTtRQUNmLEtBQUssR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzdDLEtBQUssR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNuQyw2QkFBNkI7UUFDN0IsS0FBSyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsc0JBQXNCLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFbEQsSUFBSSxLQUFLLEdBQWEsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUV2QyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ3ZDLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDeEIsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JCLEVBQUUsQ0FBQSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQSxDQUFDO2dCQUN0QixPQUFNLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUMsR0FBQyxLQUFLLENBQUMsTUFBTSxFQUFDLENBQUM7b0JBQzVDLEtBQUssSUFBSSxHQUFHLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM1QixDQUFDO1lBQ0wsQ0FBQztZQUNELCtCQUErQjtZQUMvQiw0Q0FBNEM7WUFDNUMsZ0hBQWdIO1lBQ2hILFFBQVE7WUFDUixJQUFJO1lBQ0osSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pDLENBQUM7SUFDTCxDQUFDO0lBRU0sTUFBTTtRQUNULElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNoQixJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQUssRUFBRSxJQUFJO1lBQzVCLE1BQU0sR0FBRyxNQUFNLEdBQUcsSUFBSSxHQUFHLElBQUksR0FBRyxNQUFNLEdBQUcsS0FBSyxDQUFDO1FBQ25ELENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLE1BQU0sQ0FBQztJQUNsQixDQUFDO0FBQ0wsQ0FBQztBQWpEWSxhQUFLLFFBaURqQixDQUFBIn0=