import React from 'react';
import ReactMarkdown, { uriTransformer } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import VSCodeApi from './VSCodeApi';
import { resolveMarkdownResource } from './markdownResource';
import 'katex/dist/katex.min.css';

/**
 * Rendering markdown the same way everywhere it appears
 *
 * The board description and the task editor both show rendered markdown, and they used to carry
 * their own copy of this pipeline - which meant a fix to one of them silently didn't apply to the
 * other. There's one copy now.
 */

/**
 * Schemes react-markdown doesn't know about but this extension does
 *
 * Its default transform rewrites any unrecognised scheme to `javascript:void(0)` as an injection
 * guard, which quietly took `workspace:`, `project:` and `file:` links with it - clicking one posted
 * that placeholder to the extension host instead of the path the user wrote. Everything else still
 * goes through the default transform, so the guard is intact for schemes we don't handle
 */
const EXTENSION_SCHEME_REGEX = /^(?:workspace|project|file):/i;

function transformLinkUri(uri: string): string {
  return EXTENSION_SCHEME_REGEX.test(uri) ? uri : uriTransformer(uri);
}

export const createMarkdownComponents = (vscode: VSCodeApi) => ({
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    return !inline && match ? (
      <SyntaxHighlighter
        style=""
        useInlineStyles={false}
        language={match[1]}
        PreTag="div"
        children={String(children).replace(/\n$/, '')}
        {...props}
      />
    ) : (
      <code className={className} children={children} {...props} />
    );
  },

  // Images are resolved here rather than left to the browser, which would resolve them against the
  // extension's build folder because of the <base> tag the webview html sets
  img({ node, src, alt, ...props }: any) {
    return (
      <img
        {...props}
        className={['kanbn-markdown-image', props.className].filter(Boolean).join(' ')}
        src={resolveMarkdownResource(src || '')}
        alt={alt || ''}
      />
    );
  },

  // A webview can't navigate, so links are handed to the extension host to open - in the browser
  // for web addresses, in the editor for anything local
  a({ node, href, children, ...rest }: any) {
    return (
      <button
        type="button"
        className={['kanbn-markdown-link', rest.className].filter(Boolean).join(' ')}
        onClick={(event) => {
          // A link the sanitiser rejected arrives as `javascript:void(0)`, and passing that on
          // would have the extension host try to open a file by that name
          if (!href || href.charAt(0) === '#' || /^javascript:/i.test(href)) {
            return;
          }

          event.preventDefault();
          vscode.postMessage({
            command: 'kanbn.openLink',
            href,
          });
        }}
        {...rest}
      >
        {children}
      </button>
    );
  }
});

const Markdown = ({ vscode, children, ...props }: {
  vscode: VSCodeApi,
  children: string,
  [key: string]: any,
}) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[rehypeKatex]}
    transformLinkUri={transformLinkUri}
    components={createMarkdownComponents(vscode)}
    {...props}
  >
    {children}
  </ReactMarkdown>
);

export default Markdown;
