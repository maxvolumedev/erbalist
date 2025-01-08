import * as vscode from 'vscode';
import * as types from "./types";

let isDimmingEnabled = false;
let globalEmphasizeState = false;

let dimmedDecorations: vscode.TextEditorDecorationType;

const ERB_RUBY_REGEX = /<%(?:=|-)?(.*?)%>/gs;

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('railsBuddy');	
  const rememberToggles = config.get<string>('rememberToggles', 'Never');

  if (rememberToggles === 'Always') {
		const savedStates = context.globalState.get<types.ToggleStates>('toggleStates', { emphasizeRuby: false });
		globalEmphasizeState = savedStates.emphasizeRuby;
		isDimmingEnabled = globalEmphasizeState;
	}

	dimmedDecorations = vscode.window.createTextEditorDecorationType({
		opacity: '0.5'
	});

  const updateDimming = (editor: vscode.TextEditor | undefined) => {
		if (!editor || !editor.document.fileName.endsWith('.erb') || !isDimmingEnabled) {
			editor?.setDecorations(dimmedDecorations, []);
			return;
		}

		let highlightSetting = vscode.workspace.getConfiguration('railsBuddy').get<types.HighlightMode>('highlightMode', 'whenInBlock');
		const cursorPosition = editor.selection.active;
		const text = editor.document.getText();
		const decorations: vscode.DecorationOptions[] = [];
		let isInRubyBlock = highlightSetting === 'always';

		if (!isInRubyBlock) {
			let match;
			while ((match = ERB_RUBY_REGEX.exec(text)) !== null) {
				const startPos = editor.document.positionAt(match.index);
				const endPos = editor.document.positionAt(match.index + match[0].length);
				const range = new vscode.Range(startPos, endPos);

				if (range.contains(cursorPosition)) {
					isInRubyBlock = true;
					break;
				}
			}
		}

		if (isInRubyBlock) {
			let lastEnd = 0;
			ERB_RUBY_REGEX.lastIndex = 0;
			let match;
			
			while ((match = ERB_RUBY_REGEX.exec(text)) !== null) {
				if (lastEnd < match.index) {
					const startPos = editor.document.positionAt(lastEnd);
					const endPos = editor.document.positionAt(match.index);
					decorations.push({ range: new vscode.Range(startPos, endPos) });
				}
				lastEnd = match.index + match[0].length;
			}

			if (lastEnd < text.length) {
				const startPos = editor.document.positionAt(lastEnd);
				const endPos = editor.document.positionAt(text.length);
				decorations.push({ range: new vscode.Range(startPos, endPos) });
			}
		}

		editor.setDecorations(dimmedDecorations, decorations);
	};

  let toggleEmphasizedRubyCmd = vscode.commands.registerCommand('rails-buddy.toggleEmphasizedRuby', () => {
		const config = vscode.workspace.getConfiguration('railsBuddy');
		const rememberToggles = config.get<string>('rememberToggles', 'Never');

		globalEmphasizeState = !globalEmphasizeState;
		isDimmingEnabled = globalEmphasizeState;

		if (rememberToggles === 'Always') {
			// Update all visible editors
			vscode.window.visibleTextEditors.forEach(editor => {
				updateDimming(editor);
			});

			// Save the state globally
			const savedStates = context.globalState.get<types.ToggleStates>('toggleStates', { emphasizeRuby: false });
			context.globalState.update('toggleStates', { ...savedStates, emphasizeRuby: globalEmphasizeState });
		} else {
			// Just update the current editor
			updateDimming(vscode.window.activeTextEditor);
		}
	});

  let highlightSetting = vscode.workspace.getConfiguration('railsBuddy').get<types.HighlightMode>('highlightMode', 'whenInBlock');

	let toggleHighlightCmd = vscode.commands.registerCommand('rails-buddy.toggleHighlight', () => {
		const currentState = context.workspaceState.get('highlightEnabled', false);
		context.workspaceState.update('highlightEnabled', !currentState);
		
		if (!currentState) {
			// Turn highlighting on according to configuration
			isDimmingEnabled = true;
			updateDimming(vscode.window.activeTextEditor);
		} else {
			// Turn highlighting off
			isDimmingEnabled = false;
			updateDimming(vscode.window.activeTextEditor);
		}
	});

	// Watch for configuration changes
	context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(e => {
			updateDimming(e.textEditor);
		}),
		vscode.window.onDidChangeActiveTextEditor(editor => {
			const config = vscode.workspace.getConfiguration('railsBuddy');
			const rememberToggles = config.get<string>('rememberToggles', 'Never');

			if (rememberToggles === 'Always') {
				isDimmingEnabled = globalEmphasizeState;
			}

			updateDimming(editor);
		}),
		dimmedDecorations,
    toggleHighlightCmd,
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('railsBuddy.highlightMode')) {
				highlightSetting = vscode.workspace.getConfiguration('railsBuddy').get<types.HighlightMode>('highlightMode', 'whenInBlock');
				// Re-apply highlighting if currently enabled
				if (context.workspaceState.get('highlightEnabled', false)) {
					updateDimming(vscode.window.activeTextEditor);
				}
			}
		})
	);

  context.subscriptions.push(toggleEmphasizedRubyCmd);
}

export function deactivate() {
	if (dimmedDecorations) {
		dimmedDecorations.dispose();
	}
}
