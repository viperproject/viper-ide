'use strict';

import {Log} from './Log';

interface ConcreteVariable {
    name: string;
    value: string;
}

export class Model {
    public values: Map<string, string>;

    constructor() {
        this.values = new Map<string, string>();
    }

    public extendModel(model: string) {
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

    public pretty(): string {
        let result = "";
        this.values.forEach((value, name) => {
            result = result + "\n" + name + " -> " + value;
        });
        return result;
    }

    public fillInValues(line: string): string {
        let vars: string[] = line.match(/(\$?[\w\.]+@\d+\b)/g);
        if (vars) {
            vars.forEach((variable) => {
                if (this.values.has(variable)) {
                    let value = this.values.get(variable);
                    line = line.replace(variable, value);
                }
            });
        }
        return line;
    }
}