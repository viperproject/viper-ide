
/** Normalize whatever was thrown to a proper Error.
 *  From: <https://stackoverflow.com/questions/43643354/exception-nesting-wrapping-in-typescript>
 */
export function normalizeError(e: any): Error {
    if (e instanceof Error) {
        return e;
    }

    return new Error(typeof e === "string" ? e : e.toString());
}


export class DebuggerError extends Error {
    protected originalError?: Error;

    constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, DebuggerError.prototype);
    }

    /** Constructs a DebuggerError that wraps another errror. */
    static wrapping(message: string, error: Error): DebuggerError {
        let e = new DebuggerError(message);
        e.originalError = error;
        return e;
    }
}