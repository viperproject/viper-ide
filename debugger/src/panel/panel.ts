import * as $ from 'jquery';
import { Logger } from './logger';
import JSONFormatter, { JSONFormatterConfiguration } from 'json-formatter-js';
import * as Split from 'split.js';
import * as d3 from 'd3';
import { GraphViz } from './d3-graphviz';
import { line } from 'd3';
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

    Split(panels, {
        sizes: sizes,
        direction: 'vertical',
        cursor: 'row-resize',
        gutterSize: 5,
        minSize: 0,
        snapOffset: 40,  // When a panel is less than this, it closes
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

    on('logModel', message => handleModelMessage(message));
    on('displayGraph', message => displayGraph(message));
    on('clearGraph', _ => clearGraph());
    on('graphMessage', message => graphMessage(message));
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

    function toggleSection(buttonId: string, sectionId: string) {
        const section = $(sectionId);
        section.toggleClass('hide');
        if (section.hasClass('hide')) {
            $(buttonId).text("Show");
        } else {
            $(buttonId).text("Hide");
        }
    }

    $('#toggleAlloyModel:button').click(() => toggleSection('#toggleAlloyModel:button', '#alloyModel'));
    $('#toggleSymbExLog:button').click(() => toggleSection('#toggleSymbExLog:button', '#symbExLog'));
    $('#copyAlloyModel:button').click(() => {
        var $temp = $("<textarea>");
        $("body").append($temp);
        $temp.val($("#alloyModel").text()).select();
        document.execCommand("copy");
        $temp.remove();
    });

    // Enable/disable state navigation via mouse
    // The message is delivered to the DecorationsManager via the DebuggerPanel, on "the extension side"
    $('#mouseNavigation').change((event) => {
        let input = $(event.currentTarget);
        vscode.postMessage({ command: 'mouseNavigation', value: input.prop('checked')});
    });

    // Setup handler for the selection change
    $('#verifiables').change((event) => { 
        const name = $('#verifiables').val();
        vscode.postMessage({ command: 'selectVerifiable', data: name });
    });

    Logger.debug("Done setting up input handlers.");
}


function setupGraph() {
    // Ensures that when we actually draw the graph we have a renderer instance ready
    graph = d3.select("#graph").graphviz();
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
    if (state.type) {
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

    if (state.children.length > 0) {
        stateDiv.append($('<h4>Children</h4>'));
        // Update the JSON view of the state tree
        const openLevel = 0;
        const current = new JSONFormatter(state.children, openLevel, JsonFormatConfiguration);
        const pre = $('<pre></pre>').addClass('json').append(current.render());
        stateDiv.append(pre);
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
    // TODO: Reemove this and log it to the diagnostics panel
    console.log(message.text);

    clearGraph();
    $('#graphPanel').append($('<div id="graph"></div>').hide());

    graph = d3.select("#graph")
                .graphviz()
                .dot(message.text)
                .render();
    
    $("#graph").fadeIn(30);
}


function clearGraph() {
    $('#graphPanel').empty();
}


function graphMessage(message: any) {
    const panel = $('#graphPanel');
    clearGraph();
    const messageItem = $('<div></div>').addClass('graphMessage').text(message.text).hide().delay(500).fadeIn(200);
    panel.append(messageItem);
}

/** Handles the message containing new verifiables for this session. */
function handleVerifiableUpdate(verifiables: any[]) {
    const options = verifiables.map((v) => $('<option />').text(v.name)
                                                          .attr('value', v.name));
    const dropdown = $('#verifiables');
    const selected = dropdown.val();
    dropdown.empty();

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
    $('#symbExLog').empty().append(pre);
}


// TODO: Remove this later on
function handleModelMessage(message: any) {
    $('#alloyModel').empty();
    // const lines = message.text.split("\n");
    // const margin = ' '.repeat(lines.length.toString().length);
    // const model = lines.map((line: string, index: number, _: any) => {
    //                               const lineNr = (margin + (index + 1)).slice(-3);
    //                               return`${lineNr} ▏${line}`;
    //                             })
    //                           .join("\n");
    const model = message.text;

    $("#alloyModel").append($("<pre></pre>").text(model));
}


// Start up the debugger pane
activate();
