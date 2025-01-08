// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as types from "./types";
import { initializeStimulusHighlighting, disposeStimulusHighlighting } from './stimulus';
import { initializeTurboFrameHighlighting, disposeTurboFrameHighlighting, registerTurboFrameCommands } from './turboFrames';
import { registerSvgFolding } from './svgFolding';
import * as ruby from './emphasizeRuby';
import * as tailwind from './tailwindcss';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {	
  ruby.activate(context);
  tailwind.activate(context);

	initializeStimulusHighlighting(context);
	initializeTurboFrameHighlighting(context);
	registerTurboFrameCommands(context);
	registerSvgFolding(context);
}

// This method is called when your extension is deactivated
export function deactivate() {
  tailwind.deactivate();
  ruby.deactivate();
	disposeStimulusHighlighting();
	disposeTurboFrameHighlighting();
}
