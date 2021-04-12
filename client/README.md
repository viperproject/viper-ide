### Quick Links
[Installation instructions](http://viper.ethz.ch/downloads) | [Viper IDE's wiki](https://github.com/viperproject/viper-ide/wiki) | [Viper project's webpage](http://viper.ethz.ch)


### Changelog

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
                    "customArguments": "--z3Exe $z3Exe$ $disableCaching$ $fileToVerify$"
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