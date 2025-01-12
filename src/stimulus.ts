import * as vscode from 'vscode';

const CONTROLLER_ATTR_REGEX = /(?:data-controller=["']([^"']+)["']|data:\s*{[^}]*controller:\s*["']([^"']+)["'][^}]*})/g;
const STIMULUS_ATTR_REGEX = /(?:data-([^=\s"']+)-(?:target|outlet|value)=["'][^"']*["']|data:\s*{[^}]*?([^:\s"']+?)_(?:target|outlet|value):\s*["'][^"']*["'][^}]*})/g;
const ACTION_ATTR_REGEX = /(?:data-action=["']([^"']*)["']|data:\s*{[^}]*action:\s*["']([^"']*)["'][^}]*})/g;
const ACTION_CONTROLLER_REGEX = /->([^#\s]+)#/g;

let stimulusDecorations: vscode.TextEditorDecorationType;

function normalizeControllerName(name: string): string {
    return name.replace(/[-_]/g, '-').toLowerCase();
}

interface AttributeMatch {
  range: vscode.Range;
  controllers: string[];
  value?: string;
}

function findAttributeMatches(
  editor: vscode.TextEditor,
  text: string,
  regex: RegExp,
  extractControllers: (match: RegExpExecArray) => string[]
): AttributeMatch[] {
  const matches: AttributeMatch[] = [];
  regex.lastIndex = 0;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const startPos = editor.document.positionAt(match.index);
    const endPos = editor.document.positionAt(match.index + match[0].length);
    matches.push({
      range: new vscode.Range(startPos, endPos),
      controllers: extractControllers(match),
      value: match[1] || match[2]
    });
  }
  
  return matches;
}

function findCurrentController(
  editor: vscode.TextEditor,
  cursorPosition: vscode.Position
): string[] {
  const text = editor.document.getText();
  const cursorOffset = editor.document.offsetAt(cursorPosition);

  // Check controller attributes
  const controllerMatches = findAttributeMatches(
    editor, 
    text, 
    CONTROLLER_ATTR_REGEX,
    match => (match[1] || match[2]).split(/\s+/).map(normalizeControllerName)
  );
  
  const controllerMatch = controllerMatches.find(m => m.range.contains(cursorPosition));
  if (controllerMatch) {
    return controllerMatch.controllers;
  }

  // Check action attributes
  const actionMatches = findAttributeMatches(
    editor,
    text,
    ACTION_ATTR_REGEX,
    match => {
      const controllers: string[] = [];
      const value = match[1] || match[2];
      let actionMatch;
      ACTION_CONTROLLER_REGEX.lastIndex = 0;
      while ((actionMatch = ACTION_CONTROLLER_REGEX.exec(value)) !== null) {
        controllers.push(normalizeControllerName(actionMatch[1]));
      }
      return controllers;
    }
  );

  const actionMatch = actionMatches.find(m => m.range.contains(cursorPosition));
  if (actionMatch) {
    return actionMatch.controllers;
  }

  // Check target/outlet/value attributes
  const stimulusMatches = findAttributeMatches(
    editor,
    text,
    STIMULUS_ATTR_REGEX,
    match => [normalizeControllerName(match[1] || match[2])]
  );

  const stimulusMatch = stimulusMatches.find(m => m.range.contains(cursorPosition));
  return stimulusMatch ? stimulusMatch.controllers : [];
}

async function getScopeRange(
    editor: vscode.TextEditor, 
    cursorPosition: vscode.Position,
    controller: string,
    text: string
): Promise<vscode.Range> {
    const foldingRanges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
        'vscode.executeFoldingRangeProvider', 
        editor.document.uri
    ) || [];

    const ranges = foldingRanges.map(f => new vscode.Range(
        f.start, 0,
        f.end, editor.document.lineAt(f.end).text.length
    ));

    // Find all ranges containing the cursor
    const containingRanges = ranges
        .filter(range => range.contains(cursorPosition))
        .sort((a, b) => (b.end.line - b.start.line) - (a.end.line - a.start.line));

    // Check each range from smallest to largest
    for (const range of containingRanges.reverse()) {
        const rangeText = text.slice(
            editor.document.offsetAt(range.start),
            editor.document.offsetAt(range.end)
        );

        CONTROLLER_ATTR_REGEX.lastIndex = 0;
        if (CONTROLLER_ATTR_REGEX.test(rangeText)) {
            CONTROLLER_ATTR_REGEX.lastIndex = 0;
            let match;
            while ((match = CONTROLLER_ATTR_REGEX.exec(rangeText)) !== null) {
                const controllers = (match[1] || match[2]).split(/\s+/).map(normalizeControllerName);
                if (controllers.includes(normalizeControllerName(controller))) {
                    return range;
                }
            }
        }
    }

    // Fallback to full document
    return new vscode.Range(
        new vscode.Position(0, 0),
        editor.document.lineAt(editor.document.lineCount - 1).range.end
    );
}

async function updateStimulusHighlights(editor: vscode.TextEditor | undefined) {
  if (!editor?.document.fileName.endsWith('.erb')) {
    editor?.setDecorations(stimulusDecorations, []);
    return;
  }

  const currentControllers = findCurrentController(editor, editor.selection.active);
  if (!currentControllers.length) {
    editor.setDecorations(stimulusDecorations, []);
    return;
  }

  const text = editor.document.getText();
  const decorations: vscode.DecorationOptions[] = [];
  const normalizedCurrentControllers = currentControllers.map(normalizeControllerName);

  // Create decorations for all matching attributes
  [
    { regex: CONTROLLER_ATTR_REGEX, extract: (m: RegExpExecArray) => (m[1] || m[2]).split(/\s+/) },
    { regex: STIMULUS_ATTR_REGEX, extract: (m: RegExpExecArray) => [m[1] || m[2]] },
    { regex: ACTION_ATTR_REGEX, extract: (m: RegExpExecArray) => {
      const controllers: string[] = [];
      let actionMatch;
      ACTION_CONTROLLER_REGEX.lastIndex = 0;
      while ((actionMatch = ACTION_CONTROLLER_REGEX.exec(m[1] || m[2])) !== null) {
        controllers.push(actionMatch[1]);
      }
      return controllers;
    }}
  ].forEach(({ regex, extract }) => {
    const matches = findAttributeMatches(editor, text, regex, extract);
    matches.forEach(match => {
      if (match.controllers.some(c => 
        normalizedCurrentControllers.includes(normalizeControllerName(c))
      )) {
        decorations.push({
          range: match.range,
          hoverMessage: `Controllers: ${match.controllers.map(normalizeControllerName).join(', ')}`
        });
      }
    });
  });

  // Filter by scope
  const scopeRange = await getScopeRange(editor, editor.selection.active, currentControllers[0], text);
  editor.setDecorations(stimulusDecorations, 
    decorations.filter(d => scopeRange.contains(d.range))
  );
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

export function deactivate() {
    if (stimulusDecorations) {
        stimulusDecorations.dispose();
    }
} 