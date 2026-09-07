import {
  fileNameFromPath,
  isImagePath,
  resolveMarkdownResource,
  toMarkdownPath,
} from './markdownResource';

/**
 * The base URIs are read from the root element once, so they have to be in place before the module
 * under test is first called
 */
const WORKSPACE_URI = 'https://file+.vscode-resource.vscode-cdn.net/home/user/project';
const KANBN_URI = `${WORKSPACE_URI}/.kanbn`;

beforeAll(() => {
  const root = document.createElement('div');
  root.id = 'root';
  root.setAttribute('data-workspace-uri', WORKSPACE_URI);
  root.setAttribute('data-kanbn-uri', KANBN_URI);
  root.setAttribute('data-workspace-path', '/home/user/project');
  document.body.appendChild(root);
});

describe('resolveMarkdownResource', () => {
  it('anchors a prefixed path to the workspace folder', () => {
    expect(resolveMarkdownResource('workspace:docs/a.png')).toBe(`${WORKSPACE_URI}/docs/a.png`);
    expect(resolveMarkdownResource('project:docs/a.png')).toBe(`${WORKSPACE_URI}/docs/a.png`);
    expect(resolveMarkdownResource('workspace:/docs/a.png')).toBe(`${WORKSPACE_URI}/docs/a.png`);
    expect(resolveMarkdownResource('WORKSPACE:docs/a.png')).toBe(`${WORKSPACE_URI}/docs/a.png`);
  });

  it('resolves anything else relative to the kanbn folder', () => {
    expect(resolveMarkdownResource('a.png')).toBe(`${KANBN_URI}/a.png`);
    expect(resolveMarkdownResource('./a.png')).toBe(`${KANBN_URI}/a.png`);
    expect(resolveMarkdownResource('tasks/../a.png')).toBe(`${KANBN_URI}/a.png`);
    expect(resolveMarkdownResource('../docs/a.png')).toBe(`${WORKSPACE_URI}/docs/a.png`);
  });

  it('encodes characters that would otherwise break the address', () => {
    expect(resolveMarkdownResource('my file.png')).toBe(`${KANBN_URI}/my%20file.png`);
  });

  it('leaves web addresses and data uris alone', () => {
    expect(resolveMarkdownResource('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(resolveMarkdownResource('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
    expect(resolveMarkdownResource('#section')).toBe('#section');
  });

  it('maps an absolute path or file uri inside the workspace', () => {
    expect(resolveMarkdownResource('/home/user/project/docs/a.png'))
      .toBe(`${WORKSPACE_URI}/docs/a.png`);
    expect(resolveMarkdownResource('file:///home/user/project/docs/a.png'))
      .toBe(`${WORKSPACE_URI}/docs/a.png`);
  });

  it('leaves a path outside the workspace alone, because the webview cannot load it', () => {
    expect(resolveMarkdownResource('/elsewhere/a.png')).toBe('/elsewhere/a.png');
    expect(resolveMarkdownResource('file:///elsewhere/a.png')).toBe('/elsewhere/a.png');
  });
});

describe('toMarkdownPath', () => {
  it('turns a dropped file inside the workspace into a prefixed path', () => {
    expect(toMarkdownPath('file:///home/user/project/docs/a.png')).toBe('workspace:docs/a.png');
    expect(toMarkdownPath('file:///home/user/project/a.png')).toBe('workspace:a.png');
  });

  it('keeps a file outside the workspace as a uri, since no relative path would reach it', () => {
    expect(toMarkdownPath('file:///elsewhere/a.png')).toBe('file:///elsewhere/a.png');
  });

  it('keeps web addresses as they are', () => {
    expect(toMarkdownPath('https://example.com/a.png')).toBe('https://example.com/a.png');
  });
});

describe('fileNameFromPath', () => {
  it('takes the last segment', () => {
    expect(fileNameFromPath('workspace:docs/a.png')).toBe('a.png');
    expect(fileNameFromPath('https://example.com/img/pic.png')).toBe('pic.png');
  });

  it('strips the prefix from a file at the top of the workspace', () => {
    expect(fileNameFromPath('workspace:a.png')).toBe('a.png');
    expect(fileNameFromPath('project:a.png')).toBe('a.png');
  });

  it('decodes an escaped name', () => {
    expect(fileNameFromPath('workspace:docs/my%20file.png')).toBe('my file.png');
  });
});

describe('isImagePath', () => {
  it('recognises image extensions and nothing else', () => {
    expect(isImagePath('workspace:a.png')).toBe(true);
    expect(isImagePath('a.JPEG')).toBe(true);
    expect(isImagePath('https://example.com/a.svg?v=2')).toBe(true);
    expect(isImagePath('workspace:notes.md')).toBe(false);
    expect(isImagePath('workspace:archive')).toBe(false);
  });
});
