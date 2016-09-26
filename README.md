Visual Studio Code is a powerful GUI text editor which is a base for implementing features of an integrated verification environment for the Silver language.

This repository contains the source files of the VS Code Extension, installation instructions, and the needed files for installing it on OsX, Debian, and Windows.

### Installation ###

#### 1. Install VS Code

You can download the installer for VS Code from here: https://code.visualstudio.com/download

#### 2. Create jar-files for verification backends

Assemble (or otherwise obtain) a fat jar for each Viper backend (Silicon, Carbon, ...) you want to use from the IDE.

To assemble a fat jar, cd into the backend's checkout directory and run
```bash
$ sbt assembly
```
If successful, the assembled fat jar should be at `./target/scala-2.11/<backend>.jar`.

Put all the jars in your user's default java extentions directory. For example, if
you have a assembled `silicon.jar`, you should do the following:

```bash
$ mkdir -p ~/Library/Java/Extensions
$ cp ~/viper/silicon/target/scala-2.11/silicon.jar ~/Library/Java/Extensions
```

#### 3. Install nailgun

Optionally, if you don't want to wait for a few seconds for each verification procedure
(known as the JVM startup overhead), install [nailgun](http://martiansoftware.com/nailgun):

```bash
$ mkdir -p ~/viper/tools/nailgun
$ cd ~/viper/tools/nailgun
$ git clone https://github.com/martylamb/nailgun.git .
$ make && sudo make install
```

This will install the nailgun client, which could be used through the ```ng``` command.

In order to install the server, one should get Apache Maven. Download the archive with
Maven binaries from here: http://maven.apache.org/download.cgi
(the current version is 3.3.3).

```bash
$ mkdir ~/viper/tools/maven
$ unzip ~/Downloads/apache-maven-3.3.3-bin.zip -d ~/viper/tools/maven
$ ../maven/bin.mvn dependency::tree
$ cp nailgun-server-0.9.2-SNAPSHOT.jar ~/Library/Java/Extensions
```

#### 4. Install the Extension

install the viper IVE extension using the command pallete (f1 or ctrl+alt+p/cmd+alt+p) ```ext install viper-ive```

#### 5. Setup the IDE

Start VS Code and the folder in which you would like to work on your viper source code files.  
Open the settings through the menu or using the command pallete (f1 or ctrl+alt+p/cmd+alt+p) ```settings```  
You can either open the user settings which are valid for this user or you can open the workspace settings which are only valid for the currently open folder.  

Copy the iveSettings from the default settings to your own settings.  
You need to specify at least one verificationBackend, (the first one will be used for verification) and point to the Nailgun server.  
The paths to the jar files can be either set as an Environment Variable or explicitly as paths.
The nailgun client needs to be in the Path Environment Variable.

#### 5. Run the IDE

Start VS Code and as soon as a ```.sil``` source file is opened the extension is activated.  
When the file is saved the verification is triggered.