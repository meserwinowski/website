/**
 * readingTime.ts — Estimate how long an article takes to read.
 *
 * The "N min read" label on project pages comes from here. The math is
 * deliberately simple: count the words a human actually *reads*, then divide by
 * a reading speed. The interesting part is step one — the raw source is Obsidian
 * markdown, so we first strip out syntax (frontmatter, code fences, image
 * embeds, link URLs) that a reader skims past or never sees, otherwise the
 * estimate is inflated by things like long code blocks and image paths.
 *
 * This lives in a plain `.ts` module (not an Astro component) so it can be unit
 * tested directly — see tests/reading-time.test.ts.
 */

/**
 * Average adult silent-reading speed for prose, in words per minute. ~200–250
 * wpm is the common range; 200 is a conservative default that slightly rounds
 * estimates up, which reads as more honest than under-promising.
 */
export const DEFAULT_READING_WORDS_PER_MINUTE = 200;

/** The result of an estimate: the label value plus the inputs it was derived from. */
export interface ReadingTimeEstimate {
  /** Whole minutes to display (always ≥ 1 for non-empty content). */
  minutes: number;
  /** Word count after markdown syntax was stripped. */
  words: number;
  /** The reading speed used, echoed back so callers/tests can see the assumption. */
  wordsPerMinute: number;
}

/**
 * Estimate reading time for a markdown `source` string.
 *
 * @param source        Raw markdown (may be `undefined` for empty content).
 * @param wordsPerMinute Reading speed; must be a positive, finite number.
 * @returns The rounded minute count plus the intermediate word count.
 * @throws RangeError if `wordsPerMinute` is zero, negative, NaN, or Infinity —
 *         a bad speed would silently produce nonsense (e.g. divide-by-zero),
 *         so we fail loudly instead.
 */
export function estimateReadingTime(
  source: string | undefined,
  wordsPerMinute = DEFAULT_READING_WORDS_PER_MINUTE,
): ReadingTimeEstimate {
  if (!Number.isFinite(wordsPerMinute) || wordsPerMinute <= 0) {
    throw new RangeError('wordsPerMinute must be a positive number.');
  }

  const words = countWords(normalizeMarkdownForReadingTime(source ?? ''));
  // Empty content stays at 0 (so callers can hide the label); anything with at
  // least one word rounds *up* to a minimum of 1 min, since "0 min read" on a
  // real article looks broken. `Math.ceil` rounds partial minutes up.
  const minutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / wordsPerMinute));

  return { minutes, words, wordsPerMinute };
}

/**
 * Strip markdown syntax so only reader-facing words remain before counting.
 *
 * Order matters: broad, multi-line removals (frontmatter, code fences) run
 * first, then finer inline cleanups. Each `.replace` collapses one syntax form
 * to a space rather than deleting it, so adjacent words never fuse into one.
 */
function normalizeMarkdownForReadingTime(source: string): string {
  return source
    // Leading YAML frontmatter block (`--- ... ---`) — metadata, not prose.
    .replace(/^---[\s\S]*?---\s*/, ' ')
    // Fenced code blocks: drop the ``` fence lines but keep the code's words,
    // since a reader still spends time scanning code.
    .replace(/```[\s\S]*?```/g, (codeBlock) => codeBlock.replace(/```[^\n]*|```/g, ' '))
    // Inline `code`: unwrap the backticks, keep the word inside.
    .replace(/`([^`]+)`/g, '$1')
    // Obsidian image embeds `![[file.png]]` — not read as words.
    .replace(/!\[\[[^\]]+\]\]/g, ' ')
    // Standard markdown images `![alt](url)` — alt text + URL aren't prose.
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    // Links `[label](url)` — keep the visible label, discard the URL.
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    // Leftover formatting punctuation (headings, quotes, emphasis, rules).
    .replace(/[#>*_~=-]/g, ' ');
}

/**
 * Count word-like tokens in already-cleaned text.
 *
 * The Unicode-aware regex (`\p{L}` letters, `\p{N}` numbers, `u` flag) matches
 * accented and non-Latin scripts, and treats internal apostrophes/hyphens as
 * part of a single word (e.g. "don't", "state-of-the-art"). No matches → 0.
 */
function countWords(source: string): number {
  return source.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
