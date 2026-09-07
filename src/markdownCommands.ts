/**
 * The text transformations behind the markdown toolbar
 *
 * These are pure functions over a snapshot of the textarea - text plus selection - so they can be
 * reasoned about and tested without a DOM. Each one returns the smallest range it wants replaced
 * rather than a whole new document, which lets the caller apply it as an ordinary edit and keep the
 * textarea's native undo history intact.
 */

/** A snapshot of a textarea: its contents and where the selection sits */
export type EditorState = {
  text: string,
  selectionStart: number,
  selectionEnd: number,
};

/** A replacement to apply to the text, and where to leave the selection afterwards */
export type TextEdit = {
  rangeStart: number,
  rangeEnd: number,
  replacement: string,

  /** Offsets into the text as it will be *after* the replacement */
  selectionStart: number,
  selectionEnd: number,
};

/** Match the leading whitespace of a line, which every prefix is inserted after */
const INDENT_REGEX = /^[ \t]*/;

/** Match a heading prefix, e.g. the `### ` in `### Notes` */
const HEADING_PREFIX_REGEX = /^(#{1,6}) /;

/** Match any list marker, so that applying one kind of list replaces another */
const LIST_PREFIX_REGEX = /^(?:[-*+] \[[ xX]\] |[-*+] |\d+[.)] )/;

/** Match a block quote marker */
const QUOTE_PREFIX_REGEX = /^> ?/;

/** Characters that can be part of a word, used to grow an empty selection to the word under it */
const WORD_CHARACTER_REGEX = /[\w'-]/;

/** The line prefixes the toolbar can toggle */
export type LinePrefixKind = 'quote' | 'bullet' | 'ordered' | 'task';

/**
 * Find the start and end of the lines a selection touches
 *
 * A selection that ends exactly at the start of a line doesn't include that line: dragging down to
 * the beginning of the next line is how people select whole lines, and prefixing the line they
 * stopped before would be surprising
 */
function lineBounds(text: string, selectionStart: number, selectionEnd: number) {
  const from = text.lastIndexOf('\n', selectionStart - 1) + 1;
  const end = selectionEnd > selectionStart && text.charAt(selectionEnd - 1) === '\n'
    ? selectionEnd - 1
    : selectionEnd;
  const newline = text.indexOf('\n', end);

  return { from, to: newline === -1 ? text.length : newline };
}

/**
 * Grow an empty selection to cover the word the cursor sits in
 *
 * Pressing bold with the cursor in the middle of a word should embolden that word, which is what
 * the same shortcut does in a markdown file in the editor
 */
function expandToWord(state: EditorState): { start: number, end: number } {
  const { text, selectionStart, selectionEnd } = state;
  if (selectionStart !== selectionEnd) {
    return { start: selectionStart, end: selectionEnd };
  }

  let start = selectionStart;
  let end = selectionEnd;
  while (start > 0 && WORD_CHARACTER_REGEX.test(text.charAt(start - 1))) {
    start--;
  }
  while (end < text.length && WORD_CHARACTER_REGEX.test(text.charAt(end))) {
    end++;
  }

  return { start, end };
}

/**
 * Wrap or unwrap the selection in an inline marker, e.g. `**` for bold
 *
 * @param alternateMarkers Other spellings of the same emphasis to recognise when unwrapping, so
 * that italics written as `*this*` still toggle off even though the button writes `_this_`
 */
export function toggleInlineMarker(
  state: EditorState,
  marker: string,
  alternateMarkers: string[] = []
): TextEdit {
  const { text } = state;
  const expanded = expandToWord(state);
  let start = expanded.start;
  let end = expanded.end;

  // Whitespace dragged in by a double-click belongs outside the markers, otherwise `**word **`
  // renders as literal asterisks
  while (end > start && /\s/.test(text.charAt(end - 1))) {
    end--;
  }
  while (start < end && /\s/.test(text.charAt(start))) {
    start++;
  }

  const selected = text.slice(start, end);

  for (const candidate of [marker].concat(alternateMarkers)) {
    // The markers can be inside the selection (`**word**` selected) or just outside it (`word`
    // selected within `**word**`), and both should toggle off
    if (
      selected.length >= candidate.length * 2 &&
      selected.slice(0, candidate.length) === candidate &&
      selected.slice(-candidate.length) === candidate &&
      !isRunOfSameCharacter(selected.charAt(candidate.length), candidate) &&
      !isRunOfSameCharacter(selected.charAt(selected.length - candidate.length - 1), candidate)
    ) {
      const inner = selected.slice(candidate.length, selected.length - candidate.length);
      return {
        rangeStart: start,
        rangeEnd: end,
        replacement: inner,
        selectionStart: start,
        selectionEnd: start + inner.length,
      };
    }

    if (
      text.slice(start - candidate.length, start) === candidate &&
      text.slice(end, end + candidate.length) === candidate &&
      !isRunOfSameCharacter(text.charAt(start - candidate.length - 1), candidate) &&
      !isRunOfSameCharacter(text.charAt(end + candidate.length), candidate)
    ) {
      return {
        rangeStart: start - candidate.length,
        rangeEnd: end + candidate.length,
        replacement: selected,
        selectionStart: start - candidate.length,
        selectionEnd: start - candidate.length + selected.length,
      };
    }
  }

  const replacement = `${marker}${selected}${marker}`;
  return {
    rangeStart: start,
    rangeEnd: end,
    replacement,
    selectionStart: start + marker.length,
    selectionEnd: start + marker.length + selected.length,
  };
}

/**
 * Check whether a marker is really part of a longer run of the same character
 *
 * Without this, pressing italic on `**bold**` would peel one asterisk off each side and quietly
 * turn it into `*bold*`
 */
function isRunOfSameCharacter(neighbour: string, marker: string): boolean {
  return /[*_~`$]/.test(marker.charAt(0)) && neighbour === marker.charAt(0);
}

/**
 * Set the heading level of every line the selection touches, where level 0 means normal text
 */
export function setHeadingLevel(state: EditorState, level: number): TextEdit {
  const { text } = state;
  const { from, to } = lineBounds(text, state.selectionStart, state.selectionEnd);
  const prefix = level > 0 ? `${'#'.repeat(level)} ` : '';

  const replacement = text.slice(from, to).split('\n').map(line => {
    const indent = (line.match(INDENT_REGEX) || [''])[0];
    const body = line.slice(indent.length).replace(HEADING_PREFIX_REGEX, '');
    return body === '' && prefix === '' ? indent : `${indent}${prefix}${body}`;
  }).join('\n');

  return {
    rangeStart: from,
    rangeEnd: to,
    replacement,
    selectionStart: from,
    selectionEnd: from + replacement.length,
  };
}

/**
 * Add a line prefix to every line the selection touches, or take it off if every line already has it
 */
export function toggleLinePrefix(state: EditorState, kind: LinePrefixKind): TextEdit {
  const { text } = state;
  const { from, to } = lineBounds(text, state.selectionStart, state.selectionEnd);
  const lines = text.slice(from, to).split('\n');
  const matcher = kind === 'quote' ? QUOTE_PREFIX_REGEX : listMatcher(kind);

  // Only remove the prefix when every non-empty line has it - a partially prefixed selection is
  // more likely to be someone extending the list than undoing it
  const meaningful = lines.filter(line => line.trim() !== '');
  const removing = meaningful.length > 0 && meaningful.every(
    line => matcher.test(line.slice((line.match(INDENT_REGEX) || [''])[0].length))
  );

  let ordinal = 0;
  const replacement = lines.map(line => {
    const indent = (line.match(INDENT_REGEX) || [''])[0];
    let body = line.slice(indent.length);

    if (removing) {
      return `${indent}${body.replace(matcher, '')}`;
    }

    if (line.trim() === '') {
      return line;
    }

    // A line can only carry one list marker, so applying one replaces whatever was there
    if (kind !== 'quote') {
      body = body.replace(LIST_PREFIX_REGEX, '');
    }

    ordinal++;
    return `${indent}${linePrefix(kind, ordinal)}${body}`;
  }).join('\n');

  return {
    rangeStart: from,
    rangeEnd: to,
    replacement,
    selectionStart: from,
    selectionEnd: from + replacement.length,
  };
}

function listMatcher(kind: LinePrefixKind): RegExp {
  switch (kind) {
    case 'task':
      return /^[-*+] \[[ xX]\] /;
    case 'ordered':
      return /^\d+[.)] /;
    default:
      return /^[-*+] (?!\[[ xX]\] )/;
  }
}

function linePrefix(kind: LinePrefixKind, ordinal: number): string {
  switch (kind) {
    case 'quote':
      return '> ';
    case 'task':
      return '- [ ] ';
    case 'ordered':
      return `${ordinal}. `;
    default:
      return '- ';
  }
}

/**
 * Insert a block on its own lines, padding with blank lines so it isn't swallowed by the paragraph
 * it was inserted into
 */
export function insertBlock(state: EditorState, block: string, selectionOffset?: [number, number]): TextEdit {
  const { text, selectionStart, selectionEnd } = state;
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  const leading = before === '' || /\n\n$/.test(before) ? '' : (/\n$/.test(before) ? '\n' : '\n\n');
  const trailing = after === '' || /^\n\n/.test(after) ? '' : (/^\n/.test(after) ? '\n' : '\n\n');
  const replacement = `${leading}${block}${trailing}`;
  const blockStart = selectionStart + leading.length;

  return {
    rangeStart: selectionStart,
    rangeEnd: selectionEnd,
    replacement,
    selectionStart: blockStart + (selectionOffset ? selectionOffset[0] : block.length),
    selectionEnd: blockStart + (selectionOffset ? selectionOffset[1] : block.length),
  };
}

/** Wrap the selection in a fenced code block */
export function insertCodeBlock(state: EditorState, language: string = ''): TextEdit {
  const { text, selectionStart, selectionEnd } = state;
  const selected = text.slice(selectionStart, selectionEnd);
  const body = selected === '' ? '' : selected;
  const block = `\`\`\`${language}\n${body}\n\`\`\``;
  const bodyStart = `\`\`\`${language}\n`.length;

  return insertBlock(
    { ...state, selectionStart, selectionEnd },
    block,
    [bodyStart, bodyStart + body.length]
  );
}

/** Insert a table skeleton, with the first header cell selected so it can be typed over */
export function insertTable(state: EditorState, columns: number = 3, rows: number = 2): TextEdit {
  const headerCells: string[] = [];
  for (let column = 0; column < columns; column++) {
    headerCells.push(`Column ${column + 1}`);
  }

  const divider = headerCells.map(() => '---');
  const bodyRow = headerCells.map(() => '   ');
  const lines = [
    `| ${headerCells.join(' | ')} |`,
    `| ${divider.join(' | ')} |`,
  ];
  for (let row = 0; row < rows; row++) {
    lines.push(`| ${bodyRow.join(' | ')} |`);
  }

  return insertBlock(state, lines.join('\n'), [2, 2 + headerCells[0].length]);
}

/**
 * Insert a link or an image
 *
 * Whatever is selected becomes the label, unless it looks like a path or address, in which case it
 * becomes the target and the cursor lands on the label instead
 */
export function insertLink(
  state: EditorState,
  options: { image?: boolean, href?: string, label?: string } = {}
): TextEdit {
  const { text, selectionStart, selectionEnd } = state;
  const selected = text.slice(selectionStart, selectionEnd);
  const bang = options.image ? '!' : '';
  const selectionIsTarget = options.href === undefined
    && selected !== ''
    && /^(?:[a-zA-Z][a-zA-Z\d+\-.]*:|[.\\/]|[^\s]+\.[a-zA-Z\d]{1,8}$)/.test(selected)
    && !/\s/.test(selected);

  // With nothing selected there's nothing to fill either half in from, so both get a placeholder
  const labelIsPlaceholder = options.label === undefined && (selectionIsTarget || selected === '');
  const hrefIsPlaceholder = options.href === undefined && !selectionIsTarget;
  const label = labelIsPlaceholder
    ? (options.image ? 'alt text' : 'text')
    : (options.label !== undefined ? options.label : selected);
  const href = hrefIsPlaceholder ? 'url' : (options.href !== undefined ? options.href : selected);

  // A destination containing spaces or brackets has to be wrapped in angle brackets, or markdown
  // stops reading it at the first space and the link silently isn't one
  const target = /[\s()<>]/.test(href) ? `<${href}>` : href;
  const replacement = `${bang}[${label}](${target})`;

  // Select the part the user still has to fill in - the label first, since it's what anyone types
  // next. When both halves are known, as they are for a dropped file, there's nothing to fill in
  const labelStart = selectionStart + bang.length + 1;
  const hrefStart = labelStart + label.length + 2;
  const end = selectionStart + replacement.length;
  let from: number;
  let to: number;
  if (labelIsPlaceholder || label === '') {
    from = labelStart;
    to = labelStart + label.length;
  } else if (hrefIsPlaceholder) {
    // The target as written, so a selection still lines up if it had to be bracketed
    from = hrefStart;
    to = hrefStart + target.length;
  } else {
    from = end;
    to = end;
  }

  return {
    rangeStart: selectionStart,
    rangeEnd: selectionEnd,
    replacement,
    selectionStart: from,
    selectionEnd: to,
  };
}

/** Wrap the selection in inline math delimiters, or insert a display math block when it's empty */
export function insertMath(state: EditorState): TextEdit {
  const { text, selectionStart, selectionEnd } = state;
  return selectionStart === selectionEnd
    ? insertBlock(state, '$$\n\n$$', [3, 3])
    : toggleInlineMarker({ ...state, text }, '$');
}

/** Apply an edit to a state snapshot - the same result the textarea will end up with */
export function applyEditToState(state: EditorState, edit: TextEdit): EditorState {
  return {
    text: state.text.slice(0, edit.rangeStart) + edit.replacement + state.text.slice(edit.rangeEnd),
    selectionStart: edit.selectionStart,
    selectionEnd: edit.selectionEnd,
  };
}
