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
        backgroundColor: 'rgba(100, 100, 250, 0.15)',
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
    
    // Check for frame references in current line and parent elements
    const frameRef = findFrameReferenceInLineOrParents(editor, cursorPos.line);
    if (frameRef) {
        const frames = findTurboFrames(editor, foldingRanges);
        const targetFrame = frames.find(f => f.id === frameRef);
        if (targetFrame) {
            editor.setDecorations(frameDecoration, [targetFrame.range]);
            return;
        }
    }

    // If no frame reference found, check if we're inside a frame
    const decorations = findContainingFrame(editor, cursorPos, foldingRanges);
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
    const currentLine = editor.document.lineAt(cursorPos.line).text;
    
    // Check if we're inside a multi-line frame
    for (const range of foldingRanges) {
        const startLine = range.start;
        const endLine = range.end + 1;
        const lineText = editor.document.lineAt(startLine).text;

        if (lineText.includes('turbo_frame_tag') && 
            (cursorPos.line >= startLine && cursorPos.line <= endLine)) {
            
            return [new vscode.Range(
                new vscode.Position(startLine, 0),
                new vscode.Position(endLine, editor.document.lineAt(endLine).text.length)
            )];
        }
    }

    // Check if we're on a single-line frame
    if (currentLine.includes('turbo_frame_tag')) {
        // Find the matching folding range for this line
        const range = foldingRanges.find(r => r.start === cursorPos.line);
        if (range) {
            return [new vscode.Range(
                new vscode.Position(range.start, 0),
                new vscode.Position(range.end + 1, editor.document.lineAt(range.end + 1).text.length)
            )];
        }
        
        // Handle empty frames by looking for the next <% end %> line
        let endLine = cursorPos.line;
        while (endLine < editor.document.lineCount) {
            const line = editor.document.lineAt(endLine).text;
            if (line.includes('<% end %>')) {
                return [new vscode.Range(
                    new vscode.Position(cursorPos.line, 0),
                    new vscode.Position(endLine, line.length)
                )];
            }
            endLine++;
        }
    }

    return [];
}

function findTurboFrames(editor: vscode.TextEditor, foldingRanges: vscode.FoldingRange[]): TurboFrame[] {
    const frames: TurboFrame[] = [];
    const text = editor.document.getText();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('turbo_frame_tag')) {
            const id = extractFrameId(line);
            if (!id) continue;

            // Check if this is part of a folding range
            const range = foldingRanges.find(r => r.start === i);
            if (range) {
                frames.push({
                    id,
                    range: new vscode.Range(
                        new vscode.Position(range.start, 0),
                        new vscode.Position(range.end + 1, editor.document.lineAt(range.end + 1).text.length)
                    )
                });
            } else {
                // Look for the next <% end %> line for empty frames
                let endLine = i;
                while (endLine < lines.length) {
                    if (lines[endLine].includes('<% end %>')) {
                        frames.push({
                            id,
                            range: new vscode.Range(
                                new vscode.Position(i, 0),
                                new vscode.Position(endLine, editor.document.lineAt(endLine).text.length)
                            )
                        });
                        break;
                    }
                    endLine++;
                }
            }
        }
    }
    return frames;
}

function extractFrameId(line: string): string | null {
    const match = line.match(/turbo_frame_tag\s*(?:"|')([^"']+)(?:"|')/);
    return match ? match[1] : null;
}

function extractFrameReference(line: string): string | null {
    // HTML data-turbo-frame attribute
    const dataMatch = line.match(/data-turbo-frame\s*=\s*(?:"|')([^"']+)(?:"|')/);
    if (dataMatch) return dataMatch[1];

    // Ruby data: { turbo_frame: "id" } syntax
    const rubyDataMatch = line.match(/data:\s*{\s*turbo_frame:\s*(?:"|')([^"']+)(?:"|')/);
    if (rubyDataMatch) return rubyDataMatch[1];

    return null;
}

export function deactivate() {
    if (frameDecoration) {
        frameDecoration.dispose();
    }
}

function registerCommands(context: vscode.ExtensionContext) {
    let toggleCmd = vscode.commands.registerCommand('rails-buddy.toggleTurboFrames.on', toggleTurboFrames);
    let toggleCmd2 = vscode.commands.registerCommand('rails-buddy.toggleTurboFrames.off', toggleTurboFrames);

    context.subscriptions.push(toggleCmd, toggleCmd2);
} 