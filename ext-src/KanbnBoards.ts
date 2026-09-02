import type { KanbnApi } from "./KanbnApi";

// The error kanbn throws when the board file an instance is scoped to isn't there. It says nothing
// about which board, because it predates a workspace being able to hold more than one
const NOT_INITIALISED = "Not initialised in this folder";

/**
 * Work out which board a command should act on, falling back to the main board when the board it
 * would otherwise target doesn't exist.
 *
 * Kanbn resolves a target board from the KANBN_BOARD environment variable and then the
 * `defaultBoard` option, either of which can name a board that was never created or has since been
 * deleted. Scoping to it anyway leaves every operation reporting that kanbn isn't initialised here,
 * which is both wrong and a long way from the actual problem - so a target that isn't there falls
 * back to the main board, and says which board it was looking for.
 *
 * Only call this once the workspace is known to be initialised: the fallback is only safe because
 * the main board is known to exist.
 *
 * @param kanbn The workspace-scoped Kanbn instance
 * @return The board slug to use, and the missing board's slug when one was skipped
 */
export async function resolveExistingBoardSlug(
  kanbn: KanbnApi
): Promise<{ slug: string, missing: string | null }> {
  const slug = await kanbn.resolveBoardSlug(await kanbn.resolveTargetBoard());
  if (await kanbn.boardExists(slug)) {
    return { slug, missing: null };
  }

  const mainSlug = await kanbn.getMainBoardSlug();
  return { slug: mainSlug, missing: slug === mainSlug ? null : slug };
}

/**
 * Describe an error from a board-scoped operation in terms of what actually went wrong.
 *
 * A board file that isn't there and a workspace that was never initialised are the same error to
 * kanbn, and telling someone with a perfectly good `.kanbn` folder that it doesn't exist sends them
 * off to initialise a board they already have.
 *
 * @param kanbn The instance the operation failed on
 * @param boardSlug The board the operation was scoped to
 * @param error The error kanbn threw
 * @return A message to show the user
 */
export async function describeBoardError(
  kanbn: KanbnApi,
  boardSlug: string,
  error: unknown
): Promise<string> {
  const message = error instanceof Error ? error.message : String(error);
  if (message !== NOT_INITIALISED) {
    return message;
  }

  let workspaceInitialised = false;
  try {
    workspaceInitialised = await kanbn.workspaceInitialised();
  } catch (e) {
    workspaceInitialised = false;
  }

  return workspaceInitialised
    ? `Board "${boardSlug}" doesn't exist in this workspace.`
    : "Kanbn hasn't been initialised in this folder.";
}
