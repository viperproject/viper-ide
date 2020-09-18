/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const Log_1 = require("./Log");
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
            let match = /\$?(.*?)!val!(\d+)/.exec(value);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTW9kZWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL01vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7SUFNSTtBQUVKLFlBQVksQ0FBQzs7QUFFYiwrQkFBMEI7QUFHMUIsTUFBYSxLQUFLO0lBR2Q7UUFDSSxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxFQUFrQixDQUFDO0lBQzVDLENBQUM7SUFFTSxXQUFXLENBQUMsS0FBYTtRQUM1QixJQUFJO1lBQ0EsSUFBSSxDQUFDLEtBQUssRUFBRTtnQkFDUixTQUFHLENBQUMsS0FBSyxDQUFDLHNDQUFzQyxDQUFDLENBQUM7Z0JBQ2xELE9BQU87YUFDVjtZQUNELEtBQUssR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUNsRCxTQUFHLENBQUMsS0FBSyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7Z0JBQy9DLE9BQU87YUFDVjtZQUNELGVBQWU7WUFDZixLQUFLLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztZQUM3QyxLQUFLLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDbkMsNkJBQTZCO1lBQzdCLEtBQUssR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLHNCQUFzQixFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBRWxELElBQUksS0FBSyxHQUFhLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFdkMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLENB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