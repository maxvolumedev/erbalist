import * as vscode from 'vscode';
import * as types from "./types";

const ERB_RUBY_REGEX = /<%(?:=|-)?(.*?)%>/gs;
const dimmedState = new Map<string, boolean>();

let dimmedDecorations: vscode.TextEditorDecorationType;

function getDimState(editor: vscode.TextEditor): boolean {
	return dimmedState.get(editor.document.uri.toString()) || false;
}

function setDimState(editor: vscode.TextEditor, state: boolean) {
	dimmedState.set(editor.document.uri.toString(), state);
}

function toggleDimState(editor: vscode.TextEditor) {
	const newState = !dimmedState.get(editor.document.uri.toString());
	dimmedState.set(editor.document.uri.toString(), newState);
	vscode.commands.executeCommand('setContext', 'railsBuddy.emphasizedRubyEnabled', newState);
	updateDimming(editor);
}

const updateDimming = (editor: vscode.TextEditor | undefined) => {
	if (!editor?.document.fileName.endsWith('.erb') || !dimmedState.get(editor.document.uri.toString())) {
		editor?.setDecorations(dimmedDecorations, []);
		return;
	}

	const highlightSetting = vscode.workspace.getConfiguration('railsBuddy').get<types.HighlightMode>('highlightMode', 'whenInBlock');
	const cursorPosition = editor.selection.active;
	const text = editor.document.getText();
	
	if (isInComment(editor, cursorPosition)) {
		editor.setDecorations(dimmedDecorations, []);
		return;
	}

	const shouldHighlight = highlightSetting === 'always' || isInRubyBlock(editor, cursorPosition);
	if (!shouldHighlight) {
		editor.setDecorations(dimmedDecorations, []);
		return;
	}

	editor.setDecorations(dimmedDecorations, createDecorations(editor, text));
};

function isInComment(editor: vscode.TextEditor, position: vscode.Position): boolean {
	const text = editor.document.getText();
	let match;
	while ((match = ERB_RUBY_REGEX.exec(text)) !== null) {
		if (match[0].startsWith('<%#')) {
			const range = new vscode.Range(
				editor.document.positionAt(match.index),
				editor.document.positionAt(match.index + match[0].length)
			);
			if (range.contains(position)) return true;
		}
	}
	return false;
}

function isInRubyBlock(editor: vscode.TextEditor, position: vscode.Position): boolean {
	const text = editor.document.getText();
	let match;
	while ((match = ERB_RUBY_REGEX.exec(text)) !== null) {
		const range = new vscode.Range(
			editor.document.positionAt(match.index),
			editor.document.positionAt(match.index + match[0].length)
		);
		if (range.contains(position)) return true;
	}
	return false;
}

function createDecorations(editor: vscode.TextEditor, text: string): vscode.DecorationOptions[] {
	const decorations: vscode.DecorationOptions[] = [];
	let lastEnd = 0;
	ERB_RUBY_REGEX.lastIndex = 0;
	
	let match;
	while ((match = ERB_RUBY_REGEX.exec(text)) !== null) {
		if (lastEnd < match.index) {
			decorations.push({
				range: new vscode.Range(
					editor.document.positionAt(lastEnd),
					editor.document.positionAt(match.index)
				)
			});
		}
		lastEnd = match.index + match[0].length;
	}

	if (lastEnd < text.length) {
		decorations.push({
			range: new vscode.Range(
				editor.document.positionAt(lastEnd),
				editor.document.positionAt(text.length)
			)
		});
	}

	return decorations;
}

export function activate(context: vscode.ExtensionContext) {
	dimmedDecorations = vscode.window.createTextEditorDecorationType({
			opacity: '0.3'
	});

  const toggle = () => {
		const editor = vscode.window.activeTextEditor;
		if (editor) toggleDimState(editor);
  }

	const toggleOnCmd = vscode.commands.registerCommand('rails-buddy.toggleEmphasizedRuby.on', toggle);
	const toggleOffCmd = vscode.commands.registerCommand('rails-buddy.toggleEmphasizedRuby.off', toggle);


	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection(e => {
			updateDimming(e.textEditor);
		}),
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				vscode.commands.executeCommand('setContext', 'railsBuddy.emphasizedRubyEnabled', getDimState(editor));
				updateDimming(editor);
			}
		}),
		dimmedDecorations,
		toggleOnCmd,
		toggleOffCmd,
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('railsBuddy.highlightMode')) {
				vscode.window.visibleTextEditors.forEach(editor => {
					if (getDimState(editor)) {
						updateDimming(editor);
					}
				});
			}
		})
	);

	vscode.commands.executeCommand('setContext', 'railsBuddy.emphasizedRubyEnabled', false);
}

export function deactivate() {
	if (dimmedDecorations) {
		dimmedDecorations.dispose();
	}
}
