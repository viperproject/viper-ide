/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2025 ETH Zurich.
  */

import { createRequire } from 'node:module';
import type { MarkdownString, ProviderResult, ThemeIcon, TreeDataProvider, TreeItem } from 'vscode';
const require = createRequire(import.meta.url);
const vscode = require('vscode') as typeof import('vscode');

import { DebugNode, DebugObligation } from '../ViperProtocol.js';

/** A section of the proof obligation, i.e. one of the top-level groups of the tree. */
export interface DebugSection {
    type: 'section';
    id: string;
    label: string;
    description?: string;
    children: DebugNode[];
}

export interface DebugNodeElement {
    type: 'node';
    node: DebugNode;
}

export type DebugTreeElement = DebugSection | DebugNodeElement;

/**
 * Shows the proof obligation of the failure that is currently being debugged.
 *
 * The server sends the obligation with a limited depth (governed by the print configuration); nodes whose
 * children were left out are fetched lazily when the user expands them.
 */
export class DebugTreeProvider implements TreeDataProvider<DebugTreeElement> {

    private obligation: DebugObligation | null = null;
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<DebugTreeElement | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    /** Fetches the missing children of a node; set by the controller, which owns the connection. */
    public expandNode: (node: DebugNode) => Promise<DebugNode[]> = async () => [];

    public setObligation(obligation: DebugObligation | null): void {
        this.obligation = obligation;
        this._onDidChangeTreeData.fire(undefined);
    }

    public getObligation(): DebugObligation | null {
        return this.obligation;
    }

    public getChildren(element?: DebugTreeElement): ProviderResult<DebugTreeElement[]> {
        if (!element) {
            return this.sections();
        }
        if (element.type === 'section') {
            return element.children.map(node => ({ type: 'node', node } as DebugNodeElement));
        }
        return this.childrenOf(element.node);
    }

    private async childrenOf(node: DebugNode): Promise<DebugTreeElement[]> {
        let children = node.children ?? [];
        if (children.length < node.childCount) {
            // The server truncated this subtree; ask for the rest and remember it.
            const fetched = await this.expandNode(node);
            if (fetched.length > 0) {
                node.children = fetched;
                children = fetched;
            }
        }
        return children.map(child => ({ type: 'node', node: child } as DebugNodeElement));
    }

    private sections(): DebugTreeElement[] {
        const o = this.obligation;
        if (!o) return [];

        const sections: DebugSection[] = [];
        const add = (id: string, label: string, children: DebugNode[], description?: string): void => {
            if (children && children.length > 0) sections.push({ type: 'section', id, label, description, children });
        };

        sections.push({
            type: 'section', id: 'error', label: 'Error',
            description: o.memberName ? `in ${o.memberName}` : undefined,
            children: [{
                id: -1, kind: 'literal', label: o.errorMessage, isInternal: false, childCount: 0,
                children: [], pos: o.errorPos,
            }],
        });
        add('branchConditions', 'Branch Conditions', o.branchConditions);
        add('store', 'Store', o.store);
        for (const heap of o.heaps ?? []) {
            add(`heap:${heap.key}`, heap.title, heap.chunks);
        }
        add('assumptions', 'Assumptions', o.assumptions);
        if (o.assertion) {
            sections.push({ type: 'section', id: 'assertion', label: 'Assertion', children: [o.assertion] });
        }
        add('axioms', 'Axioms', o.axioms);
        add('declarations', 'Declarations', o.declarations);
        return sections;
    }

    public getTreeItem(element: DebugTreeElement): TreeItem {
        if (element.type === 'section') {
            const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
            item.description = element.description;
            item.contextValue = `section:${element.id}`;
            item.id = `section:${element.id}`;
            return item;
        }

        const node = element.node;
        const collapsible = node.childCount > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;
        const item = new vscode.TreeItem(node.label || '(empty)', collapsible);
        item.contextValue = node.kind;
        // Assumptions are addressed by their id when removing or expanding them, so show it.
        if (node.id >= 0 && isAssumptionKind(node.kind)) {
            item.description = `[${node.id}]`;
        }
        item.tooltip = tooltipOf(node);
        item.iconPath = iconOf(node);
        if (node.pos && node.pos.file) {
            item.command = {
                command: 'viper.debugRevealNode',
                title: 'Show in the editor',
                arguments: [node],
            };
        }
        return item;
    }
}

function isAssumptionKind(kind: string): boolean {
    return kind === 'assumption' || kind === 'implication' || kind === 'quantified';
}

function tooltipOf(node: DebugNode): MarkdownString | undefined {
    const lines: string[] = [];
    if (node.description) lines.push(node.description);
    if (node.expString && node.expString !== node.label) lines.push('```viper\n' + node.expString + '\n```');
    if (node.termString) lines.push('_term:_ `' + node.termString + '`');
    if (node.isInternal) lines.push('_(internal)_');
    if (lines.length === 0) return undefined;
    const md = new vscode.MarkdownString(lines.join('\n\n'));
    md.supportHtml = false;
    return md;
}

function iconOf(node: DebugNode): ThemeIcon | undefined {
    switch (node.kind) {
        case 'store': return new vscode.ThemeIcon('symbol-variable');
        case 'chunk': return new vscode.ThemeIcon('symbol-field');
        case 'branchCondition': return new vscode.ThemeIcon('git-branch');
        case 'assertion': return new vscode.ThemeIcon('target');
        case 'quantified': return new vscode.ThemeIcon('symbol-operator');
        case 'implication': return new vscode.ThemeIcon('arrow-right');
        case 'axiom': return new vscode.ThemeIcon('law');
        case 'declaration': return new vscode.ThemeIcon('symbol-namespace');
        case 'assumption': return new vscode.ThemeIcon('check');
        default: return undefined;
    }
}
