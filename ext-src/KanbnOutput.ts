import * as vscode from "vscode";
import type { KanbnApi } from "./KanbnApi";

let channel: vscode.OutputChannel | undefined;

/**
 * The shared "Kanbn" output channel, where validation reports and action rule warnings are written.
 * Lives here rather than in extension.ts so that the panels can write to it without importing the
 * module that creates them
 */
export function getOutputChannel(): vscode.OutputChannel {
  if (channel === undefined) {
    channel = vscode.window.createOutputChannel("Kanbn");
  }
  return channel;
}

/**
 * Report any action rules that were skipped during the operation that just ran.
 *
 * Action rules fire on writes the extension makes - a drag can assign a task, tag it, or redirect
 * where it lands - and a rule that gets skipped otherwise does so silently, which looks like the
 * board ignoring you. Kanbn records the reasons on the instance the operation ran on.
 */
export function reportActionWarnings(kanbn: KanbnApi, operation: string): void {
  const warnings = kanbn.lastActionWarnings;
  if (!warnings || !warnings.length) {
    return;
  }

  const output = getOutputChannel();
  output.appendLine(`${new Date().toLocaleString()} — ${operation}`);
  for (const warning of warnings) {
    output.appendLine(`  ${warning}`);
  }

  vscode.window
    .showWarningMessage(
      warnings.length === 1
        ? `Kanbn skipped an action rule: ${warnings[0]}`
        : `Kanbn skipped ${warnings.length} action rules during ${operation}.`,
      "Show details"
    )
    .then((choice) => {
      if (choice === "Show details") {
        output.show(true);
      }
    });
}
