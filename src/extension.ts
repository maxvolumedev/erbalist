// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const CLASS_ATTR_REGEX = /class ?[=:] ?["']([^"']+)["']/g;
const FOLDED_CLASS_ICON = '⋯';
const ERB_RUBY_REGEX = /<%(?:=|-)?(.*?)%>/gs;

let foldedDecorations: vscode.TextEditorDecorationType;
let dimmedDecorations: vscode.TextEditorDecorationType;
let foldedState = new WeakMap<vscode.TextEditor, Set<string>>();

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	dimmedDecorations = vscode.window.createTextEditorDecorationType({
		opacity: '0.25'
	});

	foldedDecorations = vscode.window.createTextEditorDecorationType({
		textDecoration: 'none; display: none',
		before: {
			contentText: FOLDED_CLASS_ICON,
			color: 'rgba(128, 128, 128, 0.5)',
		},
		after: {
			contentText: ''
		}
	});

	let toggleCmd = vscode.commands.registerCommand('better-erb.toggleClassAttributes', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || !editor.document.fileName.endsWith('.erb')) {
			return;
		}

		const currentFoldedRanges = foldedState.get(editor) || new Set<string>();
		const newFoldedRanges = new Set<string>();
		const decorations: vscode.DecorationOptions[] = [];

		const text = editor.document.getText();
		let match;

		while ((match = CLASS_ATTR_REGEX.exec(text)) !== null) {
			const startPos = editor.document.positionAt(match.index);
			const endPos = editor.document.positionAt(match.index + match[0].length);
			const range = new vscode.Range(startPos, endPos);
			const key = range.start.line.toString() + ':' + range.start.character;

			if (!currentFoldedRanges.has(key)) {
				newFoldedRanges.add(key);
				decorations.push({
					range,
					renderOptions: {
						before: {
							contentText: FOLDED_CLASS_ICON,
						}
					}
				});
			}
		}

		if (newFoldedRanges.size > 0) {
			foldedState.set(editor, newFoldedRanges);
			editor.setDecorations(foldedDecorations, decorations);
		} else {
			foldedState.delete(editor);
			editor.setDecorations(foldedDecorations, []);
		}
	});

	const updateDimming = (editor: vscode.TextEditor | undefined) => {
		if (!editor || !editor.document.fileName.endsWith('.erb')) {
			return;
		}

		const cursorPosition = editor.selection.active;
		const text = editor.document.getText();
		const decorations: vscode.DecorationOptions[] = [];
		let isInRubyBlock = false;

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

		if (isInRubyBlock) {
			let lastEnd = 0;
			ERB_RUBY_REGEX.lastIndex = 0;
			
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

	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection(e => updateDimming(e.textEditor)),
		vscode.window.onDidChangeActiveTextEditor(updateDimming),
		dimmedDecorations
	);

	context.subscriptions.push(toggleCmd);
	context.subscriptions.push(foldedDecorations);
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (foldedDecorations) {
		foldedDecorations.dispose();
	}
	if (dimmedDecorations) {
		dimmedDecorations.dispose();
	}
}
