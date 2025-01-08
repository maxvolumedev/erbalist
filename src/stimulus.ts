import * as vscode from 'vscode';

const CONTROLLER_ATTR_REGEX = /(?:data-controller=["']([^"']+)["']|data:\s*{[^}]*controller:\s*["']([^"']+)["'][^}]*})/g;
const STIMULUS_ATTR_REGEX = /(?:data-([^=\s"']+)-(?:target|outlet|value)=["'][^"']*["']|data:\s*{[^}]*?([^:\s"']+?)_(?:target|outlet|value):\s*["'][^"']*["'][^}]*})/g;
const ACTION_ATTR_REGEX = /(?:data-action=["']([^"']*)["']|data:\s*{[^}]*action:\s*["']([^"']*)["'][^}]*})/g;
const ACTION_CONTROLLER_REGEX = /->([^#\s]+)#/g;

let stimulusDecorations: vscode.TextEditorDecorationType;

function normalizeControllerName(name: string): string {
    return name.replace(/[-_]/g, '-').toLowerCase();
}

export function activate(context: vscode.ExtensionContext) {
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
    let currentControllers: string[] = [];

    // First find if we're on a data-controller attribute
    let match;
    CONTROLLER_ATTR_REGEX.lastIndex = 0;
    while ((match = CONTROLLER_ATTR_REGEX.exec(text)) !== null) {
        const startPos = editor.document.positionAt(match.index);
        const endPos = editor.document.positionAt(match.index + match[0].length);
        const range = new vscode.Range(startPos, endPos);

        if (range.contains(cursorPosition)) {
            const controllerValue = match[1] || match[2];
            const cursorOffset = editor.document.offsetAt(cursorPosition);
            
            // Check if cursor is on the attribute name
            const isHtmlFormat = match[0].startsWith('data-controller');
            const isRubyFormat = match[0].includes('controller:');
            const attrNameEnd = match.index + (isHtmlFormat ? 'data-controller'.length : 
                                             isRubyFormat ? match[0].indexOf('controller:') + 'controller'.length : 0);
            
            if (cursorOffset <= attrNameEnd) {
                currentControllers = controllerValue.split(/\s+/).map(normalizeControllerName);
                break;
            }

            // Otherwise find which controller name the cursor is on
            const controllers = controllerValue.split(/\s+/);
            const valueStart = match.index + match[0].indexOf(controllerValue);
            const valueOffset = cursorOffset - valueStart;
            
            let pos = 0;
            for (const controller of controllers) {
                if (valueOffset >= pos && valueOffset <= pos + controller.length) {
                    currentControllers = [controller];
                    break;
                }
                pos += controller.length + 1; // +1 for space
            }
            break;
        }
    }

    // If not on a controller attribute, check data-action attributes
    if (currentControllers.length === 0) {
        ACTION_ATTR_REGEX.lastIndex = 0;
        while ((match = ACTION_ATTR_REGEX.exec(text)) !== null) {
            const startPos = editor.document.positionAt(match.index);
            const endPos = editor.document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);

            if (range.contains(cursorPosition)) {
                const value = match[1] || match[2];
                const cursorOffset = editor.document.offsetAt(cursorPosition) - (match.index + match[0].indexOf(value));
                
                // Check if cursor is on the attribute name
                if (cursorOffset < 0) {
                    // Get all controllers mentioned in the value
                    let actionMatch;
                    ACTION_CONTROLLER_REGEX.lastIndex = 0;
                    while ((actionMatch = ACTION_CONTROLLER_REGEX.exec(value)) !== null) {
                        currentControllers.push(actionMatch[1]);
                    }
                } else {
                    // Find which controller the cursor is on
                    let actionMatch;
                    let lastIndex = 0;
                    ACTION_CONTROLLER_REGEX.lastIndex = 0;
                    
                    while ((actionMatch = ACTION_CONTROLLER_REGEX.exec(value)) !== null) {
                        const controller = actionMatch[1];
                        if (cursorOffset >= lastIndex && cursorOffset <= actionMatch.index + actionMatch[0].length) {
                            currentControllers = [controller];
                            break;
                        }
                        lastIndex = actionMatch.index + actionMatch[0].length;
                    }
                }
                break;
            }
        }
    }

    // If still no controller, check target attributes
    if (currentControllers.length === 0) {
        STIMULUS_ATTR_REGEX.lastIndex = 0;
        while ((match = STIMULUS_ATTR_REGEX.exec(text)) !== null) {
            const startPos = editor.document.positionAt(match.index);
            const endPos = editor.document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);

            if (range.contains(cursorPosition)) {
                currentControllers = [normalizeControllerName(match[1] || match[2])];
                break;
            }
        }
    }

    if (currentControllers.length > 0) {
        // Highlight all matching controller declarations
        CONTROLLER_ATTR_REGEX.lastIndex = 0;
        while ((match = CONTROLLER_ATTR_REGEX.exec(text)) !== null) {
            const controllers = (match[1] || match[2]).split(/\s+/);
            if (controllers.some(c => currentControllers.includes(normalizeControllerName(c)))) {
                const startPos = editor.document.positionAt(match.index);
                const endPos = editor.document.positionAt(match.index + match[0].length);
                decorations.push({ 
                    range: new vscode.Range(startPos, endPos),
                    hoverMessage: `Controllers: ${controllers.map(c => normalizeControllerName(c)).join(', ')}`
                });
            }
        }

        // Highlight all matching stimulus attributes
        STIMULUS_ATTR_REGEX.lastIndex = 0;
        while ((match = STIMULUS_ATTR_REGEX.exec(text)) !== null) {
            const controller = normalizeControllerName(match[1] || match[2]);
            if (currentControllers.map(normalizeControllerName).includes(controller)) {
                const startPos = editor.document.positionAt(match.index);
                const endPos = editor.document.positionAt(match.index + match[0].length);
                decorations.push({ 
                    range: new vscode.Range(startPos, endPos),
                    hoverMessage: `Controller: ${controller}`
                });
            }
        }

        // Highlight all matching action attributes
        ACTION_ATTR_REGEX.lastIndex = 0;
        while ((match = ACTION_ATTR_REGEX.exec(text)) !== null) {
            const value = match[1] || match[2];
            let actionMatch;
            let hasMatch = false;
            ACTION_CONTROLLER_REGEX.lastIndex = 0;
            
            while ((actionMatch = ACTION_CONTROLLER_REGEX.exec(value)) !== null) {
                if (currentControllers.map(normalizeControllerName).includes(normalizeControllerName(actionMatch[1]))) {
                    hasMatch = true;
                    break;
                }
            }
            
            if (hasMatch) {
                const startPos = editor.document.positionAt(match.index);
                const endPos = editor.document.positionAt(match.index + match[0].length);
                const controllers = [];
                ACTION_CONTROLLER_REGEX.lastIndex = 0;
                while ((actionMatch = ACTION_CONTROLLER_REGEX.exec(value)) !== null) {
                    controllers.push(normalizeControllerName(actionMatch[1]));
                }
                decorations.push({ 
                    range: new vscode.Range(startPos, endPos),
                    hoverMessage: `Controllers: ${controllers.join(', ')}`
                });
            }
        }
    }

    editor.setDecorations(stimulusDecorations, decorations);
}

export function deactivate() {
    if (stimulusDecorations) {
        stimulusDecorations.dispose();
    }
} 