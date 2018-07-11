import { DebuggerError } from "../Errors";

class NoValue {}

type HeapValue = string | NoValue;

interface HeapPermission {
    readonly raw: string;
}

class ScalarPermission implements HeapPermission {
    constructor(readonly value: string, readonly raw: string) {}

    public toString(): string {
        return this.raw;
    }
}

class UnknownPermission implements HeapPermission {
    constructor(readonly raw: string) {}

    public toString(): string {
        return this.raw;
    }
}


export interface HeapChunk {}
    // readonly name: string;
    // readonly value: string | null;
    // // TODO: This can probably be typed as number | 'write' | 'wildcard'
    // readonly permission: string<br>;

    // constructor(name: string, value: string | null, permission: string) {
    //     this.name = name;
    //     this.value = value;
    //     this.permission = permission;
    // }
export namespace HeapChunk {

    // TODO: Check if we need trim calls everywhere like in Ruben's code
    export function parse(heapString: string): HeapChunk {
        const heapChunkFactory = findFactory(heapString);

        const arrowIndex = heapString.indexOf("->");
        const hashTagIndex = heapString.indexOf("#", arrowIndex);

        let name: string;
        let value: HeapValue = NoValue;

        const valueRegex = /^(\$?[\w:]+(@[\d@$]+)?)(\(=.+?\))?$/;
        if (arrowIndex > 0) {
            name = heapString.substring(0, arrowIndex - 1);            

            const valueString = heapString.substring(arrowIndex + 3, hashTagIndex - 1);
            if (!valueRegex.test(valueString)) {
                throw new DebuggerError(`Unexpected heap value '${valueString}'`);
            }
            value = valueString;
        } if (hashTagIndex > 0) {
            name = heapString.substring(0, hashTagIndex - 1);
        } else {
            name = heapString;
        }

        // TODO: handle permissions like "1/4 - (2 * (b@93 ? 3 * $k@97 : $k@98))" from abstract.sil State 142 at 187:8
        let permission: HeapPermission;
        const permissionRegex = /^(W|R|Z|\d+([\.,\/]\d+)?)$/;
        const permissionString = heapString.substring(hashTagIndex + 2, heapString.length);            
        if (permissionRegex.test(permissionString)) {
            permission = new ScalarPermission(permissionString, permissionString);
        } else {
            permission = new UnknownPermission(permissionString);
        }

        return heapChunkFactory(name, value, permission);
    }

    /** Finds the correct factory method for the heap chunk. */
    function findFactory(heapString: string): (s: string, v: HeapValue, p: HeapPermission) => HeapChunk {
        if (heapString.startsWith("QA")) {
            return QuantifiedPermission.parse;
        }

        if (heapString.startsWith("wand@")) {
            return MagicWand.parse;            
        }

        if (heapString.indexOf("[") > 0) {
            return FunctionApplication.parse;
        }

        // Matches on strings of the form 'predicateName(anything here)'
        let predicateRegex = /^\w+\(.*\)$/;
        if (predicateRegex.test(heapString)) {
            return Predicate.parse;
        }

        // TODO: What about multiple derefences? e.g. receiver.a.b.c?
        // TODO: is the dollar sign supposed to appear anywhere in the second group?
        // Matches on a string of the form <receiver><value><fields>
        // - Group 1 matches the receiver
        // - Group 2 matches the possibly-missing value
        // - Group 3 matches the **last** field dereference
        let fieldReferenceRegex = /^(\$?\w+(?:@[\d$]+)*)(\(=.+?\))?(?:\.(\w+))+/;
        let match = fieldReferenceRegex.exec(heapString);
        if (match) {
            return FieldReference.parse;
        } 

        // TODO: Deal with this properly
        // throw new DebuggerError(`Could not parse heap chunk '${heapString}'`);
        return UnparsedHeapChunk.parse;
    }
}

export class QuantifiedPermission implements HeapChunk {
    constructor(
        readonly name: string,
        readonly value: HeapValue,
        readonly permission: HeapPermission) {}

    public static parse(heapString: string, value: HeapValue, permission: HeapPermission): QuantifiedPermission {
        return new QuantifiedPermission(heapString, value, permission);
    }
}

export class MagicWand implements HeapChunk {
    public static parse(heapString: string, value: HeapValue, permission: HeapPermission): MagicWand {
        return new MagicWand();
    }
}

export class Predicate implements HeapChunk {

    constructor(readonly receiver: string, readonly args: string[]) {}

    public static parse(heapString: string, value: HeapValue, permission: HeapPermission): Predicate {

        const receiver = heapString.substring(0, heapString.indexOf('('));
        const args = heapString
                        .substring(heapString.indexOf(';') + 1, heapString.length - 1)
                        .split(',');

        // TODO: Do we need to trim the arguments
        // for (var i = 0; i < this.heapString.arguments.length; i++) {
        //     this.heapString.arguments[i] = this.heapString.arguments[i].trim();
        // }

        return new Predicate(receiver, args);
    }
}

export class FieldReference implements HeapChunk {

    constructor(readonly receiver: string,
                readonly value: HeapValue,
                readonly permission: HeapPermission,
                readonly field: string) {}

    public static parse(heapString: string, value: HeapValue, permission: HeapPermission): FieldReference {
        // const fieldReferenceRegex = /^(\$?\w+(?:@[\d$]+))(\(=.+?\))?(?:\.(\w+))+$/;
        const fieldReferenceRegex = /^(\$?\w+(?:@[\d$]+)*)(\(=.+?\))?(?:\.(\w+))+/;
        const match = fieldReferenceRegex.exec(heapString);

        if (!match) {
            throw new DebuggerError(`Could not parse a FieldReference from '${heapString}'`);
        }

        // Group 1 is the receiver, group 3 is the field
        return new FieldReference(match[1], value, permission, match[3]);
    }

    public toString(): string {
        return `${this.receiver}.${this.field} -> ${this.value} # ${this.permission}`;
    }
}

export class FunctionApplication implements HeapChunk {
    private constructor(readonly receiver: string,
                        readonly args: string[]) {}


    // TODO: Rewrite this with a regex?
    public static parse(heapString: string, value: HeapValue, permission: HeapPermission): FunctionApplication {
        const receiver = heapString.substring(0, heapString.indexOf("["));

        const endOfTypeIndex = heapString.indexOf("]");
        const oParenIndex = heapString.indexOf("(", endOfTypeIndex);
        const cParenIndex = heapString.lastIndexOf(")");

        // TODO: do we need to trim the arguments?
        const args = heapString
                        .substring(oParenIndex + 1, cParenIndex)
                        .split(',');

        // FIXME: What to do here? Is it even the right place to handle this?
        // if (heapString.lastIndexOf(").") >= 0) {
        //     const lastDereferenceIndex = heapString.lastIndexOf(").");
        //     const field = heapString.substring(lastDereferenceIndex + 2, heapString.length).trim();
        // }

        return new FunctionApplication(receiver, args);
    }
}

class UnparsedHeapChunk implements HeapChunk {

    private constructor(readonly heapString: string) {}

    public static parse(heapString: string, value: HeapValue, permission: HeapPermission): UnparsedHeapChunk {
        return new UnparsedHeapChunk(heapString);
    }
}