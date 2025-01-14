// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import * as types from "./types"

import * as ruby from './emphasizeRuby'
import * as tailwind from './tailwindcss'
import * as stimulus from './stimulus'
import * as turbo from './turboFrames'
import * as svg from './svgFolding'

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {	
  ruby.activate(context)
  tailwind.activate(context)
	stimulus.activate(context)
	turbo.activate(context)
	svg.activate(context)
}

// This method is called when your extension is deactivated
export function deactivate() {
  tailwind.deactivate()
  ruby.deactivate()
  stimulus.deactivate()
  turbo.deactivate()
  svg.deactivate()
}
