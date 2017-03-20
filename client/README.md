Visual Studio Code is a powerful GUI text editor which we use as a basis for implementing an integrated verification environment for the Viper toolchain.

This repository contains the source files of the Viper IDE and installation instructions

# Installation

## 1. Install VS Code

You can download the installer for VS Code from the official website, [here](https://code.visualstudio.com/download).

## 2. Install the Viper IDE extension

Start VS Code and install the **Viper** extension either:
1. using the extensions panel (View->Extensions) 
2. or via the command pallete (```F1``` or ```ctrl+shift+p```/```cmd+shift+p```) ```ext install viper```

VS Code informs you that the extension is only ready after the next restart of VS Code. 

More information on how to install an extension can be found at: [Managing Extensions in VS Code](https://code.visualstudio.com/docs/editor/extension-gallery?pub=felixfbecker&ext=php-debug)

## 3. Open a Viper File

After restarting VS Code, open a Viper file. 
All ```.vpr``` and ```.sil``` files are considered Viper files.

When the IDE is started for the first time it will automatically install the Viper Toolchain.

For instructions on how to manually install the ViperTools, see 3.1

## 3.1 Manually Setup the Viper Toolchain

You can use the prepackaged ViperTools directory that can be downloaded from: [ViperTools](http://www.pm.inf.ethz.ch/research/viper/downloads.html)
Put its extracted content into the following location.
Windows: ```%ProgramFiles%\Viper``` which defaults to ```C:\Program Files (x86)\Viper```  
Mac/Linux: ```/usr/local/Viper```  

For instructions on how to assemble the necessary tools on your own visit [Viper](https://bitbucket.org/viperproject/documentation/wiki/Home)

## 4. Customize the Settings

You might want to change the default behaviour of the Viper IDE. This can be achieved by customizing the settings.

Open the command palette (```F1```), type ```settings```, and select ```open user settings``` or ```open workspace settings``` from the dropdown menu to open the default settings next to your own settings.
The default settings open up together with your settings. 

You cannot change the default settings, you have to edit your user or workspace settings.
For all configurations you don't include in your settings, VS Code uses the default settings.
The user settings are valid for the current user whereas the workspace settings only affect the currently open folder.

More Information on the Settings in VSCode can be found here: [User and Workspace Settings in VS Code](https://code.visualstudio.com/docs/customization/userandworkspace)

### 4.1 List of all viperSettings

* **nailgunSettings:** All nailgun related settings
  * **serverJar:** The path to the nailgun server jar.
  * **clientExecutable:** The path to the nailgun client executable 
  * **port:** The port used for the communication between nailgun client and server
  * **timeout:** After timeout ms the startup of the nailgun server is expected to have failed and thus aborted
* **verificationBackends:** Description of backends
  * **name:** The unique name of this backend
  * **paths:** List of paths locating all used jar files, the files can be addressed directly or via folder, in which case all jar files in the folder are included
  * **useNailgun:** Enable to run the backend through nailgun, speeding up the process by reusing the same Java Virtual Machine
  * **timeout:** After timeout ms the verification is expected to be non terminating and is thus aborted.
  * **stages:** A list of verification stages
    * **name:** The per backend unique name of this stage
    * **isVerification:** Enable if this stage is describing a verification
    * **mainMethod:** The method to invoke when staring the stage
    * **customArguments:** the commandline arguments for the nailgun client (or java, when useNailgun is disabled)
    * **onParsingError:** The name of the stage to start in case of a parsing error
    * **onTypeCheckingError:** The name of the stage to start in case of a type checking error
    * **onVerificationError:** The name of the stage to start in case of a verification error
    * **onSuccess:** The name of the stage to start in case of a success
* **pathSettings:** Used paths
  * **viperToolsPath:** Path to the folder containing all the ViperTools
  * **z3Executable:** The path to the z3 executable
  * **boogieExecutable:** The path to the boogie executable
* **preferences:** General user preferences
  * **autoSave:** Enable automatically saving modified viper files
  * **logLevel:** Verbosity of the output, all output is written to the logFile, regardless of the logLevel
  * **autoVerifyAfterBackendChange:** Reverify the open viper file upon backend change.
  * **showProgress:** Display the verification progress in the status bar. Only useful if the backend supports progress reporting.
* **javaSettings:** Java related settings
  * **customArguments:** The arguments used for all java invocations
* **advancedFeatures:** Settings concening the advanced features
  * **enabled:** Enable heap visualization, stepwise debugging and execution path visualization
  * **showSymbolicState:** Show the symbolic values in the heap visualization. If disabled, the symbolic values are only shown in the error states.
  * **darkGraphs:** To get the best visual heap representation, this setting should match with the active theme.
  * **simpleMode:** Useful for verifying programs. Disable when developing the backend
  * **verificationBufferSize:** Maximal buffer size for verification in KB

# Changelog:

## v.0.3.5:
Bug fixes:
* issue 53:
  *	enabled toggling comments
  *	enabled bracket highlighting
  *	automatically add closing bracket when typing opening bracket  
* issue 54: extending syntax and theme
  *	added Rational as an alias for Perm
  *	added perm and forperm as verification keywords
  *	added label as other keywords
* issue 50:
  *	the deactivate method returns a promise as soon as it is done cleaning up. this allows VS Code to wait for the extension, however, sometimes it is still hitting a timeout and failing to finish the cleanup.
* issue 45:
  *	fixed autosave during running verification
* issue 35:
  * implemented ng and z3 kill command for mac
* auto formatter fix

## 5. Technical Desciptions

The IDE can handle any jar backend that uses the right output format. 

### 5.1 The format expected from the backend verification tools:
Here we describe the format expected by the IDE. Upon detecting a deviation from this specification, the IDE will output an error and not support the backend.

* The backend is expected to send a Start message. The backendType field must contain the type of the backend, e.g. Carbon, Silicon.  
```{"type":"Start","backendType":"Silicon"}```  
* Once the verification is started, a VerificationStart message must be sent. The message needs to contain information about the number of methods, functions, and predicates to be verified.  
```{"type":"VerificationStart","nofPredicates":1,"nofMethods":1,"nofFunctions":0}```  
* Upon completed verification of a predicate, a method, or a function the appropriate Verified method, including the name of the verified structure, must be sent.  
```{"type":"PredicateVerified","name":"list"}```  
```{"type":"MethodVerified","name":"addAtEnd"}```  
```{"type":"FunctionVerified","name":"addAtEnd"}```  
* When the verification inside the backend is done, an End message is expected. The End message must contain total duration of the verification. The format can be either of these:  
```{"type":"End","time":"4.101 seconds"}```  
```{"type":"End","time":"4.101s"}```  
```{"type":"End","time":"4.101"}```  
* The errors detected by the backend should be sent as one message in the following structure:
```{"type":"Error","file":"file.vpr","errors":[{"tag":"example.error.tag","start":"27:2","end":"27:22","message":"Message Explaining Error"}]}```  
All fields in the example are mandatory and need to be set.  
```errors``` is a list of objects containing
  * The error tag, informing about the type of error. e.g. ```"typechecker.error"```, ```"parser.error"```.
  * The start and end location of the error. Both locations must either be structered like ```"line:character"``` if known or ```"<unknown line>:<unknown column>"``` if unknown.
  * The message briefly explaining the error
* If there are no errors the backend should output the following message instead.  
```{"type":"Success"}```  

All messages can have additional fields, however, they will not be regarded by the IDE.  

### 5.2 Output behaviour for the advanced features:

In order to use the advanced features of the IDE, the backend must create additional output.

The symbolic execution log is expected to be stored in the file ```./.vscode/executionTreeData.js```

