import * as vscode from 'vscode';

export function registerSvgFolding(context: vscode.ExtensionContext) {
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
    
    const foldingRanges = findSvgRanges(text);
    await applyFolds(editor, foldingRanges);
}

async function expandSvgTags() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    
    await vscode.commands.executeCommand('editor.unfoldAll');
}

function findSvgRanges(text: string): vscode.FoldingRange[] {
    const ranges: vscode.FoldingRange[] = [];
    const svgRegex = /<svg[\s\S]*?<\/svg>/g;
    
    let match;
    while ((match = svgRegex.exec(text)) !== null) {
        const startPos = text.substring(0, match.index).split('\n').length - 1;
        const endPos = text.substring(0, match.index + match[0].length).split('\n').length - 1;
        
        if (startPos !== endPos) {
            ranges.push(new vscode.FoldingRange(startPos, endPos));
        }
    }
    
    return ranges;
}

async function applyFolds(editor: vscode.TextEditor, ranges: vscode.FoldingRange[]) {
    await vscode.commands.executeCommand('editor.fold', {
        selectionLines: ranges.map(range => range.start)
    });
} 