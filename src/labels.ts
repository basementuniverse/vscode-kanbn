// Names that come from a board's config (custom fields, sort fields) are written as identifiers more
// often than as prose, so 'designSignedOffAt' would otherwise appear next to our own labels, and be
// uppercased into 'DESIGNSIGNEDOFFAT' by the sections that uppercase their labels. Splitting a name
// into words and casing it the way we case our own labels makes it read like the rest of the UI
//
// The webview and the extension are built separately, but both show these names, so this module is
// shared between them

/**
 * Split a user-configured name into words. Names are usually identifiers, but they can also be
 * written as prose or with separators, so handle camelCase, PascalCase, kebab-case, snake_case and
 * plain spaces
 * @param name The name to split
 * @return The words in the name
 */
const splitName = (name: string): string[] => name
  .replace(/[_\-.]+/g, ' ')
  // 'signedOff' -> 'signed Off'
  .replace(/([^A-Z\s])([A-Z])/g, '$1 $2')
  // 'JIRATicket' -> 'JIRA Ticket', leaving the acronym intact
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  .split(/\s+/)
  .filter(word => word !== '');

// An all-caps word was almost certainly written that way on purpose, so lowercasing it would lose
// something. Single letters aren't acronyms, they're just words that happen to be capitalised
const isAcronym = (word: string): boolean => word.length > 1 && word === word.toUpperCase();

const lowerWord = (word: string): string => (isAcronym(word) ? word : word.toLowerCase());

const upperFirstWord = (word: string): string => (
  isAcronym(word) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
);

/**
 * Format a user-configured name as a label, e.g. 'designSignedOffAt' -> 'Design signed off at'. Our
 * own labels are sentence case, and the sections that want uppercase labels get there with CSS, so a
 * name formatted this way is consistent wherever it's shown
 * @param name The name to format
 * @return The name as a label
 */
export const nameToLabel = (name: string): string => splitName(name)
  .map((word, i) => (i === 0 ? upperFirstWord(word) : lowerWord(word)))
  .join(' ');

/**
 * Format a user-configured name for use inside a sentence, e.g. 'Clear design signed off at'
 * @param name The name to format
 * @return The name as part of a sentence
 */
export const nameToLowerLabel = (name: string): string => splitName(name)
  .map(lowerWord)
  .join(' ');
