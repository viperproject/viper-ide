
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