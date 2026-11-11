import { FilterValues } from './BoardFilter';

// Filter panel fields that are checklists of the board's own values. Ticking one means that value
// and nothing else, but kanbn reads every string filter as an unanchored regular expression, so
// `phase:1` would also match `phase:10`, and a tag like `c++` would be a broken pattern
const EXACT_MATCH_FIELDS = ['tag', 'column'];

/**
 * Escape a string so that a regular expression built from it matches it literally
 */
export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A kanbn string filter that matches exactly one value. Kanbn joins multi-value fields like tags
 * into one newline-separated string and doesn't use the multiline flag, so the value is anchored on
 * line breaks as well as the ends of the string, the way kanbn's own docs recommend
 */
export const exactMatchPattern = (value: string): string => `(^|\\n)${escapeRegExp(value)}($|\\n)`;

/**
 * Turn the values ticked in the filter panel's checklists into exact-match patterns, ready to send
 * to the extension host. Every other filter is left as it is
 */
export const toExactMatchFilters = (filters: FilterValues): FilterValues => {
  const result: FilterValues = { ...filters };
  for (const field of EXACT_MATCH_FIELDS) {
    const value = result[field];
    if (value === undefined || value === null) {
      continue;
    }
    result[field] = (Array.isArray(value) ? value : [value]).map((item) => exactMatchPattern(String(item)));
  }
  return result;
};
