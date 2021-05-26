/**
 * Reports overall progress made within the current task.
 * `fraction` is the amount of progress (out of 1).
 * `step` is a user-facing short description of what is currently happening.
 */
export type ProgressListener = (fraction: number, step: string) => void;
