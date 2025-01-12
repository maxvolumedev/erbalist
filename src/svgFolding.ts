import * as vscode from 'vscode';

let foldedRanges: Set<number> = new Set();

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('rails-buddy.foldSvg', foldSvgTags),
        vscode.commands.registerCommand('rails-buddy.expandSvg', expandSvgTags)
    );
}

async function foldSvgTags() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;
    const text = document.getText();
    
    const foldingRanges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
        'vscode.executeFoldingRangeProvider', 
        editor.document.uri
    ) || [];

    const svgRanges = foldingRanges.filter(range => {
        const lineText = document.lineAt(range.start).text;
        return /<svg[\s>]/.test(lineText) && !foldedRanges.has(range.start);
    });

    for (const range of svgRanges) {
        foldedRanges.add(range.start);
    }

    await applyFolds(editor, svgRanges);
}

async function expandSvgTags() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    
    foldedRanges.clear();
    await vscode.commands.executeCommand('editor.unfoldAll');
}

async function applyFolds(editor: vscode.TextEditor, ranges: vscode.FoldingRange[]) {
    await vscode.commands.executeCommand('editor.fold', {
        selectionLines: ranges.map(range => range.start)
    });
} 

export function deactivate() {}