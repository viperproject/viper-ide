'use strict';
//import {Position} from 'vscode';
var Log_1 = require('./Log');
(function (StatementType) {
    StatementType[StatementType["EXECUTE"] = 0] = "EXECUTE";
    StatementType[StatementType["EVAL"] = 1] = "EVAL";
    StatementType[StatementType["CONSUME"] = 2] = "CONSUME";
    StatementType[StatementType["PRODUCE"] = 3] = "PRODUCE";
})(exports.StatementType || (exports.StatementType = {}));
var StatementType = exports.StatementType;
;
var Statement = (function () {
    function Statement(firstLine, store, heap, oldHeap, conditions) {
        this.parseFirstLine(firstLine);
        this.store = this.parseVariables(this.unpack(store));
        this.heap = this.unpack(heap);
        this.oldHeap = this.unpack(oldHeap);
        this.conditions = this.unpack(conditions);
    }
    Statement.prototype.parseVariables = function (vars) {
        var result = [];
        vars.forEach(function (variable) {
            var parts = variable.split('->');
            if (parts.length == 2) {
                result.push({ name: parts[0].trim(), value: parts[1].trim(), variablesReference: 0 });
            }
            else {
                //TODO: make sure this doesn't happen
                result.push({ name: variable, value: "unknown", variablesReference: 0 });
            }
        });
        return result;
    };
    Statement.prototype.unpack = function (line) {
        line = line.trim();
        if (line == "{},") {
            return [];
        }
        else {
            line = line.substring(line.indexOf("(") + 1, line.lastIndexOf(")"));
            return line.split(",");
        }
    };
    Statement.prototype.pretty = function () {
        var res = "Type: " + StatementType[this.type] + "\nPosition: " + this.position.line + ":" + this.position.character + "\n";
        res += "Formula: " + this.formula + "\n";
        res += "Store: \n";
        this.store.forEach(function (element) {
            res += "\t" + element.name + " = " + element.value + "\n";
        });
        res += "Heap: \n";
        this.heap.forEach(function (element) {
            res += "\t" + element + "\n";
        });
        res += "OldHeap: \n";
        this.oldHeap.forEach(function (element) {
            res += "\t" + element + "\n";
        });
        res += "Condition: \n";
        this.conditions.forEach(function (element) {
            res += "\t" + element + "\n";
        });
        return res;
    };
    Statement.prototype.parseFirstLine = function (line) {
        var parts = /(.*?)\s+(\d*):(\d*):\s+(.*)/.exec(line);
        if (parts.length != 5) {
            Log_1.Log.error('could not parse first Line of the silicon trace message : "' + line + '"');
            return;
        }
        var type = parts[1];
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
        //subtract 1 to confirm with VS Codes 0-based numbering
        var lineNr = +parts[2] - 1;
        var charNr = +parts[3] - 1;
        this.position = { line: lineNr, character: charNr };
        this.formula = parts[4].trim();
    };
    return Statement;
}());
exports.Statement = Statement;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RhdGVtZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9TdGF0ZW1lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBRWIsa0NBQWtDO0FBQ2xDLG9CQUFrQixPQUFPLENBQUMsQ0FBQTtBQUUxQixXQUFZLGFBQWE7SUFBRyx1REFBTyxDQUFBO0lBQUUsaURBQUksQ0FBQTtJQUFFLHVEQUFPLENBQUE7SUFBRSx1REFBTyxDQUFBO0FBQUMsQ0FBQyxFQUFqRCxxQkFBYSxLQUFiLHFCQUFhLFFBQW9DO0FBQTdELElBQVksYUFBYSxHQUFiLHFCQUFpRCxDQUFBO0FBQUEsQ0FBQztBQWE5RDtJQVNJLG1CQUFZLFNBQWlCLEVBQUUsS0FBYSxFQUFFLElBQVksRUFBRSxPQUFlLEVBQUUsVUFBa0I7UUFDM0YsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMvQixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ3JELElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM5QixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFFTyxrQ0FBYyxHQUF0QixVQUF1QixJQUFjO1FBQ2pDLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNoQixJQUFJLENBQUMsT0FBTyxDQUFDLFVBQUMsUUFBUTtZQUNsQixJQUFJLEtBQUssR0FBYSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzNDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FB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