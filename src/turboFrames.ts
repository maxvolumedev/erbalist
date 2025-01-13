import * as vscode from 'vscode';

let isHighlightingEnabled = false;
let frameDecoration: vscode.TextEditorDecorationType;

interface TurboFrame {
    id: string;
    range: vscode.Range;
}

function toggleTurboFrames() {
    isHighlightingEnabled = !isHighlightingEnabled;
    vscode.commands.executeCommand('setContext', 'railsBuddy.turboFramesEnabled', isHighlightingEnabled);
    if (vscode.window.activeTextEditor) {
        updateFrameHighlight(vscode.window.activeTextEditor);
    }
}

export function activate(context: vscode.ExtensionContext) {
    frameDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(100, 100, 250, 0.25)',
        isWholeLine: true,
        borderRadius: '3px',
        overviewRulerColor: 'rgba(100, 100, 250, 0.8)',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: {
            backgroundColor: 'rgba(65, 105, 225, 0.1)',
        }
    });

    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(e => updateFrameHighlight(e.textEditor)),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                vscode.commands.executeCommand('setContext', 'railsBuddy.turboFramesEnabled', isHighlightingEnabled);
                updateFrameHighlight(editor);
            }
        }),
        frameDecoration
    );

    registerCommands(context);

    vscode.commands.executeCommand('setContext', 'railsBuddy.turboFramesEnabled', isHighlightingEnabled);
}

async function updateFrameHighlight(editor: vscode.TextEditor | undefined) {
    if (!editor?.document || !editor.document.fileName.endsWith('.erb') || !isHighlightingEnabled) {
        if (frameDecoration && editor) {
            editor.setDecorations(frameDecoration, []);
        }
        return;
    }

    const foldingRanges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
        'vscode.executeFoldingRangeProvider', 
        editor.document.uri
    ) || [];

    const cursorPos = editor.selection.active;
    let decorations: vscode.Range[] = [];
    
    // Check for frame references in current line and parent elements
    const frameRef = findFrameReferenceInLineOrParents(editor, cursorPos.line);
    if (frameRef) {
        const frames = findTurboFrames(editor, foldingRanges);
        const targetFrame = frames.find(f => f.id === frameRef);
        if (targetFrame) {
            decorations = [targetFrame.range, ...findAllFrameReferences(editor, targetFrame.id)];
            editor.setDecorations(frameDecoration, decorations);
            return;
        }
    }

    // If no frame reference found, check if we're inside a frame
    const containingFrame = findContainingFrame(editor, cursorPos, foldingRanges);
    if (containingFrame.length > 0) {
        const frameId = extractFrameReference(editor.document.lineAt(containingFrame[0].start.line).text);
        if (frameId) {
            decorations = [...containingFrame, ...findAllFrameReferences(editor, frameId)];
        }
    }
    editor.setDecorations(frameDecoration, decorations);
}

function findFrameReferenceInLineOrParents(editor: vscode.TextEditor, lineNumber: number): string | null {
    const text = editor.document.getText();
    const lines = text.split('\n');
    let currentLine = lineNumber;
    let indentLevel = getIndentLevel(lines[currentLine]);
    let parentIndentLevel: number | null = null;
    let openTag: string | null = null;
    
    // First check current line
    const currentFrameRef = extractFrameReference(lines[currentLine]);
    if (currentFrameRef) {
        parentIndentLevel = indentLevel;
        // Extract the tag name if this is an opening tag
        const tagMatch = lines[currentLine].match(/<(\w+)[^>]*data-turbo-frame/);
        if (tagMatch) {
            openTag = tagMatch[1];
        }
        return currentFrameRef;
    }
    
    // Check if this is a closing tag of a previously found element
    if (openTag && lines[currentLine].includes(`</${openTag}`)) {
        return currentFrameRef;
    }
    
    // Then scan upwards through the document
    while (currentLine >= 0) {
        const line = lines[currentLine];
        const currentIndent = getIndentLevel(line);
        
        // Check lines with lower indent level (parent elements)
        // or same level as the parent (closing tags)
        if (currentIndent < indentLevel || 
            (parentIndentLevel !== null && currentIndent === parentIndentLevel)) {
            const frameRef = extractFrameReference(line);
            if (frameRef) {
                parentIndentLevel = currentIndent;
                // Extract the tag name if this is an opening tag
                const tagMatch = line.match(/<(\w+)[^>]*data-turbo-frame/);
                if (tagMatch) {
                    openTag = tagMatch[1];
                }
                return frameRef;
            }
            // Check if this is a closing tag of our element
            if (openTag && line.includes(`</${openTag}`)) {
                return frameRef;
            }
            indentLevel = currentIndent;
        }
        
        currentLine--;
    }
    
    return null;
}

function getIndentLevel(line: string): number {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
}

function findContainingFrame(editor: vscode.TextEditor, cursorPos: vscode.Position, foldingRanges: vscode.FoldingRange[]): vscode.Range[] {
    // Combine both multi-line and single-line checks into one loop
    for (const range of foldingRanges) {
        const startLine = range.start;
        const lineText = editor.document.lineAt(startLine).text;

        if (lineText.includes('turbo_frame_tag') && 
            cursorPos.line >= startLine && 
            cursorPos.line <= range.end + 1) {
            
            return [new vscode.Range(
                new vscode.Position(startLine, 0),
                new vscode.Position(range.end + 1, editor.document.lineAt(range.end + 1).text.length)
            )];
        }
    }
    return [];
}

function findTurboFrames(editor: vscode.TextEditor, foldingRanges: vscode.FoldingRange[]): TurboFrame[] {
    const frames: TurboFrame[] = [];
    const document = editor.document;
    
    for (const range of foldingRanges) {
        const lineText = document.lineAt(range.start).text;
        if (lineText.includes('turbo_frame_tag')) {
            const id = extractFrameReference(lineText);
            if (id) {
                frames.push({
                    id,
                    range: new vscode.Range(
                        new vscode.Position(range.start, 0),
                        new vscode.Position(range.end + 1, document.lineAt(range.end + 1).text.length)
                    )
                });
            }
        }
    }
    return frames;
}

function extractFrameReference(line: string): string | null {
    const patterns = [
        /data-turbo-frame\s*=\s*(?:"|')([^"']+)(?:"|')/,
        /data:\s*{\s*turbo_frame:\s*(?:"|')([^"']+)(?:"|')/,
        /turbo_frame_tag\s*(?:"|')([^"']+)(?:"|')/
    ];
    
    for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) return match[1];
    }
    return null;
}

export function deactivate() {
    frameDecoration?.dispose();
}

function registerCommands(context: vscode.ExtensionContext) {
    let toggleCmd = vscode.commands.registerCommand('rails-buddy.toggleTurboFrames.on', toggleTurboFrames);
    let toggleCmd2 = vscode.commands.registerCommand('rails-buddy.toggleTurboFrames.off', toggleTurboFrames);

    context.subscriptions.push(toggleCmd, toggleCmd2);
}

function findAllFrameReferences(editor: vscode.TextEditor, frameId: string): vscode.Range[] {
    const text = editor.document.getText();
    const lines = text.split('\n');
    const references: vscode.Range[] = [];

    lines.forEach((line, index) => {
        const ref = extractFrameReference(line);
        if (ref === frameId) {
            references.push(new vscode.Range(
                new vscode.Position(index, 0),
                new vscode.Position(index, line.length)
            ));
        }
    });

    return references;
} 