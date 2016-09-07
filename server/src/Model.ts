'use strict';

import {Log} from './Log';
import {LogLevel} from './ViperProtocol';

export class Model {
    public values: Map<string, string>;

    constructor() {
        this.values = new Map<string, string>();
    }

    public extendModel(model: string) {
        try {
            if (!model) {
                Log.error("cannot extend model with 'undefined'");
                return;
            }
            model = model.trim();
            if (!model.startsWith("\"") || !model.endsWith("\"")) {
                Log.error("model is expected to be in quotes");
                return;
            }
            //remove quotes
            model = model.substring(1, model.length - 1);
            model = model.replace(/\s+/g, " ");
            //remove functions from model
            model = model.replace(/ [^ ]*?\s-> \{.*?\}/g, "");

            let parts: string[] = model.split(" ");

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
        } catch (e) {
            Log.error("Error extending model: " + e);
        }
    }

    private simplifyValue(value: string): string {
        let isSnap = value.indexOf("$Snap.") >= 0;
        if (isSnap) {
            //value = value.replace(/\$Snap\./g, "");
            //return "Snap: " + value;
            return "_";
        } else {
            let match = /\$Ref!val!(\d+)/.exec(value);
            if (match && match[1]) {
                return "Ref_" + match[1];
            } else {
                return value;
            }

        }

    }

    private countBrackets(value: string): number {
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

    public pretty(): string {
        let result = "";
        this.values.forEach((value, name) => {
            result = result + "\n" + name + " -> " + value;
        });
        return result;
    }

    public fillInValues(line: string): string {
        let vars: string[] = line.match(/(\$?[\w\.]+@\d+\b)/g);
        let foundVars: Map<string, boolean> = new Map<string, boolean>();
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

    private escapeRegExp(str): string {
        return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
    }
}