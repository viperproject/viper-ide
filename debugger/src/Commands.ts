
/** Defines the commands that the debugger provides.
 *  Hopefully using this will reduce the number of typo-related headackes.
 */
export namespace DebuggerCommand {
    export const StartDebugger = 'viper-debugger.startDebugger';
    export const StopDebugger = 'viper-debugger.stopDebugger';
    export const NextState = 'viper-debugger.nextState';
    export const PrevState = 'viper-debugger.prevState';
    export const ChildState = 'viper-debugger.childState';
    export const ParentState = 'viper-debugger.parentState';
}
