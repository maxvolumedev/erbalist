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

    const foldingRanges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
        'vscode.executeFoldingRangeProvider', 
        editor.document.uri
    ) || [];

    const svgRanges = foldingRanges.filter(range => 
        /<svg[\s>]/.test(editor.document.lineAt(range.start).text) && 
        !foldedRanges.has(range.start)
    );

    svgRanges.forEach(range => foldedRanges.add(range.start));
    await vscode.commands.executeCommand('editor.fold', { selectionLines: svgRanges.map(range => range.start) });
}

async function expandSvgTags() {
    foldedRanges.clear();
    await vscode.commands.executeCommand('editor.unfoldAll');
}

export function deactivate() {}