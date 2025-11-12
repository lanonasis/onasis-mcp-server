/**
 * VSCode/Cursor/Windsurf Extension for Lanonasis Memory Dashboard
 */

import * as vscode from 'vscode';
import { MemoryPanel } from './MemoryPanel';

export function activate(context: vscode.ExtensionContext) {
  console.log('Lanonasis Memory extension is now active');

  // Create memory panel provider
  const memoryPanel = new MemoryPanel(context.extensionUri);

  // Register webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('lanonasisMemory', memoryPanel)
  );

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('lanonasis.refreshMemories', () => {
      memoryPanel.refresh();
      vscode.window.showInformationMessage('Refreshing Lanonasis memories...');
    })
  );

  // Register settings command
  context.subscriptions.push(
    vscode.commands.registerCommand('lanonasis.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'lanonasis');
    })
  );
}

export function deactivate() {
  console.log('Lanonasis Memory extension deactivated');
}
