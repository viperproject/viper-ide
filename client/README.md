### Quick Links
[Installation instructions](http://viper.ethz.ch/downloads) | [Viper IDE's wiki](https://github.com/viperproject/viper-ide/wiki) | [Viper project's webpage](http://viper.ethz.ch)


### Changelog

#### v.5.1.0 (Viper v.25.08-release) 
* Much improved IDE experience

#### v.4.5.2 (Viper v.25.02-release)

#### v.4.4.2 (Viper v.24.08-release)
* ViperTools now come bundled directly with the Viper extension and are no longer downloaded separately.

#### v.4.3.1 (Viper v.24.01-release)
* Minor bug fixes

#### v.4.2.2 (Viper v.23.07-release)
* Includes ViperTools for ARM Macs

#### v.4.1.1 (Viper v.23.01-release)
* Support for Viper plugins in the IDE, several bugfixes.
* Updated Boogie version to 2.15.9 and Z3 version to 4.8.7.

#### v.4.0.1 (Viper v.22.07-release)
* Stable Viper-IDE release using LSP to communicate with [ViperServer (November release)](https://github.com/viperproject/viperserver/releases/tag/v.22.11-release).

#### v.4.0.0
* Major reimplementation of the Viper-IDE to directly talk LSP with ViperServer.

#### v.3.0.1
* Identical release as v.2.5.0.

#### v.2.5.0 (Viper v.22.07-release)
* Default extension for Viper files is now `.vpr`.

#### v.2.4.2
ETH Zurich condemns the acts of war in Ukraine ([read more](https://ethz.ch/services/en/news-and-events/solidarity-with-ukraine.html)).
* Downgrades `node-ipc` to stop it from creating unexpected files.

#### v.2.4.1
* Compatibility with the latest VSCode release (1.66.1)
* Fixes discovery of Java installations to only look for 64-bit versions having version 11 or higher.

#### v.2.4.0 (Viper v.22.02-release)
* Viper IDE cache can be stored to a file.

#### v.2.3.1
* Bumps version number to clearly differentiate it from any release candidate. Besides that, it is equivalent to v.2.3.0.

#### v.2.3.0 (part of Viper v.21.07-release)
* Compatibility with latest versions of Silicon and Carbon incl. latest Viper features (e.g. `Map` types and anonymous axioms).
* Mono is no longer a requirement.
* The JAVA installation has to be version 11 or higher and must be 64-bit.
* The IDE now shows non-critical warning messages. 
* Build version of Viper Tools (i.e. the dependencies) can be configured in the VSCode settings:
  * `Stable` / `Nightly`: the latest Viper Tools in the corresponding build configuration will be used. The [Preferences](https://github.com/viperproject/viper-ide/wiki/Settings:-Preferences) specify from which URL the Viper Tools will be downloaded. The Viper Tools are not automatically updated. They only get installed when they are not present yet or when a manual update is triggered (via the command palette). The installation folder has changed for these two build versions: They always get installed to `<VSCode Installation>/User/globalStorage/viper-admin.viper` where `<VSCode Installation>` corresponds to `~/Library/Application Support/Code` (on macOS), `c:\Users\<user>\AppData\Roaming\Code` (on Windows), and `~/.config/Code` (on Linux).
  * `Local`: uses the Viper Tools located at the path specified as `viperSettings.paths.viperToolsPath`.
* Locating the JAVA installation has been improved. A warning appears if it cannot be uniquely identified. A fixed path to a Java installation can be provided in the settings as `viperSettings.javaSettings.javaBinary` ([more details](https://github.com/viperproject/viper-ide/wiki/Settings:-Java-Settings)).
* Sound effects for a successful or failed verification can be enabled by setting `viperSettings.preferences.enableSoundEffects` to true.
* Minor bug fixes ([#23](https://github.com/viperproject/viperserver/issues/23))

#### v.2.2.5
* Introducing sound effects! 🔊 To disable or change the sounds, use ```viperSettings.paths.sfxPrefix```
* Improved dependency management mechanism
* Mono is no longer a Viper IDE dependency
* Minor bug fixes and stability improvements

#### v.2.2.4
* Adapted the Http mechanism to the latest changes in the ViperServer Http API.
* Dependencies are now downloaded by-default as ```ViperToolsRelease$PlatformName.zip``` where ```$PlatformName``` expands to either ```Linux```, ```Mac```, or ```Windows```.
* Dependencies are now installed by-default into the following locations:

    * ```$HOME/.config/Viper``` (on Linux)
    * ```$HOME/Library/Application Support/Viper``` (on Mac)
    * ```%APPDATA%\Viper``` (on Windows)

    Hence, the installation no longer requires the admin password. 

* Some bug fixes (environment variables in configuration paths are now expanded on all platforms)

#### v.2.2.3
* Updated links after migrating from Bitbucket to Github. 

#### v.2.2.2
* Small fixes after migrating the extension to the new name. 

#### v.2.2.1
* **Please check the new [online Viper tutorial](http://viper.ethz.ch/tutorial/).**
* Caching is now enabled by default. The cache is stored separately for different verification backends.

#### v.2.1.1
* **Please update the IDE dependencies via Command Palette in order to use this version.**
* Fixed the bug that caused some verification failures to appear twice when caching is enabled.
* The new ViperServer supports caching of verification results for both verification backends. The caching mechanism is optimized.

#### v.2.1.0
* **Please update the IDE dependencies via Command Palette in order to use this version.**
* Fixed the bug causing the bottom pane to pop-up at startup or while navigating the code, jumping to definition, etc.
* The new ViperServer supports caching of verification results from Silicon.
* Caching is disabled by default for now. To enable caching, add the following to your User Settings:

        "viperSettings.viperServerSettings": {
            "v": "674a514867b1",
            "disableCaching": false
        }

    To invalidate the cache, use ```Viper: flush the cache``` from the command palette.


#### v.2.0.10
* Fixed a bug with internal errors not being reported properly (e.g., ```"tag": "internal:feature.unsupported"```). See [Silicon#326](https://github.com/viperproject/silicon/issues/326)
* Fixed a bug with error reporting in custom backends (```"type": "other"```).
* Changed the extension category to an appropriate one (Programming Languages). Thanks to Greg Van Liew <gregvanl@microsoft.com> for pointing that out!

#### v.2.0.9
* **Please update the IDE dependencies via Command Palette in order to use this version.**
* The new ViperServer avoids race conditions in HTTP router.
* ViperServer's log file location is now written to the output panel.
* Exceptional messages from ViperServer are now supported by the IDE.
* Custom verification backends can now be used with ViperIDE/ViperServer.
    Just add the following element to ```"viperSettings.verificationBackends"``` in User Settings:

        {
            "v": "674a514867b1",
            "name": "my_custom_backend",
            "type": "other",
            "paths": [],
            "engine": "ViperServer",
            "timeout": 20000,
            "stages": [
                {
                    "name": "verify",
                    "isVerification": true,
                    "mainMethod": "core.MyCustomVerificationBackend",
                    "customArguments": "--z3Exe $z3Exe$ $disableCaching$"
                }
            ],
            "stoppingTimeout": 5000
        }

    ```core.MyCustomVerificationBackend``` must be a class that extends [SilFrontend](https://github.com/viperproject/silver/blob/master/src/main/scala/viper/silver/frontend/SilFrontend.scala)
    that exists in a reachable JAR file (you have to manually add it to
    ```$viperToolsPath/Viper/backends``` manually).

#### v.2.0.7
* Arbitrary-large input programs are supported via JSON streaming.

#### v.2.0.6
* Dynamic verification backends can be specified for the ViperServer engine.


### External contributors

We thank the following authors from [freesound.org](https://freesound.org): 
* **suntemple** for [magic.mp3](https://freesound.org/people/suntemple/sounds/241809/), [bonus-pickup.wav](https://freesound.org/people/suntemple/sounds/253172/), [falling-down.wav](https://freesound.org/people/suntemple/sounds/253173/) 
* **josepharaoh99** for [engine-dying.mp3](https://freesound.org/people/josepharaoh99/sounds/368512/). 

The sound effects in Viper IDE are licensed under [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
