/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2025 ETH Zurich.
  */

import { createRequire } from 'node:module';
import type { ProviderResult, ThemeIcon, TreeDataProvider, TreeItem } from 'vscode';
const require = createRequire(import.meta.url);
const vscode = require('vscode') as typeof import('vscode');

import { DebugCounterexample, DebugNode } from '../ViperProtocol.js';
import { DebugNodeElement, DebugSection, DebugTreeElement } from './DebugTreeProvider.js';

/**
 * Shows the counterexample of the obligation that is currently being debugged: the values the variables and
 * heap locations have in a situation where the assertion does not hold.
 *
 * Counterexamples are fully materialized by the server, so unlike the proof obligation this tree never has to
 * fetch anything.
 */
export class CounterexampleTreeProvider implements TreeDataProvider<DebugTreeElement> {

    private counterexample: DebugCounterexample | null = null;
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<DebugTreeElement | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    public set(counterexample: DebugCounterexample | null): void {
        this.counterexample = counterexample;
        this._onDidChangeTreeData.fire(undefined);
    }

    public get(): DebugCounterexample | null {
        return this.counterexample;
    }

    public getChildren(element?: DebugTreeElement): ProviderResult<DebugTreeElement[]> {
        if (!element) {
            const ce = this.counterexample;
            if (!ce) return [];
            return (ce.sections ?? []).map(s => ({
                type: 'section',
                id: s.key,
                label: s.title,
                description: ce.stale ? 'out of date' : undefined,
                children: s.nodes,
            } as DebugSection));
        }
        const children = element.type === 'section' ? element.children : element.node.children;
        return (children ?? []).map(node => ({ type: 'node', node } as DebugNodeElement));
    }

    public getTreeItem(element: DebugTreeElement): TreeItem {
        if (element.type === 'section') {
            const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
            item.description = element.description;
            item.contextValue = 'counterexampleSection';
            item.id = `ce:${element.id}`;
            return item;
        }
        const node = element.node;
        const item = new vscode.TreeItem(node.label,
            node.childCount > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None);
        item.contextValue = node.kind;
        item.iconPath = iconOf(node);
        if (node.termString && node.termString !== node.label) {
            item.tooltip = node.termString;
        }
        return item;
    }
}

function iconOf(node: DebugNode): ThemeIcon | undefined {
    switch (node.kind) {
        case 'reference': return new vscode.ThemeIcon('references');
        case 'field': return new vscode.ThemeIcon('symbol-field');
        case 'collection': return new vscode.ThemeIcon('symbol-array');
        case 'predicate': return new vscode.ThemeIcon('symbol-interface');
        case 'domain': return new vscode.ThemeIcon('symbol-namespace');
        case 'function': return new vscode.ThemeIcon('symbol-function');
        case 'functionCase': return new vscode.ThemeIcon('symbol-enum-member');
        default: return new vscode.ThemeIcon('symbol-variable');
    }
}
