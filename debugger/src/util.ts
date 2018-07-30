
export class Success {}

export class Failure {
    readonly reason: string;
    constructor(reason: string) {
        this.reason = reason;
    }
}
export function isFailure(check: Success | Failure): check is Failure {
    return check instanceof Failure;
}

export function isSuccess(check: Success | Failure): check is Failure {
    return check instanceof Success;
}

export function flatMap<T, U>(items: T[], lambda: (value: T, index: number, array: T[]) => U[]): U[] {
    return Array.prototype.concat.apply([], items.map(lambda));
}

export function mkString<T>(items: T[], start: string, sep: string = "", end: string = ""): string {
    return start + items.map(i => i.toString()).join(sep) + end;
}

export function indent<T>(items: T[], level: number = 2): string[] {
    const space = " ".repeat(level);
    return items.map(i => space + i.toString());
}