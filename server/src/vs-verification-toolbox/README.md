This directory contains several source files that have been copied from [vs-verification-toolbox](https://github.com/viperproject/vs-verification-toolbox).
The only edited file is `util/Progress.ts` that no longer has a dependency on the `vscode` module.
Note that this is only a temporary solution until we get completely rid of this server.

In addition, the additional argument `confirm` has been added that allows to ask a user for confirmation before actually installing something.
This addition will soon be added to the vs-verification-toolbox repository with a corresponding PR.
