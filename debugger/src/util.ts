
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