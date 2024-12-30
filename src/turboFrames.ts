import * as vscode from 'vscode';

let frameDecoration: vscode.TextEditorDecorationType;

interface TurboFrame {
    id: string;
    range: vscode.Range;
}

export function initializeTurboFrameHighlighting(context: vscode.ExtensionContext) {
    frameDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(100, 100, 250, 0.1)',
        isWholeLine: true,
    });

    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(e => updateFrameHighlight(e.textEditor)),
        vscode.window.onDidChangeActiveTextEditor(editor => updateFrameHighlight(editor)),
        frameDecoration
    );
}

async function updateFrameHighlight(editor: vscode.TextEditor | undefined) {
    if (!editor?.document || !editor.document.fileName.endsWith('.erb')) {
        return;
    }

    const foldingRanges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
        'vscode.executeFoldingRangeProvider', 
        editor.document.uri
    ) || [];

    const cursorPos = editor.selection.active;
    const currentLine = editor.document.lineAt(cursorPos.line).text;
    
    // First check if the current line references a frame
    const frameRef = extractFrameReference(currentLine);
    if (frameRef) {
        // Find and highlight the referenced frame
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

function findContainingFrame(editor: vscode.TextEditor, cursorPos: vscode.Position, foldingRanges: vscode.FoldingRange[]): vscode.Range[] {
    const currentLine = editor.document.lineAt(cursorPos.line).text;
    
    // Check if we're on a single-line frame
    if (currentLine.includes('turbo_frame_tag')) {
        return [new vscode.Range(
            new vscode.Position(cursorPos.line, 0),
            new vscode.Position(cursorPos.line, currentLine.length)
        )];
    }

    // Check if we're inside a multi-line frame
    for (const range of foldingRanges) {
        const startLine = range.start;
        const endLine = range.end;
        const lineText = editor.document.lineAt(startLine).text;

        if (lineText.includes('turbo_frame_tag') && 
            cursorPos.line >= startLine && 
            cursorPos.line <= endLine) {
            
            return [new vscode.Range(
                new vscode.Position(startLine, 0),
                new vscode.Position(endLine, editor.document.lineAt(endLine).text.length)
            )];
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
                        new vscode.Position(range.end, editor.document.lineAt(range.end).text.length)
                    )
                });
            } else {
                frames.push({
                    id,
                    range: new vscode.Range(
                        new vscode.Position(i, 0),
                        new vscode.Position(i, lines[i].length)
                    )
                });
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

export function disposeTurboFrameHighlighting() {
    if (frameDecoration) {
        frameDecoration.dispose();
    }
} 