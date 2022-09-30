/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2022 ETH Zurich.
  */

export function newWarning(msg: string): NonNullable<Message> {
    return {
        level: Level.Warning,
        msg: msg
    };
}

export function newEitherWarning<R>(msg: string): Either<Messages, R> {
    return newLeft([newWarning(msg)]);
}

export function newError(msg: string): NonNullable<Message> {
    return {
        level: Level.Error,
        msg: msg
    };
}

export function newEitherError<R>(msg: string): Either<Messages, R> {
    return newLeft([newError(msg)]);
}

export function newEitherErrorFromError<R>(e: Error): Either<Messages, R> {
    return newEitherError(`${e.name}: ${e.message}`);
}

export enum Level {
    Warning,
    Error,
}
export type Message = {
    level: Level;
    msg: string;
}
export type Messages = NonNullable<Message>[];

export type Left<L> = {
    isRight: boolean;
    left: L;
    right?: never;
}
export type Right<R> = {
    isRight: boolean;
    left?: never;
    right: R;
}
export type Either<L, R> = NonNullable<Left<L> | Right<R>>;

export function newLeft<L>(l: L): Left<L> {
    return {
        isRight: false,
        left: l
    };
}

export function newRight<R>(r: R): Right<R> {
    return {
        isRight: true,
        right: r
    };
}

export const isLeft = <T, U>(e: Either<T, U>): e is Left<T> => {
    return !e.isRight;
};
  
export const isRight = <T, U>(e: Either<T, U>): e is Right<U> => {
    return e.isRight;
};

export function transformRight<L, R, S>(either: Either<L, R>, fn: (right: R) => S): Either<L, S> {
    if (isRight(either)) {
        return newRight(fn(either.right));
    } else {
        return either;
    }
}

export function fold<L, R, S>(either: Either<L, R>, fnL: (left: L) => S, fnR: (right: R) => S): S {
    if (isRight(either)) {
        return fnR(either.right);
    } else {
        return fnL(either.left);
    }
}

export function flatMap<L, R, S>(either: Either<L, R>, fn: (right: R) => Either<L, S>): Either<L, S> {
    if (isRight(either)) {
        return fn(either.right);
    } else {
        return either;
    }
}

export function combine<L, R>(eithers: Either<L, R>[]): Either<L[], R[]> {
    if (eithers.every(e => isRight(e))) {
        return newRight(eithers.map(e => e.right));
    } else {
        return newLeft(eithers.filter(e => isLeft(e)).map(e => e.left));
    }
}

export function toRight<L, R>(either: Either<L, R>, fn: (left: L) => string = left => JSON.stringify(left)): R {
    return fold(either, left => { throw new Error(fn(left)); }, right => right);
}

export function flatten<T>(arr: T[][]): T[] {
    const res: T[] = [];
    arr.forEach(elem => res.push(...elem));
    return res;
}

export function combineMessages<R>(eithers: Either<Messages, R>[]): Either<Messages, R[]> {
    const combined = combine(eithers);
    if (isLeft(combined)) {
        return newLeft(flatten(combined.left));
    } else {
        return combined;
    }
}
