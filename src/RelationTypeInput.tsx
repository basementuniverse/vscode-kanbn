import React, { useEffect, useRef, useState } from 'react';
import { useField } from 'formik';

// Relations are free text, so the suggestions only ever narrow what the user sees - they never
// restrict what can be saved. Whitespace is collapsed to '-' because a relation type is written
// into a single-token link and a space would break it
const sanitize = (value: string): string => value.replace(/\s+/g, '-');

const RelationTypeInput = ({
  name,
  suggestions,
  placeholder,
  className,
}: {
  name: string,
  suggestions: string[],
  placeholder?: string,
  className?: string,
}) => {
  const [field, , helpers] = useField<string>(name);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const value = field.value || '';
  const filtered = suggestions.filter(suggestion => suggestion !== value && suggestion.includes(value.toLowerCase()));

  // Reset the highlight whenever the visible list changes so it can never point past the end
  useEffect(() => {
    setHighlightedIndex(filtered.length > 0 ? 0 : -1);
  }, [value, open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const commit = (nextValue: string) => {
    helpers.setValue(sanitize(nextValue));
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (filtered.length > 0) {
        setHighlightedIndex(index => (index + 1) % filtered.length);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (filtered.length > 0) {
        setHighlightedIndex(index => (index - 1 + filtered.length) % filtered.length);
      }
      return;
    }

    if (event.key === 'Enter') {
      if (open && highlightedIndex >= 0 && highlightedIndex < filtered.length) {
        // Only intercept Enter when it is completing a suggestion, otherwise let the form submit
        event.preventDefault();
        commit(filtered[highlightedIndex]);
      }
      return;
    }

    // Space completes the highlighted suggestion rather than typing a space, since a relation type
    // can't contain one anyway
    if (event.key === ' ') {
      if (open && highlightedIndex >= 0 && highlightedIndex < filtered.length) {
        event.preventDefault();
        commit(filtered[highlightedIndex]);
      }
      return;
    }

    if (event.key === 'Escape') {
      if (open) {
        event.stopPropagation();
        setOpen(false);
      }
      return;
    }

    if (event.key === 'Tab' && open && highlightedIndex >= 0 && highlightedIndex < filtered.length) {
      commit(filtered[highlightedIndex]);
    }
  };

  return (
    <div className="kanbn-relation-type-input" ref={containerRef}>
      <input
        className={className}
        type="text"
        name={name}
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        onChange={event => {
          helpers.setValue(sanitize(event.target.value));
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={event => {
          field.onBlur(event);
        }}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {
        open && filtered.length > 0 &&
        <ul className="kanbn-relation-type-suggestions" role="listbox">
          {filtered.map((suggestion, index) => (
            <li
              key={suggestion}
              role="option"
              aria-selected={index === highlightedIndex}
              className={[
                'kanbn-relation-type-suggestion',
                index === highlightedIndex ? 'kanbn-relation-type-suggestion-highlighted' : null
              ].filter(i => i).join(' ')}
              // mousedown fires before the input's blur, so the choice is committed before the list
              // would otherwise be torn down
              onMouseDown={event => {
                event.preventDefault();
                commit(suggestion);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      }
    </div>
  );
};

export default RelationTypeInput;
