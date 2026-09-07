import {
  applyEditToState,
  EditorState,
  insertBlock,
  insertCodeBlock,
  insertLink,
  insertMath,
  insertTable,
  setHeadingLevel,
  TextEdit,
  toggleInlineMarker,
  toggleLinePrefix,
} from './markdownCommands';

/**
 * Cases are written as the text the user would see, with `«...»` around a selection and `‸` for a
 * bare caret. Markdown is full of square brackets and pipes, so the usual notations for this would
 * be ambiguous against the test data itself
 */
const CARET = '‸';
const OPEN = '«';
const CLOSE = '»';

function parse(annotated: string): EditorState {
  const open = annotated.indexOf(OPEN);
  if (open !== -1) {
    const close = annotated.indexOf(CLOSE);
    return {
      text: annotated.slice(0, open) + annotated.slice(open + 1, close) + annotated.slice(close + 1),
      selectionStart: open,
      selectionEnd: close - 1,
    };
  }

  const caret = annotated.indexOf(CARET);
  return {
    text: annotated.slice(0, caret) + annotated.slice(caret + 1),
    selectionStart: caret,
    selectionEnd: caret,
  };
}

function annotate(state: EditorState): string {
  const { text, selectionStart, selectionEnd } = state;
  return selectionStart === selectionEnd
    ? text.slice(0, selectionStart) + CARET + text.slice(selectionStart)
    : text.slice(0, selectionStart) + OPEN + text.slice(selectionStart, selectionEnd) + CLOSE
      + text.slice(selectionEnd);
}

function run(annotated: string, command: (state: EditorState) => TextEdit): string {
  const state = parse(annotated);
  return annotate(applyEditToState(state, command(state)));
}

const bold = (state: EditorState) => toggleInlineMarker(state, '**');
const italic = (state: EditorState) => toggleInlineMarker(state, '_', ['*']);

describe('inline markers', () => {
  it('wraps the selection', () => {
    expect(run('make «this» bold', bold)).toBe('make **«this»** bold');
  });

  it('grows an empty selection to the word under the caret', () => {
    expect(run('make th‸is bold', bold)).toBe('make **«this»** bold');
  });

  it('unwraps markers inside the selection', () => {
    expect(run('make «**this**» bold', bold)).toBe('make «this» bold');
  });

  it('unwraps markers outside the selection', () => {
    expect(run('make **«this»** bold', bold)).toBe('make «this» bold');
  });

  it('leaves whitespace outside the markers', () => {
    expect(run('make «this »bold', bold)).toBe('make **«this»** bold');
  });

  it('writes italics as underscores', () => {
    expect(run('make «this» italic', italic)).toBe('make _«this»_ italic');
  });

  it('does not turn bold into italic', () => {
    expect(run('make «**this**» italic', italic)).toBe('make _«**this**»_ italic');
  });

  it('still recognises italics written with asterisks', () => {
    expect(run('make «*this*» italic', italic)).toBe('make «this» italic');
  });

  it('inserts empty markers when there is no word', () => {
    expect(run('x ‸', bold)).toBe('x **‸**');
  });
});

describe('headings', () => {
  it('adds a heading prefix', () => {
    expect(run('Notes‸', state => setHeadingLevel(state, 2))).toBe('«## Notes»');
  });

  it('replaces an existing level', () => {
    expect(run('### No‸tes', state => setHeadingLevel(state, 1))).toBe('«# Notes»');
  });

  it('clears the heading at level 0', () => {
    expect(run('## No‸tes', state => setHeadingLevel(state, 0))).toBe('«Notes»');
  });

  it('applies to every selected line', () => {
    expect(run('«a\nb»', state => setHeadingLevel(state, 3))).toBe('«### a\n### b»');
  });
});

describe('line prefixes', () => {
  it('adds and removes a bullet', () => {
    expect(run('a‸', state => toggleLinePrefix(state, 'bullet'))).toBe('«- a»');
    expect(run('- a‸', state => toggleLinePrefix(state, 'bullet'))).toBe('«a»');
  });

  it('numbers an ordered list', () => {
    expect(run('«a\nb\nc»', state => toggleLinePrefix(state, 'ordered')))
      .toBe('«1. a\n2. b\n3. c»');
  });

  it('swaps one list marker for another', () => {
    expect(run('- a‸', state => toggleLinePrefix(state, 'task'))).toBe('«- [ ] a»');
    expect(run('- [ ] a‸', state => toggleLinePrefix(state, 'bullet'))).toBe('«- a»');
  });

  it('removes a completed task marker', () => {
    expect(run('- [x] a‸', state => toggleLinePrefix(state, 'task'))).toBe('«a»');
  });

  it('extends a partially prefixed selection rather than clearing it', () => {
    expect(run('«- a\nb»', state => toggleLinePrefix(state, 'bullet'))).toBe('«- a\n- b»');
  });

  it('keeps indentation and skips blank lines', () => {
    expect(run('  a‸', state => toggleLinePrefix(state, 'bullet'))).toBe('«  - a»');
    expect(run('«a\n\nb»', state => toggleLinePrefix(state, 'bullet'))).toBe('«- a\n\n- b»');
  });

  it('quotes lines', () => {
    expect(run('a‸', state => toggleLinePrefix(state, 'quote'))).toBe('«> a»');
  });
});

describe('links and images', () => {
  it('offers both placeholders when nothing is selected', () => {
    expect(run('see ‸', state => insertLink(state))).toBe('see [«text»](url)');
  });

  it('uses the selection as the label', () => {
    expect(run('see «docs» here', state => insertLink(state))).toBe('see [docs](«url») here');
  });

  it('uses a selected address or path as the target', () => {
    expect(run('see «https://a.com».', state => insertLink(state)))
      .toBe('see [«text»](https://a.com).');
    expect(run('«docs/a.md»', state => insertLink(state))).toBe('[«text»](docs/a.md)');
  });

  it('writes an image', () => {
    expect(run('‸', state => insertLink(state, { image: true }))).toBe('![«alt text»](url)');
  });

  it('leaves the caret after the link when nothing needs filling in', () => {
    expect(run('‸', state => insertLink(state, { label: 'A', href: 'b.md' }))).toBe('[A](b.md)‸');
  });

  it('wraps a target containing spaces so it still parses as a link', () => {
    expect(run('‸', state => insertLink(state, { label: 'b.pdf', href: 'workspace:sub dir/b.pdf' })))
      .toBe('[b.pdf](<workspace:sub dir/b.pdf>)‸');
  });

  it('bracketed targets still leave the caret after a dropped link', () => {
    expect(run('«a file»', state => insertLink(state, { href: 'x y.md' })))
      .toBe('[a file](<x y.md>)‸');
  });
});

describe('blocks', () => {
  it('inserts an empty code block', () => {
    expect(run('x‸', state => insertCodeBlock(state))).toBe('x\n\n```\n‸\n```');
  });

  it('wraps the selection in a code block without doubling blank lines', () => {
    expect(run('a\n\n«b»\n\nc', state => insertCodeBlock(state))).toBe('a\n\n```\n«b»\n```\n\nc');
  });

  it('inserts a rule', () => {
    expect(run('a‸', state => insertBlock(state, '---'))).toBe('a\n\n---‸');
  });

  it('inserts a table with the first heading selected', () => {
    expect(run('‸', state => insertTable(state, 2, 1)))
      .toBe('| «Column 1» | Column 2 |\n| --- | --- |\n|     |     |');
  });

  it('inserts display math when nothing is selected and inline math otherwise', () => {
    expect(run('x ‸', state => insertMath(state))).toBe('x \n\n$$\n‸\n$$');
    expect(run('x «E=m»', state => insertMath(state))).toBe('x $«E=m»$');
  });
});
