import * as vscode from 'vscode';
import * as types from "./types";

const CLASS_ATTR_REGEX = /class ?[=:] ?["']([^"']+)["']/g;
const FOLDED_CLASS_ICON = '⋯';

let foldedDecorations: vscode.TextEditorDecorationType;
let modifierDecorationTypes: vscode.TextEditorDecorationType[] = [];
let exactMatchDecoration: vscode.TextEditorDecorationType;
const MODIFIER_COLORS = [
	'rgba(255, 255, 0, 0.3)',   // yellow
	'rgba(0, 255, 255, 0.3)',   // cyan
	'rgba(255, 0, 255, 0.3)',   // magenta
	'rgba(0, 255, 0, 0.3)',     // green
	'rgba(255, 128, 0, 0.3)',   // orange
];

let foldedState = new WeakMap<vscode.TextEditor, boolean>();

function unfoldClassAttributes(editor: vscode.TextEditor) {
	editor.setDecorations(foldedDecorations, []);
}

function foldClassAttributes(editor: vscode.TextEditor) {
	const decorations: vscode.DecorationOptions[] = [];
	const text = editor.document.getText();
	let match;
	CLASS_ATTR_REGEX.lastIndex = 0;

	while ((match = CLASS_ATTR_REGEX.exec(text)) !== null) {
		const startPos = editor.document.positionAt(match.index);
		const endPos = editor.document.positionAt(match.index + match[0].length);
		const range = new vscode.Range(startPos, endPos);

    decorations.push({
      range,
      renderOptions: {
        before: {
          contentText: FOLDED_CLASS_ICON,
        }
      },
      hoverMessage: new vscode.MarkdownString(`${match[0]}${match[1]}`)
    });
	}

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

	let foldingEnabled = foldedState.get(editor) || false;
  foldingEnabled = !foldingEnabled;
  foldedState.set(editor, foldingEnabled);

  applyFolding(editor, foldingEnabled);
}

function applyFolding(editor: vscode.TextEditor | undefined, foldingEnabled: boolean) {
	if (!editor) { return }

  // add debug output for foldingEnabled
  console.log('foldingEnabled', foldingEnabled);

	if (foldingEnabled) {
		foldClassAttributes(editor);
	} else {
		unfoldClassAttributes(editor);
	}
}

export function activate(context: vscode.ExtensionContext) {	

	exactMatchDecoration = vscode.window.createTextEditorDecorationType({
		border: '1px solid  rgba(255, 255, 255, 0.5)',
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

	let toggleCmd = vscode.commands.registerCommand('rails-buddy.toggleClassAttributes', () => {
		toggleClassAttributes(vscode.window.activeTextEditor);
	});

	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection(e => {
			updateModifierHighlights(e.textEditor);
		}),
		vscode.window.onDidChangeActiveTextEditor(editor => {		
      if (editor)	{
        applyFolding(editor, foldedState.get(editor) || false);        
        updateModifierHighlights(editor);
      }
		}),
		exactMatchDecoration,
		...modifierDecorationTypes
	);

	context.subscriptions.push(toggleCmd);
	context.subscriptions.push(foldedDecorations);	
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
