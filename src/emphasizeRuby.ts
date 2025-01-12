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

const updateDimming = (editor: vscode.TextEditor | undefined) => {
	if (!editor || !editor.document.fileName.endsWith('.erb') || !getDimState(editor)) {
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
				if (match[0].startsWith('<%#')) {
					editor.setDecorations(dimmedDecorations, []);
					return;
				}
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

export function activate(context: vscode.ExtensionContext) {
	dimmedDecorations = vscode.window.createTextEditorDecorationType({
		opacity: '0.3'
	});

	let toggleCmd = vscode.commands.registerCommand('rails-buddy.toggleEmphasizedRuby.on', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;
		const newState = !getDimState(editor);
		setDimState(editor, newState);
		vscode.commands.executeCommand('setContext', 'railsBuddy.emphasizedRubyEnabled', newState);
		updateDimming(editor);
	});
	let toggleCmd2 = vscode.commands.registerCommand('rails-buddy.toggleEmphasizedRuby.off', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;
		const newState = !getDimState(editor);
		setDimState(editor, newState);
		vscode.commands.executeCommand('setContext', 'railsBuddy.emphasizedRubyEnabled', newState);
		updateDimming(editor);
	});

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
		toggleCmd,
		toggleCmd2,
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
