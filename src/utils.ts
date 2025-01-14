import * as vscode from 'vscode'

// export function createToggleCommands(context: vscode.ExtensionContext, feature: string, callback: () => void) {
//     ['on', 'off'].forEach(state => {
//         context.subscriptions.push(
//             vscode.commands.registerCommand(`rails-buddy.toggle${feature}.${state}`, callback)
//         );
//     });
// }

// export function setFeatureContext(feature: string, state: boolean) {
//     return vscode.commands.executeCommand('setContext', `railsBuddy.${feature}Enabled`, state);
// }

// export function createDecorationStyle(color: string) {
//     return vscode.window.createTextEditorDecorationType({
//         backgroundColor: `rgba(${color}, 0.15)`,
//         isWholeLine: true,
//         borderRadius: '3px',
//         overviewRulerColor: `rgba(${color}, 0.8)`,
//         overviewRulerLane: vscode.OverviewRulerLane.Right,
//         light: {
//             backgroundColor: `rgba(${color}, 0.1)`,
//         }
//     });
// }

// export class RegexHelper {
//     private regex: RegExp;
    
//     constructor(pattern: RegExp) {
//         this.regex = new RegExp(pattern);
//     }

//     findMatches(text: string, callback: (match: RegExpExecArray) => void) {
//         this.regex.lastIndex = 0;
//         let match;
//         while ((match = this.regex.exec(text)) !== null) {
//             callback(match);
//         }
//     }

//     test(text: string): boolean {
//         this.regex.lastIndex = 0;
//         return this.regex.test(text);
//     }
// }

export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout
    return (...args: Parameters<T>) => {
        clearTimeout(timeout)
        timeout = setTimeout(() => func(...args), wait)
    }
} 