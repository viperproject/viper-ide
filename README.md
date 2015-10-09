Sublime Text is a powerful GUI text editor which is a base for implementing features of an integrated development environment for Silver lagnuage.

This repository contains files required for installing Viper extensions for Sublime Text on OS X.

### Installation ###

The instructions in this section are checked on Mac OS X 10.11, but they should work
on Linux as well (modulo the system paths).

#### 1. Install Sublime

You can download the latest version from here: http://www.sublimetext.com/3

Viper-Sublime-IDE requires Sublime Text 3 and will not work with Sublime Text 2.


#### 2. Get the IDE files

Clone this repository to the Sublime Packages directory:

```bash
$ cd ~/Library/Application\ Support/Sublime\ Text\ 3/Packages
$ hg clone ssh://hg@bitbucket.org/viperproject/viper-sublime-ide Silver
```

#### 3. Create jar-files for verification backends

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

#### 4. Install nailgun

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

Finally, run the following command to start nailgun-server:

```bash
$ java com.martiansoftware.nailgun.NGServer
```

#### 5. Run the IDE

Run Sublime Text and open a ```.sil``` source file. To verify a Silver program,
choose the right Viper backend from the menu (Tools-Build With...). Make sure that
the correct build system is selected (Tools-Build System-Silver).


Please find more detailed instructions on the Viper Wiki: https://bitbucket.org/viperproject/documentation/wiki/browse/