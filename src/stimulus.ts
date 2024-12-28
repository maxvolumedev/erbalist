import * as vscode from 'vscode';

const CONTROLLER_ATTR_REGEX = /data-controller=["']([^"']+)["']/g;
const STIMULUS_ATTR_REGEX = /data-(.+?)-target=["'][^"']*["']/g;

let stimulusDecorations: vscode.TextEditorDecorationType;

export function initializeStimulusHighlighting(context: vscode.ExtensionContext) {
    stimulusDecorations = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(100, 100, 255, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.5)',
        borderRadius: '3px',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        overviewRulerColor: 'rgba(100, 100, 255, 0.3)'
    });

    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(e => {
            updateStimulusHighlights(e.textEditor);
        }),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            updateStimulusHighlights(editor);
        }),
        stimulusDecorations
    );
}

function updateStimulusHighlights(editor: vscode.TextEditor | undefined) {
    if (!editor || !editor.document.fileName.endsWith('.erb')) {
        editor?.setDecorations(stimulusDecorations, []);
        return;
    }

    const cursorPosition = editor.selection.active;
    const text = editor.document.getText();
    const decorations: vscode.DecorationOptions[] = [];
    let currentController: string | null = null;

    // First find if we're on a data-controller attribute
    let match;
    CONTROLLER_ATTR_REGEX.lastIndex = 0;
    while ((match = CONTROLLER_ATTR_REGEX.exec(text)) !== null) {
        const startPos = editor.document.positionAt(match.index);
        const endPos = editor.document.positionAt(match.index + match[0].length);
        const range = new vscode.Range(startPos, endPos);

        if (range.contains(cursorPosition)) {
            // Check if cursor is on the attribute name
            const attrNameEnd = match.index + 'data-controller'.length;
            const cursorOffset = editor.document.offsetAt(cursorPosition);
            
            if (cursorOffset <= attrNameEnd) {
                currentController = match[1].split(/\s+/)[0];
                break;
            }

            // Otherwise find which controller name the cursor is on
            const controllers = match[1].split(/\s+/);
            const valueStart = match.index + match[0].indexOf(match[1]);
            const valueOffset = cursorOffset - valueStart;
            let pos = 0;
            for (const controller of controllers) {
                if (valueOffset >= pos && valueOffset <= pos + controller.length) {
                    currentController = controller;
                    break;
                }
                pos += controller.length + 1; // +1 for space
            }
            break;
        }
    }

    // If not on a controller attribute, check other stimulus attributes
    if (!currentController) {
        STIMULUS_ATTR_REGEX.lastIndex = 0;
        while ((match = STIMULUS_ATTR_REGEX.exec(text)) !== null) {
            const startPos = editor.document.positionAt(match.index);
            const endPos = editor.document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);

            if (range.contains(cursorPosition)) {
                currentController = match[1];
                break;
            }
        }
    }

    if (currentController) {
        // Highlight all matching controller declarations
        CONTROLLER_ATTR_REGEX.lastIndex = 0;
        while ((match = CONTROLLER_ATTR_REGEX.exec(text)) !== null) {
            const controllers = match[1].split(/\s+/);
            if (controllers.includes(currentController)) {
                const startPos = editor.document.positionAt(match.index);
                const endPos = editor.document.positionAt(match.index + match[0].length);
                decorations.push({ range: new vscode.Range(startPos, endPos) });
            }
        }

        // Highlight all matching stimulus attributes
        STIMULUS_ATTR_REGEX.lastIndex = 0;
        while ((match = STIMULUS_ATTR_REGEX.exec(text)) !== null) {
            const controller = match[1];
            if (controller === currentController) {
                const startPos = editor.document.positionAt(match.index);
                const endPos = editor.document.positionAt(match.index + match[0].length);
                decorations.push({ range: new vscode.Range(startPos, endPos) });
            }
        }
    }

    editor.setDecorations(stimulusDecorations, decorations);
}

export function disposeStimulusHighlighting() {
    if (stimulusDecorations) {
        stimulusDecorations.dispose();
    }
} 