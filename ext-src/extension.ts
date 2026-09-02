import * as vscode from "vscode";
import KanbnStatusBarItem from "./KanbnStatusBarItem";
import KanbnBoardPanel from "./KanbnBoardPanel";
import KanbnBurndownPanel from "./KanbnBurndownPanel";
import KanbnGanttPanel from "./KanbnGanttPanel";
import KanbnTaskPanel from "./KanbnTaskPanel";
import type { KanbnApi } from "./KanbnApi";
import {
  validateBoard,
  renderReport,
  renderFixes,
  countProblems,
  fixableDates,
} from "./KanbnValidate";
import { getOutputChannel, reportActionWarnings } from "./KanbnOutput";
import { resolveExistingBoardSlug } from "./KanbnBoards";

// Only created when there's a workspace folder kanbn can work in
let kanbnStatusBarItem: KanbnStatusBarItem | undefined;

/**
 * Point the node process at the workspace folder kanbn should work in, and return its path.
 *
 * Kanbn reads and writes board files through node's `fs`, so it needs a folder that exists on the
 * machine the extension host is running on. That covers Remote-SSH, WSL, dev containers and
 * Codespaces, where the extension host runs alongside the files - but not a virtual workspace,
 * whose folder has no path on disk at all, and not a folder that has been deleted or unmounted
 * while the window stayed open. Both used to throw straight out of `activate()`, which stopped the
 * extension activating and left no status bar item and no explanation.
 *
 * @param action What the caller is trying to do, used to say why a workspace is needed, or null to
 * fail quietly - which is what activation wants, since having no workspace open is normal
 * @return The workspace folder path, or null if there isn't one kanbn can use
 */
function useWorkspaceFolder(action: string | null): string | null {
  const folder = (vscode.workspace.workspaceFolders ?? [])[0];
  if (folder === undefined) {
    if (action !== null) {
      vscode.window.showErrorMessage(`You need to open a workspace before ${action}.`);
    }
    return null;
  }

  if (folder.uri.scheme !== "file") {
    if (action !== null) {
      vscode.window.showErrorMessage(
        `Kanbn works on board files on disk, and "${folder.name}" isn't a folder on disk ` +
        `(${folder.uri.scheme}). Open the project locally, or through Remote-SSH, WSL, a dev ` +
        "container or a Codespace."
      );
    }
    return null;
  }

  try {
    process.chdir(folder.uri.fsPath);
  } catch (error) {
    if (action !== null) {
      vscode.window.showErrorMessage(
        "Kanbn couldn't open the workspace folder: " +
        (error instanceof Error ? error.message : String(error))
      );
    }
    return null;
  }

  return folder.uri.fsPath;
}

/**
 * Work out which board a command should act on and return an instance scoped to it.
 *
 * A workspace with a single board never prompts, so nothing changes for anyone who doesn't use
 * multiple boards. Returns null if the user dismissed the prompt.
 *
 * This lists boards rather than summarising them: a summary reads every task file on every board,
 * which is too much work to do before the user has even chosen one.
 */
async function pickBoard(
  kanbn: KanbnApi,
  placeHolder: string
): Promise<{ kanbn: KanbnApi, slug: string } | null> {
  // A target board that doesn't exist falls back to the main board rather than scoping every
  // operation to a file that isn't there
  const { slug: defaultSlug, missing } = await resolveExistingBoardSlug(kanbn);
  if (missing !== null) {
    vscode.window.showWarningMessage(
      `Board "${missing}" doesn't exist, so Kanbn is using the main board instead. ` +
      "Check the KANBN_BOARD environment variable and the defaultBoard option."
    );
  }

  let boards: Array<{ slug: string, name: string, description: string, main: boolean }> = [];
  try {
    boards = await kanbn.listBoards();
  } catch (error) {
    boards = [];
  }

  if (boards.length <= 1) {
    return { kanbn: kanbn.board(defaultSlug), slug: defaultSlug };
  }

  const picked = await vscode.window.showQuickPick(
    boards.map((board) => ({
      label: board.name,
      description: board.slug === defaultSlug ? `${board.slug} — default` : board.slug,
      detail: board.description || undefined,
      slug: board.slug,
    })),
    {
      placeHolder,
      canPickMany: false,
    }
  );
  if (picked === undefined) {
    return null;
  }
  return { kanbn: kanbn.board(picked.slug), slug: picked.slug };
}

export async function activate(context: vscode.ExtensionContext) {
  // Where validation reports and action rule warnings are written
  const kanbnOutputChannel = getOutputChannel();
  context.subscriptions.push(kanbnOutputChannel);

  // Register a command to initialise Kanbn in the current workspace. This command will be invoked when the status
  // bar item is clicked in a workspace where Kanbn isn't already initialised.
  context.subscriptions.push(
    vscode.commands.registerCommand("kanbn.init", async () => {
      const workspacePath = useWorkspaceFolder("initialising Kanbn");
      if (workspacePath === null) {
        return;
      }

      // Import kanbn, now that the process is pointed at the workspace
      const kanbn = (await import("@basementuniverse/kanbn/src/main")) as unknown as KanbnApi;

      // If kanbn is already initialised, get the project name
      let projectName = "";
      if (await kanbn.initialised()) {
        projectName = (await kanbn.getIndex()).name;
      }

      // Prompt for a new project name
      const newProjectName = await vscode.window.showInputBox({
        value: projectName,
        placeHolder: "The project name.",
        validateInput: (text) => {
          return text.length < 1 ? "The project name cannot be empty." : null;
        },
      });

      // If the input prompt wasn't cancelled, initialise kanbn
      if (newProjectName !== undefined) {
        await kanbn.initialise({
          name: newProjectName,
        });
        vscode.window.showInformationMessage(`Initialised Kanbn project '${newProjectName}'.`);
        KanbnBoardPanel.update();
      }
      kanbnStatusBarItem?.update();
    })
  );

  // Register a command to open the kanbn board. This command will be invoked when the status bar item is clicked
  // in a workspace where kanbn has already been initialised.
  context.subscriptions.push(
    vscode.commands.registerCommand("kanbn.board", async () => {
      const workspacePath = useWorkspaceFolder("viewing the Kanbn board");
      if (workspacePath === null) {
        return;
      }

      // Import kanbn, now that the process is pointed at the workspace
      const kanbn = (await import("@basementuniverse/kanbn/src/main")) as unknown as KanbnApi;

      // If kanbn is initialised, view the kanbn board
      if (await kanbn.workspaceInitialised()) {
        const target = await pickBoard(kanbn, "Open which board?");
        if (target !== null) {
          KanbnBoardPanel.createOrShow(
            context.extensionPath,
            workspacePath,
            target.kanbn,
            await kanbn.getFolderName(),
            target.slug
          );
          KanbnBoardPanel.update(target.slug);
        }
      } else {
        vscode.window.showErrorMessage("You need to initialise Kanbn before viewing the Kanbn board.");
      }
      kanbnStatusBarItem?.update();
    })
  );

  // Register a command to add a new kanbn task.
  context.subscriptions.push(
    vscode.commands.registerCommand("kanbn.addTask", async () => {
      const workspacePath = useWorkspaceFolder("adding a new task");
      if (workspacePath === null) {
        return;
      }

      // Import kanbn, now that the process is pointed at the workspace
      const kanbn = (await import("@basementuniverse/kanbn/src/main")) as unknown as KanbnApi;

      // If kanbn is initialised, open the task webview
      if (await kanbn.workspaceInitialised()) {
        const target = await pickBoard(kanbn, "Add a task to which board?");
        if (target !== null) {
          KanbnTaskPanel.show(
            context.extensionPath,
            workspacePath,
            target.kanbn,
            await kanbn.getFolderName(),
            null,
            null,
            target.slug
          );
        }
      } else {
        vscode.window.showErrorMessage("You need to initialise Kanbn before adding a new task.");
      }
    })
  );

  // Register a command to open a burndown chart.
  context.subscriptions.push(
    vscode.commands.registerCommand("kanbn.burndown", async () => {
      const workspacePath = useWorkspaceFolder("viewing the burndown chart");
      if (workspacePath === null) {
        return;
      }

      // Import kanbn, now that the process is pointed at the workspace
      const kanbn = (await import("@basementuniverse/kanbn/src/main")) as unknown as KanbnApi;

      // If kanbn is initialised, view the burndown chart
      if (await kanbn.workspaceInitialised()) {
        const target = await pickBoard(kanbn, "Chart which board?");
        if (target !== null) {
          await KanbnBurndownPanel.createOrShow(
            context.extensionPath,
            workspacePath,
            target.kanbn,
            await kanbn.getFolderName(),
            target.slug
          );
          KanbnBurndownPanel.update(target.slug);
        }
      } else {
        vscode.window.showErrorMessage("You need to initialise Kanbn before viewing the burndown chart.");
      }
      kanbnStatusBarItem?.update();
    })
  );

  // Register a command to open a gantt chart.
  context.subscriptions.push(
    vscode.commands.registerCommand("kanbn.gantt", async () => {
      const workspacePath = useWorkspaceFolder("viewing the gantt chart");
      if (workspacePath === null) {
        return;
      }

      // Import kanbn, now that the process is pointed at the workspace
      const kanbn = (await import("@basementuniverse/kanbn/src/main")) as unknown as KanbnApi;

      // If kanbn is initialised, view the gantt chart
      if (await kanbn.workspaceInitialised()) {
        const target = await pickBoard(kanbn, "Chart which board?");
        if (target !== null) {
          await KanbnGanttPanel.createOrShow(
            context.extensionPath,
            workspacePath,
            target.kanbn,
            await kanbn.getFolderName(),
            target.slug
          );
          KanbnGanttPanel.update(target.slug);
        }
      } else {
        vscode.window.showErrorMessage("You need to initialise Kanbn before viewing the gantt chart.");
      }
      kanbnStatusBarItem?.update();
    })
  );

  // Register a command to check a board and its tasks for problems.
  context.subscriptions.push(
    vscode.commands.registerCommand("kanbn.validate", async () => {
      const workspacePath = useWorkspaceFolder("validating a Kanbn board");
      if (workspacePath === null) {
        return;
      }

      const kanbn = (await import("@basementuniverse/kanbn/src/main")) as unknown as KanbnApi;

      if (!(await kanbn.workspaceInitialised())) {
        vscode.window.showErrorMessage("You need to initialise Kanbn before validating a board.");
        return;
      }

      const target = await pickBoard(kanbn, "Validate which board?");
      if (target === null) {
        return;
      }

      let boardName = target.slug;
      try {
        boardName = (await target.kanbn.getIndex()).name;
      } catch (error) {
        // The report names the board either way, and validate() reports why it wouldn't load
      }

      const report = await validateBoard(target.kanbn, target.slug, boardName);
      kanbnOutputChannel.clear();
      kanbnOutputChannel.appendLine(renderReport(report));

      const problems = countProblems(report);
      if (problems === 0) {
        vscode.window.showInformationMessage(`Kanbn: everything OK on "${boardName}".`);
        return;
      }

      // Dates that can be filled in from a task's own history are the one thing this command can
      // put right, so it offers to. Everything else is a judgement call for the user
      const fixable = fixableDates(report);
      const actions = fixable.length
        ? ["Show report", `Fill in ${fixable.length} missing ${fixable.length === 1 ? "date" : "dates"}`]
        : ["Show report"];
      const summary = report.errors.length
        ? `Kanbn found ${report.errors.length} ${report.errors.length === 1 ? "error" : "errors"} on "${boardName}".`
        : `Kanbn found ${problems} ${problems === 1 ? "problem" : "problems"} on "${boardName}".`;

      const choice = report.errors.length
        ? await vscode.window.showErrorMessage(summary, ...actions)
        : await vscode.window.showWarningMessage(summary, ...actions);

      if (choice === "Show report") {
        kanbnOutputChannel.show(true);
        return;
      }
      if (choice !== undefined && choice.indexOf("Fill in") === 0) {
        let fixed: any[] = [];
        try {
          fixed = await (target.kanbn as any).fixDateDrift();
        } catch (error) {
          vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
          return;
        }
        kanbnOutputChannel.appendLine("");
        kanbnOutputChannel.appendLine(renderFixes(fixed));
        kanbnOutputChannel.show(true);
        KanbnBoardPanel.update();
        kanbnStatusBarItem?.update();
      }
    })
  );

  // Register a command to archive tasks.
  context.subscriptions.push(
    vscode.commands.registerCommand("kanbn.archiveTasks", async () => {
      const workspacePath = useWorkspaceFolder("sending tasks to the archive");
      if (workspacePath === null) {
        return;
      }

      // Import kanbn, now that the process is pointed at the workspace
      const kanbn = (await import("@basementuniverse/kanbn/src/main")) as unknown as KanbnApi;

      const target = await pickBoard(kanbn, "Archive tasks from which board?");
      if (target === null) {
        return;
      }

      // Get a list of tracked tasks
      let tasks: string[] = [];
      try {
        tasks = [...(await target.kanbn.findTrackedTasks())];
      } catch (e) {}
      if (tasks.length === 0) {
        vscode.window.showInformationMessage("There are no tasks to archive.");
        return;
      }

      // Archiving is workspace-wide: the task leaves every board it was on, not just this one
      const multiBoard = (await kanbn.listBoards()).length > 1;

      // Prompt for a selection of tasks to archive
      const archiveTaskIds = await vscode.window.showQuickPick(
        tasks,
        {
          placeHolder: multiBoard
            ? 'Select tasks to archive (removes them from every board)...'
            : 'Select tasks to archive...',
          canPickMany: true,
        }
      );
      if (archiveTaskIds !== undefined && archiveTaskIds.length > 0) {
        for (let archiveTaskId of archiveTaskIds) {
          try {
            await target.kanbn.archiveTask(archiveTaskId);
            reportActionWarnings(target.kanbn, `archiving ${archiveTaskId}`);
          } catch (error) {
            vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
            return;
          }
        }
        KanbnBoardPanel.update();
        kanbnStatusBarItem?.update();
        if (vscode.workspace.getConfiguration("kanbn").get("showTaskNotifications")) {
          vscode.window.showInformationMessage(
            `Archived ${archiveTaskIds.length} task${archiveTaskIds.length === 1 ? '' : 's'}.`
          );
        }
      }
    })
  );

  // Register a command to restore a task from the archive.
  context.subscriptions.push(
    vscode.commands.registerCommand("kanbn.restoreTasks", async () => {
      const workspacePath = useWorkspaceFolder("restoring tasks from the archive");
      if (workspacePath === null) {
        return;
      }

      // Import kanbn, now that the process is pointed at the workspace
      const kanbn = (await import("@basementuniverse/kanbn/src/main")) as unknown as KanbnApi;

      const target = await pickBoard(kanbn, "Restore tasks onto which board?");
      if (target === null) {
        return;
      }

      // Get a list of archived tasks
      let archivedTasks: string[] = [];
      try {
        archivedTasks = await target.kanbn.listArchivedTasks();
      } catch (e) {}
      if (archivedTasks.length === 0) {
        vscode.window.showInformationMessage("There are no archived tasks to restore.");
        return;
      }

      // Prompt for a selection of tasks to restore
      const restoreTaskIds = await vscode.window.showQuickPick(
        archivedTasks,
        {
          placeHolder: 'Select tasks to restore...',
          canPickMany: true,
        }
      );
      if (restoreTaskIds !== undefined && restoreTaskIds.length > 0) {

        // An archived task remembers the column it occupied on every board it was on, so restoring
        // it to all of them has no single column to ask about
        let multiBoard = false;
        try {
          multiBoard = (await kanbn.listBoards()).length > 1;
        } catch (error) {
          multiBoard = false;
        }

        let singleBoard = false;
        if (multiBoard) {
          const scope = await vscode.window.showQuickPick(
            [
              'All of their original boards',
              'This board only',
            ],
            {
              placeHolder: 'Restore tasks to...',
              canPickMany: false,
            }
          );
          if (scope === undefined) {
            return;
          }
          singleBoard = scope === 'This board only';
        }

        // Prompt for a column to restore the tasks into. Restoring across boards uses each board's
        // remembered column, so there is nothing to pick
        let restoreColumn: string | undefined = 'None (use original)';
        if (!multiBoard || singleBoard) {
          const index = await target.kanbn.getIndex();
          restoreColumn = await vscode.window.showQuickPick(
            [
              'None (use original)',
              ...Object.keys(index.columns)
            ],
            {
              canPickMany: false
            }
          );
        }
        if (restoreColumn !== undefined) {
          const warnings: string[] = [];
          for (let restoreTaskId of restoreTaskIds) {
            try {
              await target.kanbn.restoreTask(
                restoreTaskId,
                restoreColumn === 'None (use original)' ? null : restoreColumn,
                singleBoard
              );
              reportActionWarnings(target.kanbn, `restoring ${restoreTaskId}`);
            } catch (error) {
              vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
              return;
            }

            // Boards that have been deleted since the task was archived are skipped rather than
            // failing the restore, and it's worth saying so
            warnings.push(...target.kanbn.lastRestoreWarnings);
          }
          KanbnBoardPanel.update();
          kanbnStatusBarItem?.update();
          if (warnings.length) {
            vscode.window.showWarningMessage(
              `Some boards were skipped while restoring: ${[...new Set(warnings)].join(', ')}.`
            );
          }
          if (vscode.workspace.getConfiguration("kanbn").get("showTaskNotifications")) {
            vscode.window.showInformationMessage(
              `Restored ${restoreTaskIds.length} task${restoreTaskIds.length === 1 ? '' : 's'}.`
            );
          }
        }
      }
    })
  );

  // If there's a workspace folder kanbn can use, add a status bar item and start watching for file
  // changes. Failing quietly here is deliberate: a window with no folder open is an ordinary thing,
  // and a folder kanbn can't work in explains itself when a command is run rather than nagging on
  // startup
  const uri = useWorkspaceFolder(null);
  if (uri !== null) {
    const kanbn = (await import("@basementuniverse/kanbn/src/main")) as unknown as KanbnApi;

    // Create status bar item
    kanbnStatusBarItem = new KanbnStatusBarItem(context, kanbn);
    kanbnStatusBarItem?.update();
    KanbnBoardPanel.update();

    // Initialise file watchers
    const kanbnFolderName = await kanbn.getFolderName();

    // Everything inside the kanbn folder. Board files sit at its root and task and archive files in
    // subfolders, so this has to recurse: `<folder>/**.*` only ever matched the root, because `**`
    // is a globstar only when it's a whole path segment and otherwise behaves like `*`
    const kanbnFolderWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(uri, `${kanbnFolderName}/**/*`)
    );

    // The config file lives at the workspace root, outside the kanbn folder, so it needs a watcher
    // of its own
    const configWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(uri, "kanbn.{yml,json}")
    );

    // One save can produce several events, and each one costs every open panel a full reload
    let updateTimeout: ReturnType<typeof setTimeout> | undefined;
    const updatePanels = () => {
      if (updateTimeout !== undefined) {
        clearTimeout(updateTimeout);
      }
      updateTimeout = setTimeout(() => {
        updateTimeout = undefined;

        // Kanbn memoizes the config file and the workspace options derived from it, so a change on
        // disk stays invisible until the cache is dropped
        kanbn.clearConfigCache();
        kanbnStatusBarItem?.update();
        KanbnBoardPanel.update();
        KanbnBurndownPanel.update();
        KanbnGanttPanel.update();
      }, 150);
    };

    for (const watcher of [kanbnFolderWatcher, configWatcher]) {
      context.subscriptions.push(watcher);
      watcher.onDidChange(updatePanels);
      watcher.onDidCreate(updatePanels);
      watcher.onDidDelete(updatePanels);
    }
  }

  // Handle configuration changes
  vscode.workspace.onDidChangeConfiguration((e) => {
    kanbnStatusBarItem?.update();
    KanbnBoardPanel.update();
  });
}
