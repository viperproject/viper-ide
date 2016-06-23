'use strict';
//import {Position} from 'vscode';
const Log_1 = require('./Log');
(function (StatementType) {
    StatementType[StatementType["EXECUTE"] = 0] = "EXECUTE";
    StatementType[StatementType["EVAL"] = 1] = "EVAL";
    StatementType[StatementType["CONSUME"] = 2] = "CONSUME";
    StatementType[StatementType["PRODUCE"] = 3] = "PRODUCE";
})(exports.StatementType || (exports.StatementType = {}));
var StatementType = exports.StatementType;
;
class Statement {
    constructor(firstLine, store, heap, oldHeap, conditions, model) {
        this.parseFirstLine(firstLine);
        this.store = this.parseVariables(this.unpack(store, model));
        this.heap = this.unpackHeap(heap, model);
        this.oldHeap = this.unpackHeap(oldHeap, model);
        //TODO: implement unpackConditions
        this.conditions = this.unpack(conditions, model);
    }
    parseVariables(vars) {
        let result = [];
        vars.forEach((variable) => {
            let parts = variable.split('->');
            if (parts.length == 2) {
                result.push({ name: parts[0].trim(), value: parts[1].trim(), variablesReference: 0 });
            }
            else {
                //TODO: make sure this doesn't happen
                result.push({ name: variable, value: "unknown", variablesReference: 0 });
            }
        });
        return result;
    }
    unpack(line, model) {
        line = line.trim();
        if (line == "{},") {
            return [];
        }
        else {
            let res = [];
            line = line.substring(line.indexOf("(") + 1, line.lastIndexOf(")"));
            while (line) {
                let splitRes = this.splitAtComma(line);
                res.push(model.fillInValues(splitRes.prefix));
                line = splitRes.rest;
            }
            return res;
        }
    }
    unpackHeap(line, model) {
        line = line.trim();
        if (line == "{},") {
            return [];
        }
        line = line.substring(line.indexOf("(") + 1, line.lastIndexOf(")"));
        let res = [];
        try {
            line = line.trim();
            while (line != "") {
                let arrowPosition = line.indexOf("->");
                let hashTagPosition = line.indexOf("#", arrowPosition);
                let secondArrowPosition = line.indexOf("->", hashTagPosition);
                let name = model.fillInValues(line.substring(0, arrowPosition - 1).trim());
                let value = model.fillInValues(line.substring(arrowPosition + 3, hashTagPosition - 1));
                if (secondArrowPosition < 0) {
                    //this is the last HeapChunk
                    var permission = model.fillInValues(line.substring(hashTagPosition + 2, line.length));
                    line = "";
                }
                else {
                    line = line.substring(hashTagPosition + 2, line.length);
                    let splitRes = this.splitAtComma(line);
                    permission = model.fillInValues(splitRes.prefix);
                    line = splitRes.rest;
                }
                res.push({ name: name, permission: permission, value: value });
            }
        }
        catch (e) {
            Log_1.Log.error("Heap parsing error: " + e);
        }
        return res;
    }
    splitAtComma(line) {
        let i = 0;
        let bracketCount = 0;
        let endFound = false;
        //walk through line to determine end of permission
        while (i < line.length && !endFound) {
            let char = line[i];
            if (char == '(' || char == '[' || char == '{') {
                bracketCount++;
            }
            else if (char == ')' || char == ']' || char == '}') {
                bracketCount--;
            }
            else if (char == ',' && bracketCount == 0) {
                endFound = true;
            }
            i++;
        }
        return {
            prefix: i + 1 < line.length ? line.substring(0, i - 1) : line,
            rest: line = i + 1 < line.length ? line.substring(i + 1) : null
        };
    }
    pretty() {
        let positionString = "\nPosition: " + (this.position ? this.position.line + ":" + this.position.character : "<no position>") + "\n";
        let res = "Type: " + StatementType[this.type] + positionString;
        res += "Formula: " + this.formula + "\n";
        res += "Store: \n";
        this.store.forEach(element => {
            res += "\t" + element.name + " = " + element.value + "\n";
        });
        res += "Heap: \n";
        this.heap.forEach(element => {
            res += "\t" + element.name + " -> " + element.value + " # " + element.permission + "\n";
        });
        res += "OldHeap: \n";
        this.oldHeap.forEach(element => {
            res += "\t" + element.name + " -> " + element.value + " # " + element.permission + "\n";
        });
        res += "Condition: \n";
        this.conditions.forEach(element => {
            res += "\t" + element + "\n";
        });
        return res;
    }
    parseFirstLine(line) {
        let parts = /(.*?)\s+((\d*):(\d*)|<no position>):\s+(.*)/.exec(line);
        if (!parts) {
            Log_1.Log.error('could not parse first Line of the silicon trace message : "' + line + '"');
            return;
        }
        let type = parts[1];
        if (type === "CONSUME") {
            this.type = StatementType.CONSUME;
        }
        else if (type === "PRODUCE") {
            this.type = StatementType.PRODUCE;
        }
        else if (type === "EVAL") {
            this.type = StatementType.EVAL;
        }
        else if (type === "EXECUTE") {
            this.type = StatementType.EXECUTE;
        }
        if (parts.length == 6) {
            //subtract 1 to confirm with VS Codes 0-based numbering
            let lineNr = +parts[3] - 1;
            let charNr = +parts[4] - 1;
            this.position = { line: lineNr, character: charNr };
            this.formula = parts[5].trim();
        }
        if (parts.length == 4) {
            this.formula = parts[3].trim();
        }
    }
}
exports.Statement = Statement;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RhdGVtZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9TdGF0ZW1lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBRWIsa0NBQWtDO0FBQ2xDLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUcxQixXQUFZLGFBQWE7SUFBRyx1REFBTyxDQUFBO0lBQUUsaURBQUksQ0FBQTtJQUFFLHVEQUFPLENBQUE7SUFBRSx1REFBTyxDQUFBO0FBQUMsQ0FBQyxFQUFqRCxxQkFBYSxLQUFiLHFCQUFhLFFBQW9DO0FBQTdELElBQVksYUFBYSxHQUFiLHFCQUFpRCxDQUFBO0FBQUEsQ0FBQztBQXlCOUQ7SUFTSSxZQUFZLFNBQWlCLEVBQUUsS0FBYSxFQUFFLElBQVksRUFBRSxPQUFlLEVBQUUsVUFBa0IsRUFBRSxLQUFZO1FBQ3pHLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDL0IsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDM0QsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQy9DLGtDQUFrQztRQUNsQyxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3BELENBQUM7SUFFTyxjQUFjLENBQUMsSUFBYztRQUNqQyxJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFDaEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVE7WUFDbEIsSUFBSSxLQUFLLEdBQWEsUUFBUSxDQUFD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