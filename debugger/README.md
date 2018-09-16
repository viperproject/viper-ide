# Viper Debugger

This is the proof of concept debugger for the Silicon verification backend.
The debugger requires the laster version of the [backend tools][backends].
The backends have been packaged from the latest "debugger-support" version of
Silver, Silicon, and ViperServer:

- <https://bitbucket.org/aurecchia/silver/src/debugger_support/>
- <https://bitbucket.org/aurecchia/silicon/src/debugger-support/>
- <https://bitbucket.org/aurecchia/viperserver/src/debugger-support/>

For the debugger to work, the Silicon backend must be configured in the main
extension with the '--ideModeAdvanced' and the '--numberOfParallelVerifiers 1'
options.

The project can be build by using the `npm run compile` command, which will
compile the debugger and the panel. `npm run compile-all` can be used to compile
the debugger, the panel, the client, and the server. Compiling just the panel is
possible via `npm run build-ui`.

The debugger can be run from within visual studio code with the
"Extension + Debugger" task, which runs both the debugger and the main
extension, from the currently compiled sources.

[backends]: https://polybox.ethz.ch/index.php/s/1sxuPDJbNCkDUit
