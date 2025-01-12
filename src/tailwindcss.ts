import * as vscode from 'vscode';
import { debounce } from './utils';

const CLASS_ATTR_REGEX = /class ?[=:] ?["']([^"']+)["']/g;
const FOLDED_CLASS_ICON = '⋯';

let foldedDecorations: vscode.TextEditorDecorationType;
let modifierDecorationTypes: vscode.TextEditorDecorationType[] = [];
let exactMatchDecoration: vscode.TextEditorDecorationType;
const MODIFIER_COLORS = [
	'rgba(255, 255, 0, 0.2)',   // yellow
	'rgba(0, 255, 255, 0.2)',   // cyan
	'rgba(255, 0, 255, 0.2)',   // magenta
	'rgba(0, 255, 0,   0.2)',     // green
	'rgba(255, 128, 0, 0.2)',   // orange
];

const foldedState = new Map<string, boolean>();
const temporarilyExpanded = new Map<string, vscode.Range>();
const foldedRanges = new Map<string, vscode.Range[]>();

function getFoldState(editor: vscode.TextEditor): boolean {
	return foldedState.get(editor.document.uri.toString()) || false;
}

function setFoldState(editor: vscode.TextEditor, state: boolean) {
	foldedState.set(editor.document.uri.toString(), state);
}

function unfoldClassAttributes(editor: vscode.TextEditor) {
	const editorKey = editor.document.uri.toString();
	foldedRanges.delete(editorKey); // Clear stored ranges
	editor.setDecorations(foldedDecorations, []);
}

function foldClassAttributes(editor: vscode.TextEditor) {
	const decorations: vscode.DecorationOptions[] = [];
	const ranges: vscode.Range[] = []; // Track ranges
	const editorKey = editor.document.uri.toString();
	const text = editor.document.getText();
	let match;
	CLASS_ATTR_REGEX.lastIndex = 0;

	while ((match = CLASS_ATTR_REGEX.exec(text)) !== null) {
		const startPos = editor.document.positionAt(match.index);
		const endPos = editor.document.positionAt(match.index + match[0].length);
		const range = new vscode.Range(startPos, endPos);

		// Skip if temporarily expanded
		if (temporarilyExpanded.get(editorKey)?.isEqual(range)) {
			continue;
		}

		ranges.push(range); // Store the range
		const mdString = new vscode.MarkdownString(`[Edit](command:rails-buddy.temporarilyExpand?${encodeURIComponent(JSON.stringify({
			start: { line: range.start.line, character: range.start.character },
			end: { line: range.end.line, character: range.end.character }
		}))}) ${match[0]}`);
		mdString.isTrusted = true;

		decorations.push({
			range,
			renderOptions: {
				before: {
					contentText: FOLDED_CLASS_ICON,
				}
			},
			hoverMessage: mdString
		});
	}

	foldedRanges.set(editorKey, ranges); // Store all ranges for this editor
	editor.setDecorations(foldedDecorations, decorations);
}

function updateModifierHighlights(editor: vscode.TextEditor | undefined) {
	if (!editor) {
    return;
  }

	const text = editor.document.getText();
	const cursorPosition = editor.selection.active;
	const decorationsByModifier = new Map<string, vscode.DecorationOptions[]>();
	const exactMatchDecorations: vscode.DecorationOptions[] = [];
	let currentModifiers = new Set<string>();
	let currentClassModifiers: string[] = [];

	// First find the modifiers under cursor
	CLASS_ATTR_REGEX.lastIndex = 0;
  let match;
	while ((match = CLASS_ATTR_REGEX.exec(text)) !== null) {
		const classesStart = editor.document.positionAt(match.index + match[0].indexOf(match[1]));
		const classesEnd = editor.document.positionAt(match.index + match[0].indexOf(match[1]) + match[1].length);
		const classesRange = new vscode.Range(classesStart, classesEnd);

		if (classesRange.contains(cursorPosition)) {
			const classes = match[1].split(/\s+/);
			const cursorOffset = editor.document.offsetAt(cursorPosition);
			let currentClassStart = match.index + match[0].indexOf(match[1]);

			// Find the class under cursor and get its modifiers
			for (const className of classes) {
				const classEnd = currentClassStart + className.length;
				if (cursorOffset >= currentClassStart && cursorOffset <= classEnd) {
					const modifierMatches = className.match(/([^:]+):/g);
					if (modifierMatches) {
						currentClassModifiers = modifierMatches.map(m => m.slice(0, -1));
						currentClassModifiers.sort();
						modifierMatches.forEach(m => currentModifiers.add(m.slice(0, -1)));
					}
				}
				currentClassStart = classEnd + 1;
			}
			break;
		}
	}

	if (currentModifiers.size > 0) {
		// Now process all class attributes to highlight matching modifiers
		CLASS_ATTR_REGEX.lastIndex = 0;
		while ((match = CLASS_ATTR_REGEX.exec(text)) !== null) {
			let currentClassStart = match.index + match[0].indexOf(match[1]);
			const classes = match[1].split(/\s+/);

			for (const className of classes) {
				let modifierStart = currentClassStart;
				let remainingClass = className;
				let modifierMatch;
				const modifierRegex = /([^:]+):/g;
				const classModifiers: string[] = [];
				let firstModifierStart: number | null = null;
				let lastModifierEnd: number | null = null;
				
				while ((modifierMatch = modifierRegex.exec(remainingClass)) !== null) {
					const modifier = modifierMatch[1];
					const startPos = modifierStart + modifierMatch.index;
					const endPos = startPos + modifier.length;

					if (firstModifierStart === null) {
						firstModifierStart = startPos;
					}
					lastModifierEnd = endPos;

					if (currentModifiers.has(modifier)) {
						if (!decorationsByModifier.has(modifier)) {
							decorationsByModifier.set(modifier, []);
						}
						decorationsByModifier.get(modifier)!.push({ 
							range: new vscode.Range(
								editor.document.positionAt(startPos),
								editor.document.positionAt(endPos)
							) 
						});
					}

					classModifiers.push(modifier);
				}

				// Check if this class has exactly the same modifier set (only for multiple modifiers)
				classModifiers.sort();
				if (currentModifiers.size > 1 && // Only add outline if there are multiple modifiers in current class
					classModifiers.length > 1 && // Only add outline if target class has multiple modifiers
					classModifiers.length === currentClassModifiers.length &&
					classModifiers.every((mod, i) => mod === currentClassModifiers[i]) &&
					firstModifierStart !== null && lastModifierEnd !== null) {
					exactMatchDecorations.push({ 
						range: new vscode.Range(
							editor.document.positionAt(firstModifierStart),
							editor.document.positionAt(lastModifierEnd)
						) 
					});
				}

				currentClassStart += className.length + 1;
			}
		}
	}

	// Clear all decorations first
	modifierDecorationTypes.forEach(d => editor.setDecorations(d, []));
	editor.setDecorations(exactMatchDecoration, []);

	// Apply decorations for each modifier with different colors
	const modifiers = Array.from(decorationsByModifier.keys());
	modifiers.forEach((modifier, index) => {
		const decorationType = modifierDecorationTypes[index % modifierDecorationTypes.length];
		editor.setDecorations(decorationType, decorationsByModifier.get(modifier)!);
	});

	// Apply exact match decorations only if there are multiple modifiers
	if (currentModifiers.size > 1) {
		editor.setDecorations(exactMatchDecoration, exactMatchDecorations);
	}
}

function toggleClassAttributes(editor: vscode.TextEditor | undefined) {
	if (!editor) { return; }
	
	const config = vscode.workspace.getConfiguration('rails-buddy');
	if (config.get('toggleWordWrapWithFolding')) {
		vscode.commands.executeCommand('editor.action.toggleWordWrap');
	}
	
	const newState = !getFoldState(editor);
	setFoldState(editor, newState);
	vscode.commands.executeCommand('setContext', 'railsBuddy.classAttributesFolded', newState);
	applyFolding(editor);
}

function applyFolding(editor: vscode.TextEditor | undefined) {
	if (!editor) { return; }
	getFoldState(editor) ? foldClassAttributes(editor) : unfoldClassAttributes(editor);
}

const debouncedApplyFolding = debounce((editor: vscode.TextEditor) => {
	applyFolding(editor);
}, 150);

let context: vscode.ExtensionContext;

export function activate(extensionContext: vscode.ExtensionContext) {
	context = extensionContext;

	exactMatchDecoration = vscode.window.createTextEditorDecorationType({
		border: '1px solid  rgba(255, 255, 255, 0.25)',
		borderRadius: '2px',
		rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
	});

	// Create decoration types for each color
	modifierDecorationTypes = MODIFIER_COLORS.map(color => 
		vscode.window.createTextEditorDecorationType({
			backgroundColor: color,
			// border: '1px solid rgba(255, 255, 255, 0.3)',
			borderRadius: '2px',
			rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
			overviewRulerLane: vscode.OverviewRulerLane.Right,
			overviewRulerColor: color,
			textDecoration: 'none !important',
			opacity: '1 !important'
		})
	);

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

	let toggleCmd = vscode.commands.registerCommand('rails-buddy.toggleClassAttributes.on', () => {
		toggleClassAttributes(vscode.window.activeTextEditor);
	});
	let toggleCmd2 = vscode.commands.registerCommand('rails-buddy.toggleClassAttributes.off', () => {
		toggleClassAttributes(vscode.window.activeTextEditor);
	});

	let expandCmd = vscode.commands.registerCommand('rails-buddy.temporarilyExpand', (rangeData) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;

		const range = new vscode.Range(
			new vscode.Position(rangeData.start.line, rangeData.start.character),
			new vscode.Position(rangeData.end.line, rangeData.end.character)
		);

		const editorKey = editor.document.uri.toString();
		temporarilyExpanded.set(editorKey, range);
		
		applyFolding(editor);
	});

	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection(e => {
			updateModifierHighlights(e.textEditor);
		}),
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				vscode.commands.executeCommand('setContext', 'railsBuddy.classAttributesFolded', getFoldState(editor));
				applyFolding(editor);
			}
		}),
		exactMatchDecoration,
		...modifierDecorationTypes
	);

	context.subscriptions.push(toggleCmd);
	context.subscriptions.push(toggleCmd2);
	context.subscriptions.push(foldedDecorations);	
	context.subscriptions.push(expandCmd);

	// Add cursor position check to collapse when leaving
	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection(e => {
			const editor = e.textEditor;
			const editorKey = editor.document.uri.toString();
			const expandedRange = temporarilyExpanded.get(editorKey);
			
			if (expandedRange && !expandedRange.contains(editor.selection.active)) {
				temporarilyExpanded.delete(editorKey);
				applyFolding(editor);
			}
			updateModifierHighlights(editor);
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(e => {
			const editor = vscode.window.activeTextEditor;
			if (editor && e.document === editor.document) {
				debouncedApplyFolding(editor);
			}
		})
	);

	vscode.commands.executeCommand('setContext', 'railsBuddy.classAttributesFolded', false);  // Start unfolded

	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument(document => {
			const uri = document.uri.toString();
			foldedState.delete(uri);
			foldedRanges.delete(uri);
			temporarilyExpanded.delete(uri);
		})
	);
}

export function deactivate() {
	if (foldedDecorations) {
		foldedDecorations.dispose();
	}
	if (exactMatchDecoration) {
		exactMatchDecoration.dispose();
	}
	modifierDecorationTypes.forEach(d => d.dispose());
}
