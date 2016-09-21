'use strict';
const Log_1 = require('./Log');
class Model {
    constructor() {
        this.values = new Map();
    }
    extendModel(model) {
        try {
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
                //assemble values, needed for e.g. snap values
                if (value.startsWith("(")) {
                    let bracketCount = this.countBrackets(value);
                    while (!(value.endsWith(")") && bracketCount == 0) && ++i < parts.length) {
                        bracketCount += this.countBrackets(parts[i]);
                        value += " " + parts[i];
                    }
                }
                // if (this.values.has(name)) {
                //     if (this.values.get(name) != value) {
                //         Log.error("model inconsistency: " + name + " has values " + this.values.get(name) + " and " + value);
                //     }
                // }
                this.values.set(name, this.simplifyValue(value));
            }
        }
        catch (e) {
            Log_1.Log.error("Error extending model: " + e);
        }
    }
    simplifyValue(value) {
        let isSnap = value.indexOf("$Snap.") >= 0;
        if (isSnap) {
            //value = value.replace(/\$Snap\./g, "");
            //return "Snap: " + value;
            return "_";
        }
        else {
            let match = /\$(.*?)!val!(\d+)/.exec(value);
            if (match && match[1] && match[2]) {
                return match[1] + "_" + match[2];
            }
            else {
                return value;
            }
        }
    }
    countBrackets(value) {
        let res = 0;
        for (var i = 0; i < value.length; i++) {
            let char = value[i];
            if (char == '(' || char == '[' || char == '{') {
                res++;
            }
            else if (char == ')' || char == ']' || char == '}') {
                res--;
            }
        }
        return res;
    }
    pretty() {
        let result = "";
        this.values.forEach((value, name) => {
            result = result + "\n" + name + " -> " + value;
        });
        return result;
    }
    fillInValues(line) {
        let vars = line.match(/(\$?[\w\.]+@\d+\b)/g);
        let foundVars = new Map();
        if (vars) {
            vars.forEach((variable) => {
                if (!foundVars.has(variable)) {
                    foundVars.set(variable, true);
                    if (this.values.has(variable)) {
                        let value = this.values.get(variable);
                        var re = new RegExp(this.escapeRegExp(variable), "g");
                        line = line.replace(re, variable + "(=" + value + ")");
                    }
                }
            });
        }
        return line;
    }
    escapeRegExp(str) {
        return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
    }
}
exports.Model = Model;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTW9kZWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL01vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUcxQjtJQUdJO1FBQ0ksSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztJQUM1QyxDQUFDO0lBRU0sV0FBVyxDQUFDLEtBQWE7UUFDNUIsSUFBSSxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsc0NBQXNDLENBQUMsQ0FBQztnQkFDbEQsTUFBTSxDQUFDO1lBQ1gsQ0FBQztZQUNELEtBQUssR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDckIsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ25ELFNBQUcsQ0FBQyxLQUFLLENBQUMsbUNBQW1DLENBQUMsQ0FBQztnQkFDL0MsTUFBTSxDQUFDO1lBQ1gsQ0FBQztZQUNELGVBQWU7WUFDZixLQUFLLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztZQUM3QyxLQUFLLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDbkMsNkJBQTZCO1lBQzdCLEtBQUssR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLHNCQUFzQixFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBRWxELElBQUksS0FBSyxHQUFhLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFdkMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDdkMsSUFBSSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDeEIsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUVyQiw4Q0FBOEM7Z0JBQzlDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN4QixJQUFJLFlBQVksR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUM3QyxPQUFPLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLFlBQVksSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7d0JBQ3ZFLFlBQVksSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUM3QyxLQUFLLElBQUksR0FBRyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDNUIsQ0FBQztnQkFDTCxDQUFDO2dCQUNELCtCQUErQjtnQkFDL0IsNENBQTRDO2dCQUM1QyxnSEFBZ0g7Z0JBQ2hILFFBQVE7Z0JBQ1IsSUFBSTtnQkFDSixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3JELENBQUM7UUFDTCxDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMseUJBQXlCLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDN0MsQ0FBQztJQUNMLENBQUM7SUFFTyxhQUFhLENBQUMsS0FBYTtRQUMvQixJQUFJLE1BQU0sR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ1QseUNBQXlDO1lBQ3pDLDBCQUEwQjtZQUMxQixNQUFNLENBQUMsR0FBRyxDQUFDO1FBQ2YsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osSUFBSSxLQUFLLEdBQUcsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzVDLEVBQUUsQ0FBQyxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDaEMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JDLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixNQUFNLENBQUMsS0FBSyxDQUFDO1lBQ2pCLENBQUM7UUFFTCxDQUFDO0lBRUwsQ0FBQztJQUVPLGFBQWEsQ0FBQyxLQUFhO1FBQy9CLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQztRQUNaLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3BDLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwQixFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksR0FBRyxJQUFJLElBQUksSUFBSSxHQUFHLElBQUksSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQzVDLEdBQUcsRUFBRSxDQUFDO1lBQ1YsQ0FBQztZQUNELElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksR0FBRyxJQUFJLElBQUksSUFBSSxHQUFHLElBQUksSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pELEdBQUcsRUFBRSxDQUFDO1lBQ1YsQ0FBQztRQUNMLENBQUM7UUFDRCxNQUFNLENBQUMsR0FBRyxDQUFDO0lBQ2YsQ0FBQztJQUVNLE1BQU07UUFDVCxJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFDaEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsSUFBSTtZQUM1QixNQUFNLEdBQUcsTUFBTSxHQUFHLElBQUksR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLEtBQUssQ0FBQztRQUNuRCxDQUFDLENBQUMsQ0FBQztRQUNILE1BQU0sQ0FBQyxNQUFNLENBQUM7SUFDbEIsQ0FBQztJQUVNLFlBQVksQ0FBQyxJQUFZO1FBQzVCLElBQUksSUFBSSxHQUFhLElBQUksQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUN2RCxJQUFJLFNBQVMsR0FBeUIsSUFBSSxHQUFHLEVBQW1CLENBQUM7UUFDakUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNQLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRO2dCQUNsQixFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUMzQixTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDOUIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUM1QixJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQzt3QkFDdEMsSUFBSSxFQUFFLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQzt3QkFDdEQsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUFFLFFBQVEsR0FBRyxJQUFJLEdBQUcsS0FBSyxHQUFHLEdBQUcsQ0FBQyxDQUFDO29CQUMzRCxDQUFDO2dCQUNMLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ2hCLENBQUM7SUFFTyxZQUFZLENBQUMsR0FBRztRQUNwQixNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxxQ0FBcUMsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUN0RSxDQUFDO0FBQ0wsQ0FBQztBQS9HWSxhQUFLLFFBK0dqQixDQUFBIn0=