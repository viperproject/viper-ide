'use strict';

import * as $ from 'jquery';
import { Logger } from './logger';
import JSONFormatter, { JSONFormatterConfiguration } from 'json-formatter-js';

declare var acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();
let outpudDiv: HTMLElement;

/** Sets up the debugger pane */ 
function activate() {
    Logger.debug("Setting up debug pane");

    // TODO: Better ways to handle this?
    var e = document.getElementById("output");
    if (!e) {
        Logger.error("Could not find the output div, exiting");
        return;
    } else {
        outpudDiv = e;
    }

    setupMessageHandlers();
    setupButtonHandlers();

    outpudDiv.innerHTML += "<p>Viper Debugger Started</p>";

    $(document).keydown(function(e) {
        switch (e.key) {
            case 'F10': // F10        
                outpudDiv.innerHTML += "<p>F10 from panel</p>";
                break;
            default: // F10        
                outpudDiv.innerHTML += "<p>" + e.key + " from panel</p>";
                break;
        }
    });

    Logger.debug("Done setting up debug pane");
}

/** Sets up the handlers for messages coming from the extension. */
function setupMessageHandlers() {
    Logger.debug("Setting up message handlers");

    // TODO: Do we want a way to consume events and to log unhandled ones?
    function on(key: string, callback: (message: any) => void) {
        window.addEventListener('message', e => {
            let message = e.data;
            if (message.type === key) {
                callback(message);
            }
        });
    }

    on('logMessage', message => outpudDiv.innerHTML += "<p>" + message.text + "</p>");
    on('addSymbolicExecutionEntry', message => {
        //outpudDiv.innerHTML += "<pre>" + message.data + "</pre>";
        const openLevel = 3;
        const config: JSONFormatterConfiguration = {
           animateOpen: false,
           animateClose: false,
           theme: 'dark'
        };
        const f = new JSONFormatter(message.data, openLevel, config);
        outpudDiv.appendChild(f.render());
    });

    Logger.debug("Done setting up message handlers.");
}

/** Sets up handlers for button events in the debugger pane. */
function setupButtonHandlers() {
    Logger.debug("Setting up button handlers.");

    let button = (id: string) => {
        let b = document.getElementById(id);
        if (b) {
            return { onClick: (f: () => void) => b!.onclick = f };
        } else {
            Logger.error(`Button '${id}' was not found in the '${document.baseURI}' document.`);
            return { onClick: (f: () => void) => {} };
        }
    };

    button('stopDebugger').onClick(() => vscode.postMessage({ command: 'stopDebugger' }));

    Logger.debug("Done setting up button handlers.");
}


// Set up the debugger pane
activate();
