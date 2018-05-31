'use strict';

import * as $ from 'jquery';
import { Logger } from './logger';
import JSONFormatter, { JSONFormatterConfiguration } from 'json-formatter-js';
import * as d3 from 'd3';
import * as Split from 'split.js';
import { DefaultLinkObject } from 'd3';

declare var acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();
let outpudDiv: HTMLElement;
const JsonFormatConfiguration: JSONFormatterConfiguration = {
    animateOpen: false,
    animateClose: false,
    theme: 'dark'
};
let shit: vis.Network;

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

    let panels: HTMLElement[] = $('.panel').toArray();

    let isCollapsed = panels.map(e => e.classList.contains('collapsedByDefault'));
    console.log(panels.map(e => e.classList));
    // This is basically a fold
    let numberOfCollapsedPanels = isCollapsed.reduce((tot, collapsed) => collapsed ? tot + 1 : tot, 0);
    let percentForOpenPanel = 100 / (panels.length - numberOfCollapsedPanels);
    let sizes = isCollapsed.map(e => e ? 0 : percentForOpenPanel);

    let splitInstance = Split(panels, {
        sizes: sizes,
        direction: 'vertical',
        cursor: 'row-resize',
        gutterSize: 5,
        minSize: 0,
        snapOffset: 60,  // When a panel is less than this, it closes
    });

    setupMessageHandlers();
    setupButtonHandlers();

    outpudDiv.innerHTML += "<p>Viper Debugger Started</p>";

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

    Logger.debug("Done setting up debug pane");
}

function clear() {
    $('#currentState').empty();
}

/** Sets up the handlers for messages coming from the extension. */
function setupMessageHandlers() {
    Logger.debug("Setting up message handlers");

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
        const verifiables: any[] = message.data;
        const options = verifiables.map( (v) => $('<option />')
                                                    .text(v.name)
                                                    .attr('value', v.name) );

        const dropdown = $('#verifiables');
        dropdown.empty();

        // Handler for the selection change
        dropdown.change((event) => { 
            const name = $('#verifiables').val();
            vscode.postMessage({ command: 'selectVerifiable', data: name });
        });

        console.log(options);

        if (options.length > 0) {
            dropdown.append(options);
            dropdown.prop('disabled', false);

            // Trigger updating panel to the first verifiable
            options[0].change();
        } else {
            dropdown.prop('disabled', true);
            clear();
        }
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

    let data = message.data;
    $('button#next').prop('disabled', !data.hasNext);
    $('button#previous').prop('disabled', !data.hasPrevious);
    $('button#parent').prop('disabled', !data.hasParent);
    $('button#child').prop('disabled', !data.hasChild);

    let visData = [
        {name: 'var1'},
        {name: 'var2'},
        {name: 'var3'},
        {name: 'var4'},
        {name: 'var5'},
    ];


    let svg = d3.select('#graphPanel')
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%');
    
    let storeGraph = svg.append('g')

    storeGraph.append('svg:text')
              .attr('x', 10)
              .attr('y', 20)
              .attr('id', 'storeLabel')
              .attr('font-size', '20px')
              .attr('font-weight', 'bold')
              .attr('text-decoration', 'underline')
              .attr('fill', '#fff')
              .text("STORE");

    let link = d3.linkHorizontal();
    let stuff: DefaultLinkObject = {
        source: [80, 90],
        target: [180, 230]
    }

    storeGraph.append('path')
        .attr('d', link(stuff)!)
        .attr('stroke', 'blue')
        .attr('stroke-width', '3px')
        .attr('fill', 'none');

    storeGraph.selectAll('text')
        .data(visData)
        .enter()
        .append('svg:text')
        .attr('x', (datum, index) => 10)
        .attr('y', (datum, index) => 30 + index * 20)
        .attr('fill', '#fff')
        .text((datum) => `${datum}`);
    
    const openLevel = 4;
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
