/**
 * Resolving the paths that appear in markdown links and images
 *
 * Kept apart from the rendering component so it can be exercised on its own: it's fiddly, it has to
 * agree with the extension host's link handling in ext-src/markdownResources.ts, and getting it
 * wrong shows up as an image that silently doesn't load.
 */

/** Match a `workspace:` or `project:` prefix, which anchors a path to the workspace folder */
const WORKSPACE_PREFIX_REGEX = /^(workspace|project):/i;

/** Match a URI scheme, e.g. the `https:` in `https://example.com` */
const SCHEME_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

/** Match a Windows drive path, e.g. `C:\images`, which otherwise looks like a `c:` URI scheme */
const WINDOWS_DRIVE_REGEX = /^[a-zA-Z]:[\\/]/;

/** Match a path that starts at a filesystem root */
const ABSOLUTE_PATH_REGEX = /^[\\/]/;

type ResourceBases = {
  workspaceUri: string,
  kanbnUri: string,
  workspacePath: string,
};

/**
 * Where the webview resolves markdown paths to
 *
 * A webview can't turn a file path into something it's allowed to load - only the extension host
 * can, via asWebviewUri - so the host writes the two base URIs onto the root element and they're
 * read back here. They don't change for the lifetime of a panel, so they're read once
 */
let cachedBases: ResourceBases | null | undefined;

function getResourceBases(): ResourceBases | null {
  if (cachedBases === undefined) {
    const root = typeof document !== 'undefined' ? document.getElementById('root') : null;
    const data = root ? root.dataset : undefined;
    cachedBases = data && data.workspaceUri && data.kanbnUri
      ? {
        workspaceUri: data.workspaceUri,
        kanbnUri: data.kanbnUri,
        workspacePath: data.workspacePath || '',
      }
      : null;
  }

  return cachedBases;
}

/** Resolve a relative path against a base URI, e.g. `../logo.png` against the kanbn folder */
function resolveAgainst(baseUri: string, relativePath: string): string {
  try {
    return new URL(relativePath, baseUri.replace(/\/?$/, '/')).toString();
  } catch (error) {
    return relativePath;
  }
}

/** Convert a `file:` URI to a filesystem path, or null if it isn't one */
function fileUriToPath(uri: string): string | null {
  if (!/^file:/i.test(uri)) {
    return null;
  }

  try {
    const pathname = decodeURIComponent(new URL(uri).pathname);

    // A Windows file URI is `file:///C:/images/a.png`, and the leading slash isn't part of the path
    return WINDOWS_DRIVE_REGEX.test(pathname.slice(1)) ? pathname.slice(1) : pathname;
  } catch (error) {
    return null;
  }
}

function normalisePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Turn an absolute filesystem path into something the webview can load
 *
 * Only paths inside the workspace can be shown: the webview's localResourceRoots stop at the
 * workspace folder, so anything outside it is left alone and renders as alt text
 */
function resolveAbsolutePath(fsPath: string, bases: ResourceBases): string {
  const workspace = normalisePath(bases.workspacePath);
  const target = normalisePath(fsPath);

  if (!workspace) {
    return fsPath;
  }

  // Windows and macOS paths are case-insensitive, and a case-sensitive comparison would reject
  // paths that are genuinely inside the workspace
  const workspaceKey = workspace.toLowerCase();
  const targetKey = target.toLowerCase();
  if (targetKey !== workspaceKey && targetKey.indexOf(`${workspaceKey}/`) !== 0) {
    return fsPath;
  }

  return resolveAgainst(bases.workspaceUri, target.slice(workspace.length + 1));
}

/**
 * Resolve a path written in markdown to a URI the webview is allowed to load
 *
 * The rules match the ones the extension host uses to open links, so that a path which opens as a
 * link also displays as an image:
 *   - `workspace:` / `project:` prefix  ->  relative to the workspace folder
 *   - `http:`, `https:`, `data:`        ->  left alone
 *   - an absolute path or `file:` URI   ->  shown if it's inside the workspace
 *   - anything else                     ->  relative to the kanbn folder
 */
export function resolveMarkdownResource(source: string): string {
  if (!source) {
    return source;
  }

  const trimmed = source.trim();
  if (trimmed.charAt(0) === '#') {
    return trimmed;
  }

  const bases = getResourceBases();
  if (bases === null) {
    return trimmed;
  }

  if (WORKSPACE_PREFIX_REGEX.test(trimmed)) {
    return resolveAgainst(
      bases.workspaceUri,
      trimmed.replace(WORKSPACE_PREFIX_REGEX, '').replace(/^[\\/]+/, '')
    );
  }

  if (WINDOWS_DRIVE_REGEX.test(trimmed) || ABSOLUTE_PATH_REGEX.test(trimmed)) {
    return resolveAbsolutePath(trimmed, bases);
  }

  if (SCHEME_REGEX.test(trimmed)) {
    const filePath = fileUriToPath(trimmed);
    return filePath === null ? trimmed : resolveAbsolutePath(filePath, bases);
  }

  return resolveAgainst(bases.kanbnUri, trimmed);
}

/** File extensions that are inserted as an image rather than a link when dropped onto an editor */
const IMAGE_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'svg',
];

/** Check whether a path or address points at something that can be shown inline as an image */
export function isImagePath(pathOrUri: string): boolean {
  const withoutQuery = pathOrUri.split(/[?#]/)[0];
  const extension = withoutQuery.slice(withoutQuery.lastIndexOf('.') + 1).toLowerCase();
  return withoutQuery.indexOf('.') !== -1 && IMAGE_EXTENSIONS.indexOf(extension) !== -1;
}

/**
 * Turn a URI from a drag-and-drop onto the editor into a path to write into markdown
 *
 * Anything inside the workspace becomes a `workspace:` path, which resolves the same way wherever
 * the task file that holds it ends up. Web addresses are kept as they are, and a file outside the
 * workspace stays an absolute `file:` URI - it can still be opened as a link, it just can't be
 * displayed as an image, because the webview isn't allowed to read it
 */
export function toMarkdownPath(uri: string): string {
  const trimmed = uri.trim();
  if (trimmed === '') {
    return trimmed;
  }

  const bases = getResourceBases();
  const filePath = fileUriToPath(trimmed);

  if (filePath === null) {
    // Not a file: URI, so it's either a web address or already a path
    return SCHEME_REGEX.test(trimmed) ? trimmed : trimmed.replace(/\\/g, '/');
  }

  if (bases === null || bases.workspacePath === '') {
    return trimmed;
  }

  const workspace = normalisePath(bases.workspacePath);
  const target = normalisePath(filePath);
  const isInsideWorkspace = target.toLowerCase().indexOf(`${workspace.toLowerCase()}/`) === 0;

  return isInsideWorkspace ? `workspace:${target.slice(workspace.length + 1)}` : trimmed;
}

/** The name to use as a link's label or an image's alt text, taken from the end of a path */
export function fileNameFromPath(pathOrUri: string): string {
  const withoutQuery = pathOrUri.split(/[?#]/)[0].replace(/[\\/]+$/, '').replace(/\\/g, '/');

  // A file at the top of the workspace has no separator to split on, so the prefix or scheme has to
  // come off first - otherwise the label reads `workspace:diagram.png`
  const withoutPrefix = withoutQuery
    .replace(WORKSPACE_PREFIX_REGEX, '')
    .replace(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//, '')
    .replace(/^[\\/]+/, '');
  const name = withoutPrefix.slice(withoutPrefix.lastIndexOf('/') + 1);

  try {
    return decodeURIComponent(name) || pathOrUri;
  } catch (error) {
    return name || pathOrUri;
  }
}
