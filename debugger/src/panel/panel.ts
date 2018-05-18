'use strict';

import * as $ from 'jquery';
import { Logger } from './logger';
import JSONFormatter, { JSONFormatterConfiguration } from 'json-formatter-js';

declare var acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();
let outpudDiv: HTMLElement;
const JsonFormatConfiguration: JSONFormatterConfiguration = {
    animateOpen: false,
    animateClose: false,
    theme: 'dark'
};

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
    on('stateUpdate', (message) => state(message));
    on('verifiables', (message) => {
        const dropdown = $('#verifiables');
        const options = message.data.map((verifiable: any) => {
            return $('<option />').text(verifiable.name)
                                  .attr('value', verifiable.name);
        });

        dropdown.empty();

        options[0].attr('selected', true);
        dropdown.append(options);

        // Only allow accessing the dropdown if there is more than one choice
        dropdown.prop('disabled', (options.length <= 1));

        dropdown.change((event) => { 
            const name = $('#verifiables').val();
            vscode.postMessage({ command: 'selectVerifiable', data: name });
        });
    });

    Logger.debug("Done setting up message handlers.");
}


function state(message: any) {
    const state = message.data.current;
    const stateDiv = $('#currentState');
    stateDiv.empty();

    if (!state) {
        return;
    }

    if (state.type && state.type !== 'None') {
        stateDiv.removeClass();
        stateDiv.addClass(state.type.toLowerCase());
        const elem = $('<h3>' + state.type + '</h3>');
        stateDiv.append(elem);
    } else {
        stateDiv.removeClass();
        stateDiv.addClass('noAction');
        const elem = $('<h3>' + state.kind + '</h3>');
        stateDiv.append(elem);
    }

    const openLevel = 1;
    const current = new JSONFormatter(state, openLevel, JsonFormatConfiguration);
    const pre = $('<pre></pre>').append(current.render());
    stateDiv.append(pre);
}


/** Sets up handlers for button events in the debugger pane. */
function setupButtonHandlers() {
    Logger.debug("Setting up button handlers.");

    $('#next:button').click(() => vscode.postMessage({ command: 'nextState' }));
    $('#previous:button').click(() => vscode.postMessage({ command: 'previousState' }));
    $('#child:button').click(() => vscode.postMessage({ command: 'childState' }));
    $('#parent:button').click(() => vscode.postMessage({ command: 'parentState' }));

    Logger.debug("Done setting up button handlers.");
}


// Set up the debugger pane
activate();
