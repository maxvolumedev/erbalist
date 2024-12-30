import * as vscode from 'vscode';

let frameDecoration: vscode.TextEditorDecorationType;

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
    const decorations: vscode.Range[] = [];

    for (const range of foldingRanges) {
        const startLine = range.start;
        const endLine = range.end;
        const lineText = editor.document.lineAt(startLine).text;

        if (lineText.includes('turbo_frame_tag') && 
            cursorPos.line >= startLine && 
            cursorPos.line <= endLine) {
            
            decorations.push(new vscode.Range(
                new vscode.Position(startLine, 0),
                new vscode.Position(endLine, editor.document.lineAt(endLine).text.length)
            ));
        }
    }

    editor.setDecorations(frameDecoration, decorations);
}

export function disposeTurboFrameHighlighting() {
    if (frameDecoration) {
        frameDecoration.dispose();
    }
} 