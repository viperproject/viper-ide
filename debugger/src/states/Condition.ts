
export interface Condition {}

export class EqualityCondition implements Condition {
    constructor(readonly isPositive: boolean, readonly lhs: string, readonly rhs: string) {}

    public toString(): string {
        return this.lhs + (this.isPositive ? " == " : " != ") + this.rhs;
    }
}

export class NullityCondition implements Condition {
    constructor(readonly isPositive: boolean, readonly variable: string) {}

    public toString(): string {
        return this.variable + (this.isPositive ? " == null" : " != null");
    }
}

class WildCardCondition implements Condition {
    constructor(readonly isPositive: boolean, readonly lhs: string) {}
}

class QuantifiedCondition implements Condition {
    constructor(readonly body: string) {}
}

class UnparsedCondition implements Condition {
    constructor(readonly rawString: string) {}
}

export namespace Condition {

    export function parseConditions(pathConditionString: string): Condition[] {
        pathConditionString = pathConditionString.trim();

        let result: Condition[] = [];
        let nestingLevel = 0;

        // Keep track of whether we found a quantified assertion and at
        // which nesting level it starts.
        let insideQA = false;
        let qaStartNestingLevel = -1;

        for (let i = 0; i < pathConditionString.length; i++) {
            if (pathConditionString[i] === '(') {
                nestingLevel++;
            } else if (pathConditionString[i] === ')') {
                nestingLevel--;

                // We are not inside a quantified assertion anymore, it is 
                // "safe" to build a condition
                if (qaStartNestingLevel > nestingLevel) {
                    insideQA = false;
                }
            } else if (i + 2 < pathConditionString.length && pathConditionString.substr(i, 3) === 'QA ') {
                // We have found a (new) quantified assertion
                insideQA = true;
                if (nestingLevel >= 0) {
                    // We are nested inside something else, we have to make
                    // sure we find the end of the assertion
                    qaStartNestingLevel = nestingLevel;
                } else {
                    // We are at the topmost level and we have found the
                    // start of a quantified assertion, break the loop and
                    // add everything till the end.
                    break;
                }
            }

            if (!insideQA && i > 0 && nestingLevel === 0 && pathConditionString.substr(i - 1, 2) === '&&') {
                // Split till just before the '&&'
                let head = pathConditionString.substring(0, i - 1);
                result.push(createCondition(head.trim()));
                // Continue with the rest of the string
                pathConditionString = pathConditionString.substring(i + 1);
                i = 0;
            }
        }
        result.push(createCondition(pathConditionString.trim()));

        return result;
    }

    function createCondition(conditionString: string): Condition {
        // TODO: have to fix parsing conditions, this is definitely not enough
        // let conditionRegex = /^([\w$]+(@\d+)+)\s+(==|!=|<|<=|>|>=)\s+([\w$]+(@\d+)+|\d+|_|Null)$/;
        // let match = conditionString.match(conditionRegex);
        // if (match && match[1] && match[2] && match[3]) {
        //     let lhs = match[1];
        //     let rhs = match[3];
        //     let isPositive = match[2] === "==";

        //     if (rhs === "Null") {
        //         return new NullityCondition(isPositive, lhs);
        //     } else if (rhs === "_") {
        //         return new WildCardCondition(isPositive, lhs);
        //     }
        //     return new EqualityCondition(isPositive, lhs, rhs);
        // }

        if (conditionString.startsWith('QA ')) {
            // TODO: probably parse it properly, i.e. split the body from the rest
            return new QuantifiedCondition(conditionString);
        }

        let parts = conditionString.split("==").map(p => p.trim());
        let isPositive = true;
        if (parts.length === 2) {
            if (parts[0] === 'Null') {
                return new NullityCondition(isPositive, parts[1]);
            } else if (parts[1] === 'Null') {
                return new NullityCondition(isPositive, parts[0]);
            } else {
                return new EqualityCondition(isPositive, parts[0], parts[1]);
            }
        }

        parts = conditionString.split("!=").map(p => p.trim());
        isPositive = false;
        if (parts.length === 2) {
            if (parts[0] === 'Null') {
                return new NullityCondition(isPositive, parts[1]);
            } else if (parts[1] === 'Null') {
                return new NullityCondition(isPositive, parts[0]);
            } else {
                return new EqualityCondition(isPositive, parts[0], parts[1]);
            }
        }

        // TODO: re-enable this log line once parsing conditions gets more
        //       complete. At the moment it's just spamming the console.
        // Logger.warn(`Could not parse codition from '${conditionString}'`);
        return new UnparsedCondition(conditionString);
    }
}
