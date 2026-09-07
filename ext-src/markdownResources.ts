import * as path from "path";
import * as vscode from "vscode";

/**
 * Paths written into markdown are resolved the same way for links and images, so that a path that
 * opens as a link also displays as an image. Both panels that render markdown share this module so
 * the two can't drift apart.
 *
 * The rules, in order:
 *   - `workspace:` / `project:` prefix  ->  relative to the workspace folder
 *   - a URI with a scheme               ->  used as-is (http, https, mailto, tel, file, ...)
 *   - anything else                     ->  relative to the kanbn folder, which is where the task
 *                                           files that contain these paths live
 */

/** Match a `workspace:` or `project:` prefix, which anchors a path to the workspace folder */
const WORKSPACE_PREFIX_REGEX = /^(workspace|project):/i;

/** Match a URI scheme, e.g. the `https:` in `https://example.com` */
const SCHEME_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

/**
 * Strip a `workspace:` or `project:` prefix, returning the path it anchors to the workspace folder,
 * or null if the href isn't prefixed
 */
function stripWorkspacePrefix(href: string): string | null {
  if (!WORKSPACE_PREFIX_REGEX.test(href)) {
    return null;
  }

  // The leading separators are dropped so path.resolve treats what's left as relative - otherwise
  // `workspace:/notes.md` would resolve to the filesystem root instead of the workspace folder
  return href.replace(WORKSPACE_PREFIX_REGEX, "").replace(/^[\\/]+/, "");
}

/** Check if an href carries a URI scheme, e.g. `https:` or `file:` */
function hasScheme(href: string): boolean {
  return SCHEME_REGEX.test(href);
}

/**
 * Undo the percent-encoding a markdown parser applies to a link target
 *
 * `[a](<workspace:sub dir/b.pdf>)` reaches us as `workspace:sub%20dir/b.pdf`, and resolving that
 * against the filesystem would look for a folder literally called `sub%20dir`. A name containing a
 * stray `%` isn't valid encoding and throws, in which case it was never encoded to begin with
 */
function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

/**
 * The local folders a markdown-rendering webview is allowed to load files from
 *
 * The workspace folder is included so that images stored alongside the project - screenshots in
 * `docs/`, diagrams next to the code they describe - display in a task. Without it the webview
 * refuses to load them and the user sees nothing but alt text
 */
export function markdownLocalResourceRoots(
  extensionPath: string,
  workspacePath: string
): vscode.Uri[] {
  return [
    vscode.Uri.file(path.join(extensionPath, "build")),
    vscode.Uri.file(workspacePath),
    vscode.Uri.file(path.join(extensionPath, "node_modules", "@vscode", "codicons", "dist")),
  ];
}

/**
 * Build the `data-` attributes that tell the webview where to resolve markdown image paths
 *
 * The webview can't call asWebviewUri itself, so it's handed the two base URIs it needs plus the
 * workspace's filesystem path, which lets it map an absolute path back onto a webview URI
 */
export function markdownRootAttributes(
  webview: vscode.Webview,
  workspacePath: string,
  kanbnFolderName: string
): string {
  const workspaceUri = webview.asWebviewUri(vscode.Uri.file(workspacePath));
  const kanbnUri = webview.asWebviewUri(vscode.Uri.file(path.join(workspacePath, kanbnFolderName)));
  return [
    `data-workspace-uri="${escapeAttribute(workspaceUri.toString())}"`,
    `data-kanbn-uri="${escapeAttribute(kanbnUri.toString())}"`,
    `data-workspace-path="${escapeAttribute(workspacePath)}"`,
  ].join(" ");
}

/** Escape a value for use inside a double-quoted HTML attribute */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Open a link that the user clicked in a rendered markdown preview
 *
 * Web addresses open in the user's browser, everything else opens as a document in the editor
 */
export async function openMarkdownLink(
  workspacePath: string,
  kanbnFolderName: string,
  href: string
): Promise<void> {
  if (!href || href.charAt(0) === "#") {
    return;
  }

  try {
    const trimmedHref = href.trim();
    const prefixedPath = stripWorkspacePrefix(trimmedHref);

    if (prefixedPath !== null) {
      await openDocument(vscode.Uri.file(path.resolve(workspacePath, decodePath(prefixedPath))));
      return;
    }

    if (hasScheme(trimmedHref)) {
      const uri = vscode.Uri.parse(trimmedHref);
      if (uri.scheme === "http" || uri.scheme === "https" || uri.scheme === "mailto" || uri.scheme === "tel") {
        await vscode.env.openExternal(uri);
        return;
      }

      if (uri.scheme === "file") {
        await openDocument(uri);
        return;
      }
    }

    await openDocument(
      vscode.Uri.file(path.resolve(workspacePath, kanbnFolderName, decodePath(trimmedHref)))
    );
  } catch (error) {
    vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Show a local file
 *
 * Images and other binary files can't be opened as text documents, so they're handed to the editor's
 * default handler for the file type instead - which shows an image preview rather than a wall of
 * mojibake
 */
async function openDocument(uri: vscode.Uri): Promise<void> {
  if (isBinaryPreviewable(uri.fsPath)) {
    await vscode.commands.executeCommand("vscode.open", uri);
    return;
  }

  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
}

/** File types the editor has a better viewer for than the plain text editor */
const BINARY_PREVIEWABLE_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".avif", ".svg", ".pdf",
];

function isBinaryPreviewable(fsPath: string): boolean {
  return BINARY_PREVIEWABLE_EXTENSIONS.indexOf(path.extname(fsPath).toLowerCase()) !== -1;
}
