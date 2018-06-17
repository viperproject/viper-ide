'use strict';

import * as $ from 'jquery';
import { Logger } from './logger';
import JSONFormatter, { JSONFormatterConfiguration } from 'json-formatter-js';
import * as Split from 'split.js';

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

    setupPanelSplits();
    setupMessageHandlers();
    setupInputHandlers();
    setupGraph();

    Logger.debug("Done setting up debug pane");
}


/** Sets up the splits in the debug pane.  */
function setupPanelSplits() {
    let panels: HTMLElement[] = $('.panel').toArray();

    // Determine how many panels are opened by default, so we can compute the size of each open panel
    let isCollapsed = panels.map(e => e.classList.contains('collapsedByDefault'));
    // This is basically a fold
    let numberOfCollapsedPanels = isCollapsed.reduce((tot, collapsed) => collapsed ? tot + 1 : tot, 0);
    let percentForOpenPanel = 100 / (panels.length - numberOfCollapsedPanels);
    let sizes = isCollapsed.map(e => e ? 0 : percentForOpenPanel);

    let splitInstance = Split(panels, {
        sizes: sizes,
        direction: 'vertical',
        cursor: 'row-resize',
        gutterSize: 3,
        minSize: 0,
        snapOffset: 60,  // When a panel is less than this, it closes
    });
}


/** Sets up the handlers for messages coming from the extension. */
function setupMessageHandlers() {
    Logger.debug("Setting up message handlers");

    // Helper function for setting callbacks
    function on(key: string, callback: (message: any) => void) {
        window.addEventListener('message', e => {
            let message = e.data;
            if (message.type === key) {
                callback(message);
            }
        });
    }

    on('logMessage', message => handleOutputMessage(message));
    on('stateUpdate', message => handleStateUpdate(message));
    on('verifiables', message => handleVerifiableUpdate(message.data));

    Logger.debug("Done setting up message handlers.");
}


/** Sets up handlers for button events in the debugger pane. */
function setupInputHandlers() {
    Logger.debug("Setting up input handlers.");

    // TODO: Proper key handling
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

    // Send navigation actions
    // The message is delivered to the DebuggerSession via the DebuggerPanel, on "the extension side"
    $('#next:button').click(() => vscode.postMessage({ command: 'nextState' }));
    $('#previous:button').click(() => vscode.postMessage({ command: 'previousState' }));
    $('#child:button').click(() => vscode.postMessage({ command: 'childState' }));
    $('#parent:button').click(() => vscode.postMessage({ command: 'parentState' }));

    // Enable/disable state navigation via mouse
    // The message is delivered to the DecorationsManager via the DebuggerPanel, on "the extension side"
    $('#mouseNavigation').change((event) => {
        let input = $(event.currentTarget);
        vscode.postMessage({ command: 'mouseNavigation', value: input.prop('checked')});
    });

    Logger.debug("Done setting up input handlers.");
}


function setupGraph() {
    // var d3 = require('d3');
    // var d3graphviz = require('d3-graphviz');

    // d3.select("#graph")
    //     .graphviz()
    //         .dot('digraph {a -> b}')
    //         .render()
    
    // var drag = d3.drag()
    //     .on("drag", dragmove);
    
    // d3.select('ellipse')
    //     .style('fill', '#f00')
    //     .call(drag);

    // function dragmove(this: any, d: any, i: any, n: any) {
    //     console.log(d3.event);
    //     d3.select(this)
    //         .attr("transform", `translate(${d3.event.x},${d3.event.y})`);
    // }
}


/** Handles the change of current state being debugged. */
function handleStateUpdate(message: any) {
    // TODO: Clean this up.
    const state = message.data.current;
    const stateDiv = $('#currentState');
    stateDiv.empty();

    if (!state) {
        Logger.error(`Received state update message with no state: '${message}'`);
        return;
    }

    // Add state type to the panel
    if (state.type && state.type !== 'None') {
        stateDiv.removeClass();
        stateDiv.addClass(state.type.toLowerCase());
        const elem = $(`<h3>(${state.index}) ${state.type}</h3>`);
        stateDiv.append(elem);
    } else {
        stateDiv.removeClass();
        stateDiv.addClass('noAction');
        const elem = $(`<h3>(${state.index}) ${state.kind}</h3>`);
        stateDiv.append(elem);
    }

    // Enable/disable navigation buttons according to parent/siblings/children
    let data = message.data;
    $('button#next').prop('disabled', !data.hasNext);
    $('button#previous').prop('disabled', !data.hasPrevious);
    $('button#parent').prop('disabled', !data.hasParent);
    $('button#child').prop('disabled', !data.hasChild);
    
    // Update the JSON view of the state tree
    const openLevel = 4;
    const current = new JSONFormatter(state, openLevel, JsonFormatConfiguration);
    const pre = $('<pre></pre>').append(current.render());
    stateDiv.append(pre);
}


/** Handles the message containing new verifiables for this session. */
function handleVerifiableUpdate(verifiables: any[]) {
    const options = verifiables.map((v) => $('<option />').text(v.name)
                                                          .attr('value', v.name));
    const dropdown = $('#verifiables');
    const selected = dropdown.val();
    dropdown.empty();

    // Setup handler for the selection change
    dropdown.change((event) => { 
        const name = $('#verifiables').val();
        vscode.postMessage({ command: 'selectVerifiable', data: name });
    });

    // Set the options, if any
    if (options.length > 0) {
        dropdown.append(options);
        dropdown.prop('disabled', false);

        // Re-select the previously selected verifiable if possible
        let elem = options.find(e => e.val() === selected);
        if (elem) {
            dropdown.val(elem.val()!);
        } else {
            // Trigger updating panel to the first verifiable
            options[0].change();
        }
    } else {
        dropdown.prop('disabled', true);
        $('#currentState').empty();
    }
}


/** Handles messages being logged to the output split in the debug pane. */
function handleOutputMessage(message: any) {
    $("#output").append($("<p></p>").text(message.text));
}


// Start up the debugger pane
activate();
