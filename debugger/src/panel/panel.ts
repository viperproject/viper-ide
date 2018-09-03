// import * as $ from 'jquery';
import { Logger } from './logger';
import JSONFormatter, { JSONFormatterConfiguration } from 'json-formatter-js';
import * as Split from 'split.js';
import * as d3 from 'd3';
import { GraphViz } from './d3-graphviz';
var d3graphviz = require('d3-graphviz');

declare var acquireVsCodeApi: any;
export const vscode = acquireVsCodeApi();

const domElem = (q: string) => document.querySelector<HTMLElement>(q)!;
function removeAllChildren(elem: HTMLElement) {
    while (elem.firstChild) {
        elem.removeChild(elem.firstChild);
    }
}

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

    Logger.debug("Done setting up debug pane");
}


/** Sets up the splits in the debug pane.  */
function setupPanelSplits() {
    let panels: HTMLElement[] = [...document.querySelectorAll<HTMLElement>('.panel')!];

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
    on('symbExLogMessage', message => handleSymbExLogMessage(message));
    on('alloyInstanceMessage', message => handleAlloyInstanceMessage(message));
    Logger.debug("Done setting up message handlers.");
}

// TODO: keyboard events from panel?
/** Sets up handlers for button events in the debugger pane. */
function setupInputHandlers() {
    Logger.debug("Setting up input handlers.");

    // Send navigation actions
    // The message is delivered to the DebuggerSession via the DebuggerPanel, on "the extension side"
    domElem('button#next').onclick = () => vscode.postMessage({ command: 'nextState' });
    domElem('button#previous').onclick = () => vscode.postMessage({ command: 'previousState' });
    domElem('button#child').onclick = () => vscode.postMessage({ command: 'childState' });
    domElem('button#parent').onclick = () => vscode.postMessage({ command: 'parentState' });

    function toggleSection(buttonId: string, sectionId: string) {
        const section = domElem(sectionId);
        section.classList.toggle('hide');
        if (section.classList.contains('hide')) {
            domElem(buttonId).innerText = "Show";
        } else {
            domElem(buttonId).innerText = "Hide";
        }
    }

    domElem('span#toggleExecutionRecords').onclick = () => toggleSection('span#toggleExecutionRecords', '#navigation');
    domElem('button#toggleAlloyModel').onclick = () => toggleSection('button#toggleAlloyModel', '#alloyModel');
    domElem('button#toggleSymbExLog').onclick = () => toggleSection('button#toggleSymbExLog', '#symbExLog');
    domElem('button#toggleAlloyInstance').onclick = () => toggleSection('button#toggleAlloyInstance', '#alloyInstance');
    domElem('button#toggleDotGraphSource').onclick = () => toggleSection('button#toggleDotGraphSource', '#dotGraphSource');
    domElem('button#copyAlloyModel').onclick = () => {
        const temp = document.createElement('textarea');
        domElem('body').appendChild(temp);
        temp.value = domElem('#alloyModel').innerText;
        temp.select();
        document.execCommand('copy');
        temp.remove();
    };

    // Enable/disable state navigation via mouse
    // The message is delivered to the DecorationsManager via the DebuggerPanel, on "the extension side"
    domElem('#mouseNavigation').onchange = (event) => {
        if (event.currentTarget) {
            let input = <HTMLInputElement> event.currentTarget;
            vscode.postMessage({ command: 'mouseNavigation', value: input.checked });
        }
    };
    // Setup handler for the selection change
    domElem('#verifiables').onchange = (event) => { 
        const name = (domElem('#verifiables') as HTMLSelectElement).selectedOptions.item(0).value;
        vscode.postMessage({ command: 'selectVerifiable', data: name });
    };

    Logger.debug("Done setting up input handlers.");
}

/** Handles the change of current state being debugged. */
function handleStateUpdate(message: any) {
    const state = message.data.current;

    if (!state) {
        Logger.error(`Received state update message with no state: '${message}'`);
        return;
    }

    const stateDiv = domElem('#currentState');
    removeAllChildren(stateDiv);

    // Add state type to the panel
    if (state.type) {
        const elem = document.createElement('h3');
        elem.innerText = `Current Record: ${state.type}`;

        const formula = document.createElement('pre');
        formula.innerText = state.formula;
        elem.appendChild(formula);

        stateDiv.appendChild(elem);
    }

    // Enable/disable navigation buttons according to parent/siblings/children
    let data = message.data;
    (domElem('button#next') as HTMLInputElement).disabled = !data.hasNext;
    (domElem('button#previous') as HTMLInputElement).disabled = !data.hasPrevious;
    (domElem('button#parent') as HTMLInputElement).disabled = !data.hasParent;
    (domElem('button#child') as HTMLInputElement).disabled = !data.hasChild;

    updateNavigationTree(state, message.data.topLevel);

    type parts = { text: string, id?: string }[];
    if (state.state.heap.length > 0) {
        const title = document.createElement('h4');
        title.innerText = 'Heap';
        stateDiv.appendChild(title);
        state.state.heap.forEach((vs: parts) => {
            const line = document.createElement('pre');
            vs.forEach(v => {
                const elem = document.createElement('span') ;
                elem.innerText = v.text;
                if (v.id !== undefined) {
                    elem.classList.add('highlightable');
                    elem.setAttribute('highlightId',v.id);
                }
                line.appendChild(elem);
            });
            stateDiv.appendChild(line);
        });
    }

    if (state.state.store.length > 0) {
        const title = document.createElement('h4');
        title.innerText = 'Store';
        stateDiv.appendChild(title);
        state.state.store.forEach((vs: parts) => {
            const line = document.createElement('pre');

            vs.forEach(v => {
                const elem = document.createElement('span');
                elem.innerText = v.text;
                if (v.id !== undefined) {
                    elem.classList.add('highlightable');
                    elem.setAttribute('highlightId',v.id);
                }
                line.appendChild(elem);
            });

            stateDiv.appendChild(line);
        });
    }

    if (state.state.pathConditions.length > 0) {
        const title = document.createElement('h4');
        title.innerText = 'Path Conditions';
        stateDiv.appendChild(title);
        state.state.pathConditions.forEach((vs: parts) => {
            const line = document.createElement('pre');
            vs.forEach(v => {
                const elem = document.createElement('span');
                elem.innerText = v.text;
                if (v.id !== undefined) {
                    elem.classList.add('highlightable');
                    elem.setAttribute('highlightId',v.id);
                }
                line.appendChild(elem);
            });
            stateDiv.appendChild(line);
        });
    }

    domElem('.highlightable').onmouseover = (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('highlightId');
        const span = document.createElement('span');
        domElem(`span[highlightId='${id}']`).classList.add('highlighted');
    };

    domElem('.highlightable').onmouseout = (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('highlightId');
        const span = document.createElement('span');
        domElem(`span[highlightId='${id}']`).classList.remove('highlighted');
    };
}


function updateNavigationTree(state: any, topLevel: any[]) {
    const doYourStuff = (record: any): [HTMLLIElement, boolean] => {
        const li = document.createElement('li');
        const span = document.createElement('span');
        span.innerText = record.type + ":";
        const pre = document.createElement('pre');
        pre.innerText = record.formula;
        span.appendChild(pre);
        li.appendChild(span);

        if (state.index === record.index) {
            li.id = "current";

            if (state.children.length > 0) {
                const childrenList = document.createElement('ul');
                childrenList.classList.add('nested');

                state.children.forEach((e: any) => {
                    const li = document.createElement('li');
                    const span = document.createElement('span');
                    span.classList.add("stateLink");
                    span.onclick = () => vscode.postMessage({ command: 'goToStateByIndex', data: e.index });
                    span.innerText = e.type + ":";
                    const pre = document.createElement('pre');
                    pre.innerText = e.formula;
                    span.appendChild(pre);
                    li.appendChild(span);
                    childrenList.appendChild(li);
                });
                li.appendChild(childrenList);
            }

            return [li, true];
        }

        span.classList.add("stateLink");
        span.onclick = () => vscode.postMessage({ command: 'goToStateByIndex', data: record.index });

        let children: HTMLLIElement[] = [];
        let holdsCurrent = false;
        record.children.forEach((c: any) => {
            const [n, holdsCurr] = doYourStuff(c);
            holdsCurrent = holdsCurrent || holdsCurr;
            children.push(n);
        });

        if (holdsCurrent) {
            const ul = document.createElement('ul');
            ul.classList.add('nested');
            children.forEach(c => ul.appendChild(c));
            li.appendChild(ul);
        } else {
            const childNumber = document.createElement('span');
            childNumber.classList.add('childrenNumber');
            childNumber.innerText = (record.children.length === 1 ? '(1 child)' : `(${record.children.length} children)`);
            span.appendChild(childNumber);
        }
        return [li, holdsCurrent];
    };

    const navigator = domElem("#navigation");
    removeAllChildren(navigator);
    const topLevelList = document.createElement('ul');
    
    topLevel.forEach((tl: any) => {
        const [node, _] = doYourStuff(tl);
        topLevelList.appendChild(node);
    });
    navigator.appendChild(topLevelList);

}


function displayGraph(message: any) {
    const pre = document.createElement('pre');
    pre.classList.add('json');
    pre.innerText = message.text;

    const dotGraphSource = domElem('#dotGraphSource');
    removeAllChildren(dotGraphSource);
    dotGraphSource.appendChild(pre);

    clearGraph();
    const graphElem = document.createElement('div');
    graphElem.id = 'graph';
    graphElem.style.opacity = '0';
    graphElem.style.transition = 'opacity 0.03s ease-in-out 0';
    domElem('#graphPanel').appendChild(graphElem);

    const some = d3.select("#graph");
    console.log(some);

    graph = some
                .graphviz()
                .dot(message.text)
                .render();

    window.setTimeout(() => graphElem.style.opacity = '1', 100);
}


function clearGraph() {
    const graphPanel = domElem('#graphPanel');
    removeAllChildren(graphPanel);
}


function graphMessage(message: any) {
    const panel = domElem('#graphPanel');
    clearGraph();
    const messageItem = document.createElement('div');
    messageItem.classList.add('graphMessage');
    messageItem.innerText = message.text;
    messageItem.style.opacity = '0';
    messageItem.style.transition = 'opacity 0.4s ease-in-out 0';
    panel.appendChild(messageItem);
    
    window.setTimeout(() => messageItem.style.opacity = '1', 500);
}

/** Handles the message containing new verifiables for this session. */
function handleVerifiableUpdate(verifiables: any[]) {
    const options = verifiables.map((v) => {
        const opt = document.createElement('option');
        opt.innerText = v.name;
        opt.setAttribute('value', v.name);
        return opt;
    });
    const dropdown = (domElem('#verifiables') as HTMLInputElement);
    const selected = dropdown.value;
    removeAllChildren(dropdown);

    // Set the options, if any
    if (options.length > 0) {
        options.forEach(o => dropdown.appendChild(o));
        dropdown.disabled = false;

        // TODO: It looks like the first verifiable is selected by default and then switched to the previous one
        // Re-select the previously selected verifiable if possible
        let elem = options.find(e => e.value === selected);
        if (elem) {
            dropdown.value = elem.value;
        } else {
            // Trigger updating panel to the first verifiable
            dropdown.value = options[0].value;
        }
        dropdown.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        dropdown.disabled = true;
        removeAllChildren(domElem('#currentState'));
    }
}

function handleSymbExLogMessage(message: any) {
    const options: JSONFormatterConfiguration = {
        animateOpen: false,
        animateClose: false,
        theme: 'dark'
    };

    // Update the JSON view of the state tree
    const current = new JSONFormatter(message.text, 1, options);
    const pre = document.createElement('pre');
    pre.classList.add('json');
    pre.appendChild(current.render());

    const symbExLog = domElem('#symbExLog');
    removeAllChildren(symbExLog);
    symbExLog.appendChild(pre);
}

function handleAlloyInstanceMessage(message: any) {
    const options: JSONFormatterConfiguration = {
        animateOpen: false,
        animateClose: false,
        theme: 'dark'
    };

    // Update the JSON view of the state tree
    const current = new JSONFormatter(message.text, 1, options);
    const pre = document.createElement('pre');
    pre.classList.add('json');
    pre.appendChild(current.render());

    const alloyInstance = domElem('#alloyInstance');
    removeAllChildren(alloyInstance);
    alloyInstance.appendChild(pre);
}

function handleModelMessage(message: any) {
    // const lines = message.text.split("\n");
    // const margin = ' '.repeat(lines.length.toString().length);
    // const model = lines.map((line: string, index: number, _: any) => {
    //                               const lineNr = (margin + (index + 1)).slice(-3);
    //                               return`${lineNr} ▏${line}`;
    //                             })
    //                           .join("\n");
    const model = message.text;

    const pre = document.createElement('pre');
    pre.innerText = model;

    const modelElem = domElem('#alloyModel');
    removeAllChildren(modelElem);
    modelElem.appendChild(pre);
}


// Start up the debugger pane
activate();
