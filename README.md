[![Test Status](https://github.com/viperproject/viper-ide/workflows/test/badge.svg?branch=master)](https://github.com/viperproject/viper-ide/actions?query=workflow%3Atest+branch%3Amaster)
[![License: MPL 2.0](https://img.shields.io/badge/License-MPL%202.0-brightgreen.svg)](./LICENSE)

This VS Code extension provides interactive IDE features for [Viper](http://viper.ethz.ch) — the Verification Infrastructure for Permission-based Reasoning. 

### Dependencies ###

The extension automatically downloads and manages Viper (via publicly available links, as listed here: http://viper.ethz.ch/downloads/). 

Viper IDE uses an open-source 64-bit [Java server](https://github.com/viperproject/viperserver), so you need Java installed to be able to run it. 

Please **always** refer to the official [installation instructions](http://viper.ethz.ch/downloads) for more details (in particular, about defferent operating system support). 

### Using Viper ###

If you would like to learn more about Viper, please start with our extensive [tutorial](http://viper.ethz.ch/tutorial/). 

### Debugging verification failures ###

[Lizard](https://github.com/viperproject/lizard) is a (visual) verification debugger prototype for Viper IDE. It aims at simplifying the understanding of verification failures by converting SMT models to counterexample diagrams that are shown next to the code. 
