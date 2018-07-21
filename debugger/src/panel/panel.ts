import * as $ from 'jquery';
import { Logger } from './logger';
import JSONFormatter, { JSONFormatterConfiguration } from 'json-formatter-js';
import * as Split from 'split.js';
import * as d3 from 'd3';
import { GraphViz } from './d3-graphviz';
var d3graphviz = require('d3-graphviz');

declare var acquireVsCodeApi: any;
export const vscode = acquireVsCodeApi();

let outpudDiv: HTMLElement;
const JsonFormatConfiguration: JSONFormatterConfiguration = {
    animateOpen: false,
    animateClose: false,
    theme: 'dark'
};
let graph: GraphViz | undefined;

/** Sets up the debugger pane */ 
function activate() {
    Logger.debug("Setting up debug pane");

    setupPanelSplits();
    setupMessageHandlers();
    setupInputHandlers();
    // setupGraph();

    Logger.debug("Done setting up debug pane");
};


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
    on('logModel', message => handleModelMessage(message));
    on('displayGraph', message => displayGraph(message));
    on('stateUpdate', message => handleStateUpdate(message));
    on('verifiables', message => handleVerifiableUpdate(message.data));
    on('symbExLogEntries', message => handleSymbExLogEntries(message));
    Logger.debug("Done setting up message handlers.");
}


/** Sets up handlers for button events in the debugger pane. */
function setupInputHandlers() {
    Logger.debug("Setting up input handlers.");

    // TODO: Proper key handling
    // $(document).keydown(function(e) {
    //     switch (e.key) {
    //         case 'F10': // F10        
    //             outpudDiv.innerHTML += "<p>F10 from panel</p>";
    //             break;
    //         default: // F10        
    //             outpudDiv.innerHTML += "<p>" + e.key + " from panel</p>";
    //             break;
    //     }
    // });

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
    // Ensures that when we actually draw the graph we have a renderer instance ready
    graph = d3.select("#graph").graphviz();
    
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
        elem.append($(`<pre>${state.formula}</pre>`));
        stateDiv.append(elem);
    }

    // Enable/disable navigation buttons according to parent/siblings/children
    let data = message.data;
    $('button#next').prop('disabled', !data.hasNext);
    $('button#previous').prop('disabled', !data.hasPrevious);
    $('button#parent').prop('disabled', !data.hasParent);
    $('button#child').prop('disabled', !data.hasChild);

    if (state.children.length > 0) {
        stateDiv.append($('<h4>Children</h4>'));
        // Update the JSON view of the state tree
        const openLevel = 0;
        const current = new JSONFormatter(state.children, openLevel, JsonFormatConfiguration);
        const pre = $('<pre></pre>').addClass('json').append(current.render());
        stateDiv.append(pre);
    }

    type parts = { text: string, id?: string }[];

    if (state.state.heap.length > 0) {
        stateDiv.append('<h4>Heap</h4>');
        state.state.heap.forEach((vs: parts) => {
            const line = $(`<pre></pre>`);
            vs.forEach(v => {
                const elem = $(`<span>${v.text}</span>`);
                if (v.id !== undefined) {
                    elem.addClass('highlightable');
                    elem.attr('highlightId',v.id);
                }
                line.append(elem);
            });
            stateDiv.append(line);
        });
    }

    if (state.state.store.length > 0) {
        stateDiv.append('<h4>Store</h4>');
        state.state.store.forEach((vs: parts) => {
            const line = $(`<pre></pre>`);

            vs.forEach(v => {
                const elem = $(`<span>${v.text}</span>`);
                if (v.id !== undefined) {
                    elem.addClass('highlightable');
                    elem.attr('highlightId',v.id);
                }
                line.append(elem);
            });

            stateDiv.append(line);
        });
    }

    if (state.state.pathConditions.length > 0) {
        stateDiv.append('<h4>Path Conditions</h4>');
        state.state.pathConditions.forEach((vs: parts) => {
            const line = $(`<pre></pre>`);
            vs.forEach(v => {
                const elem = $(`<span>${v.text}</span>`);
                if (v.id !== undefined) {
                    elem.addClass('highlightable');
                    elem.attr('highlightId',v.id);
                }
                line.append(elem);
            });
            stateDiv.append(line);
        });
    }

    $('.highlightable').hover(
        (e) => {
            const id = $(e.currentTarget).attr('highlightId');
            $(`span[highlightId='${id}']`).addClass('highlighted');
        },
        (e) => {
            const id = $(e.currentTarget).attr('highlightId');
            $(`span[highlightId='${id}']`).removeClass('highlighted');
        }
    );
}


function displayGraph(message: any) {
    // Retreieve the renderer instance created in the setup and display the graph
    console.log(message.text);

    $('#graph').remove();
    $('#graphPanel').append($('<div id="graph"></div>'));

    graph = d3.select("#graph")
                .graphviz()
                .dot(message.text)
                .render();
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

        // TODO: It looks like the first verifiable is selected by default and then switched to the previous one
        // Re-select the previously selected verifiable if possible
        let elem = options.find(e => e.val() === selected);
        if (elem) {
            dropdown.val(elem.val()!);
        } else {
            // Trigger updating panel to the first verifiable
            dropdown.val(options[0].val()!);
        }
        dropdown.trigger('change');
    } else {
        dropdown.prop('disabled', true);
        $('#currentState').empty();
    }
}

function handleSymbExLogEntries(message: any) {
    const options: JSONFormatterConfiguration = {
        animateOpen: false,
        animateClose: false,
        theme: 'dark'
    };

    // Update the JSON view of the state tree
    const current = new JSONFormatter(message.text, 1, options);
    const pre = $('<pre></pre>').addClass('json').append(current.render());
    $('#symbExLogPanel').empty().append(pre);
}


/** Handles messages being logged to the output split in the debug pane. */
function handleOutputMessage(message: any) {
    $("#output").append($("<p></p>").text(message.text));
}


// TODO: Remove this later on
function handleModelMessage(message: any) {
    $('#output pre.alloyModel').remove();
    $("#output").append($("<pre></pre>").addClass('alloyModel').text(message.text));
}


// Start up the debugger pane
activate();
