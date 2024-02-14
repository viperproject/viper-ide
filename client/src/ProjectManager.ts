/**
  * ProjectManager Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with ProjectManager
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2024 ETH Zurich.
  */

import * as vscode from 'vscode';
import { Log } from './Log';
import { LogLevel } from './ViperProtocol';

export type ProjectRoot = vscode.Uri;

export class ProjectManager {
    // Entry per project
    private static projects: Map<string, Set<string>> = new Map();
    // Entry per file in a project
    private static pinnedTo: Map<string, ProjectRoot> = new Map();

    public static getProject(file: vscode.Uri): ProjectRoot | undefined {
        const fileString = file.toString();
        return ProjectManager.pinnedTo.get(fileString);
    }
    public static inSameProject(file1: vscode.Uri, file2: vscode.Uri): boolean {
        const project1 = ProjectManager.getProject(file1) ?? file1;
        const project2 = ProjectManager.getProject(file2) ?? file2;
        return project1.toString() === project2.toString();
    }
    public static removeFromProject(file: vscode.Uri): ProjectRoot | null {
        const fileString = file.toString();
        const oldProject = ProjectManager.getProject(file) ?? null;
        if (oldProject) {
            ProjectManager.projects.get(oldProject.toString()).delete(fileString);
            ProjectManager.pinnedTo.delete(fileString);
            return oldProject;
        } else {
            return null;
        }
    }

    public static addToProject(projectRoot: ProjectRoot, file: vscode.Uri): void {
        // Root should not be added to itself
        if (projectRoot === file) {
            return;
        }
        const fileString = file.toString();
        const projectRootString = projectRoot.toString();
        // Add to `projects`
        if (!ProjectManager.projects.has(projectRootString)) {
            ProjectManager.projects.set(projectRootString, new Set());
        }
        ProjectManager.projects.get(projectRootString).add(fileString);
        // Add to `pinnedTo`
        const oldProject = ProjectManager.getProject(file) ?? null;
        if (oldProject) {
            ProjectManager.projects.get(oldProject.toString()).delete(fileString);
        }
        ProjectManager.pinnedTo.set(fileString, projectRoot);
    }
    public static resetProject(projectRoot: ProjectRoot): void {
        const projectRootString = projectRoot.toString();
        const project = ProjectManager.projects.get(projectRootString);
        if (project !== undefined) {
            project.forEach(file => {
                ProjectManager.pinnedTo.delete(file);
            });
            ProjectManager.projects.delete(projectRootString);
        }
    }
}
