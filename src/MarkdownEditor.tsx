import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Field } from 'formik';
import TextareaAutosize from 'react-textarea-autosize';
import VSCodeApi from './VSCodeApi';
import {
  EditorState,
  insertBlock,
  insertCodeBlock,
  insertLink,
  insertMath,
  insertTable,
  LinePrefixKind,
  setHeadingLevel,
  TextEdit,
  toggleInlineMarker,
  toggleLinePrefix,
} from './markdownCommands';
import { fileNameFromPath, isImagePath, toMarkdownPath } from './markdownResource';

/**
 * A markdown textarea with a formatting toolbar
 *
 * Every toolbar action is applied to the textarea as an ordinary edit rather than by rewriting the
 * form value, which keeps the textarea's own undo history working: ctrl+z steps back through
 * toolbar edits the same way it steps back through typing.
 */

/** The heading levels the heading menu offers, plus the entry that removes one */
const HEADING_LEVELS = [1, 2, 3, 4, 5, 6];

type MarkdownEditorProps = {
  name: string,
  vscode: VSCodeApi,
  id?: string,
  className?: string,
  placeholder?: string,
};

/** Read the current contents and selection straight out of the textarea */
function readState(textarea: HTMLTextAreaElement): EditorState {
  return {
    text: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  };
}

/**
 * Apply an edit to the textarea
 *
 * execCommand is deprecated but it's the only way to change a textarea's contents while keeping the
 * browser's undo stack, and it's what makes toolbar edits undoable. The fallback below covers the
 * case where it's unavailable, at the cost of that undo entry
 */
function applyEdit(textarea: HTMLTextAreaElement, edit: TextEdit): void {
  textarea.focus();
  textarea.setSelectionRange(edit.rangeStart, edit.rangeEnd);

  let applied = false;
  try {
    applied = edit.replacement === ''
      ? document.execCommand('delete')
      : document.execCommand('insertText', false, edit.replacement);
  } catch (error) {
    applied = false;
  }

  if (!applied) {
    const { value } = textarea;
    const next = value.slice(0, edit.rangeStart) + edit.replacement + value.slice(edit.rangeEnd);

    // Assigning through the prototype's setter is what makes React notice a value it didn't set
    // itself - a plain assignment is swallowed by its own change detection
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(textarea, next);
    } else {
      textarea.value = next;
    }

    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
}

/**
 * Pull the dropped files out of a drag
 *
 * Dragging from the editor's explorer and dragging from a file manager put the paths in different
 * places, and a drag from a browser puts a web address there instead, so every source worth
 * supporting is checked in turn
 */
function carriesFiles(dataTransfer: DataTransfer): boolean {
  const types = dataTransfer.types;
  for (let index = 0; index < types.length; index++) {
    const type = types[index];
    if (type === 'Files' || type === 'text/uri-list' || type === 'application/vnd.code.uri-list') {
      return true;
    }
  }

  return false;
}

function readDroppedUris(dataTransfer: DataTransfer): string[] {
  const lists = [
    dataTransfer.getData('application/vnd.code.uri-list'),
    dataTransfer.getData('text/uri-list'),
  ];

  for (const list of lists) {
    if (!list) {
      continue;
    }

    // A uri-list is newline separated, and lines starting with # are comments
    const uris = list.split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line !== '' && line.charAt(0) !== '#');
    if (uris.length > 0) {
      return uris;
    }
  }

  // A plain text drag of something that looks like an address or a path is worth accepting too
  const text = dataTransfer.getData('text/plain').trim();
  if (text !== '' && !/\s/.test(text) && /^(?:[a-zA-Z][a-zA-Z\d+\-.]*:|[./~\\]|[a-zA-Z]:[\\/])/.test(text)) {
    return [text];
  }

  return [];
}

const MarkdownEditorInner = ({
  field,
  id,
  className,
  placeholder,
  vscode,
}: any) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const headingMenuRef = useRef<HTMLDivElement | null>(null);
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false);
  const [draggingOver, setDraggingOver] = useState(false);

  // dragenter and dragleave both fire when the pointer crosses a child of the drop target, so the
  // highlight is driven by a depth count rather than by the last event seen
  const dragDepth = useRef(0);

  const runCommand = useCallback((command: (state: EditorState) => TextEdit) => {
    const textarea = textareaRef.current;
    if (textarea) {
      applyEdit(textarea, command(readState(textarea)));
    }
  }, []);

  // A click anywhere else, or escape, should put the heading menu away. Clicks inside it have to be
  // left alone: closing the menu on mousedown would unmount the item before its click arrived, and
  // pressing a heading would do nothing at all
  useEffect(() => {
    if (!headingMenuOpen) {
      return;
    }

    const onMouseDown = (event: MouseEvent) => {
      const menu = headingMenuRef.current;
      if (!menu || !menu.contains(event.target as Node)) {
        setHeadingMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHeadingMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [headingMenuOpen]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case 'b':
        event.preventDefault();
        runCommand(state => toggleInlineMarker(state, '**'));
        return;
      case 'i':
        event.preventDefault();
        runCommand(state => toggleInlineMarker(state, '_', ['*']));
        return;
      case 'k':
        event.preventDefault();
        runCommand(state => insertLink(state));
        return;
      default:
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLTextAreaElement>) => {
    dragDepth.current = 0;
    setDraggingOver(false);

    const uris = readDroppedUris(event.dataTransfer);
    if (uris.length === 0) {
      // A file dragged from outside the editor arrives without a path - the browser only hands over
      // its contents - so there's nothing to link to. Say so rather than inserting something broken
      if (event.dataTransfer.files.length > 0) {
        vscode.postMessage({
          command: 'error',
          text: 'Kanbn: that file was dropped without a path. Drag it from the Explorer panel instead.',
        });
      }
      return;
    }

    event.preventDefault();

    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    // Each dropped file becomes a link, or an image if it is one, on a line of its own
    const snippets = uris.map(uri => {
      const href = toMarkdownPath(uri);
      return { href, label: fileNameFromPath(href), image: isImagePath(href) };
    });

    let state = readState(textarea);
    const edit = snippets.reduce<TextEdit | null>((previous, snippet, index) => {
      const separator = index === 0 ? '' : '\n';
      const next = insertLink(state, snippet);
      const replacement = separator + next.replacement;

      state = {
        text: state.text.slice(0, next.rangeStart) + replacement + state.text.slice(next.rangeEnd),
        selectionStart: next.rangeStart + replacement.length,
        selectionEnd: next.rangeStart + replacement.length,
      };

      return previous === null
        ? { ...next, replacement, selectionStart: state.selectionStart, selectionEnd: state.selectionEnd }
        : {
          ...previous,
          replacement: previous.replacement + replacement,
          selectionStart: state.selectionStart,
          selectionEnd: state.selectionEnd,
        };
    }, null);

    if (edit) {
      applyEdit(textarea, edit);
    }
  };

  // Toolbar buttons must not take focus, or the textarea loses its selection the moment one is
  // pressed and every command would apply to the wrong place
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();

  const button = (icon: string, title: string, onClick: () => void, label?: string) => (
    <button
      type="button"
      className="kanbn-markdown-toolbar-button"
      title={title}
      aria-label={title}
      onMouseDown={keepFocus}
      onClick={onClick}
    >
      {label ? <span className="kanbn-markdown-toolbar-label">{label}</span> : <i className={`codicon codicon-${icon}`}></i>}
    </button>
  );

  return (
    <div className={`kanbn-markdown-editor${draggingOver ? ' kanbn-markdown-editor-dragging' : ''}`}>
      <div className="kanbn-markdown-toolbar" role="toolbar" aria-label="Markdown formatting">
        {button('bold', 'Bold (Ctrl+B)', () => runCommand(state => toggleInlineMarker(state, '**')))}
        {button('italic', 'Italic (Ctrl+I)', () => runCommand(state => toggleInlineMarker(state, '_', ['*'])))}
        {button('', 'Strikethrough', () => runCommand(state => toggleInlineMarker(state, '~~')), 'S')}

        <div className="kanbn-markdown-toolbar-menu" ref={headingMenuRef}>
          <button
            type="button"
            className="kanbn-markdown-toolbar-button"
            title="Heading"
            aria-label="Heading"
            aria-expanded={headingMenuOpen}
            onMouseDown={keepFocus}
            onClick={() => setHeadingMenuOpen(!headingMenuOpen)}
          >
            <i className="codicon codicon-text-size"></i>
            <i className="codicon codicon-chevron-down kanbn-markdown-toolbar-chevron"></i>
          </button>
          {headingMenuOpen && (
            <div className="kanbn-markdown-toolbar-dropdown">
              {HEADING_LEVELS.map(level => (
                <button
                  key={level}
                  type="button"
                  className="kanbn-markdown-toolbar-dropdown-item"
                  onMouseDown={keepFocus}
                  onClick={() => {
                    setHeadingMenuOpen(false);
                    runCommand(state => setHeadingLevel(state, level));
                  }}
                >
                  <span style={{ fontSize: `${1.35 - (level - 1) * 0.08}em`, fontWeight: 'bold' }}>
                    Heading {level}
                  </span>
                </button>
              ))}
              <button
                type="button"
                className="kanbn-markdown-toolbar-dropdown-item"
                onMouseDown={keepFocus}
                onClick={() => {
                  setHeadingMenuOpen(false);
                  runCommand(state => setHeadingLevel(state, 0));
                }}
              >
                Normal text
              </button>
            </div>
          )}
        </div>

        <span className="kanbn-markdown-toolbar-separator" />

        {button('link', 'Link (Ctrl+K)', () => runCommand(state => insertLink(state)))}
        {button('file-media', 'Image', () => runCommand(state => insertLink(state, { image: true })))}
        {button('quote', 'Quote', () => runCommand(state => toggleLinePrefix(state, 'quote')))}
        {button('code', 'Inline code', () => runCommand(state => toggleInlineMarker(state, '`')))}

        <span className="kanbn-markdown-toolbar-separator" />

        {(['bullet', 'ordered', 'task'] as LinePrefixKind[]).map(kind => button(
          kind === 'bullet' ? 'list-unordered' : (kind === 'ordered' ? 'list-ordered' : 'tasklist'),
          kind === 'bullet' ? 'Bulleted list' : (kind === 'ordered' ? 'Numbered list' : 'Task list'),
          () => runCommand(state => toggleLinePrefix(state, kind))
        ))}

        <span className="kanbn-markdown-toolbar-separator" />

        {button('file-code', 'Code block', () => runCommand(state => insertCodeBlock(state)))}
        {button('table', 'Table', () => runCommand(state => insertTable(state)))}
        {button('horizontal-rule', 'Horizontal rule', () => runCommand(state => insertBlock(state, '---')))}
        {button('symbol-operator', 'Math', () => runCommand(state => insertMath(state)))}
      </div>

      <TextareaAutosize
        {...field}
        id={id}
        className={className}
        placeholder={placeholder}
        ref={textareaRef}
        onKeyDown={handleKeyDown}
        onDragEnter={(event: React.DragEvent<HTMLTextAreaElement>) => {
          // Dragging selected text around inside the textarea is not a file drop, and shouldn't
          // light the box up or turn the cursor into a copy cursor
          if (carriesFiles(event.dataTransfer)) {
            dragDepth.current++;
            setDraggingOver(true);
          }
        }}
        onDragOver={(event: React.DragEvent<HTMLTextAreaElement>) => {
          // Without this the editor takes the drop itself and opens the file in a new tab
          event.preventDefault();
          if (carriesFiles(event.dataTransfer)) {
            event.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) {
            setDraggingOver(false);
          }
        }}
        onDrop={handleDrop}
      />
    </div>
  );
};

const MarkdownEditor = ({ name, ...props }: MarkdownEditorProps) => (
  <Field name={name}>
    {({ field }: any) => <MarkdownEditorInner field={field} {...props} />}
  </Field>
);

export default MarkdownEditor;
