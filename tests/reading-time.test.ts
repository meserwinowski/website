/**
 * reading-time.test.ts — Unit tests for article reading-time estimates.
 *
 * Unlike the `dist/` suites, this file imports `src/lib/readingTime.ts`
 * directly because the logic is pure: the same input string should always
 * produce the same word count and minute estimate. The tests document the
 * user-facing contract for project metadata ("N min read") and the edge cases
 * that keep markdown syntax from inflating that number.
 *
 * Vitest's `describe` names the unit under test, each `it` captures one rule,
 * and `expect` checks the returned object or thrown error. The compact
 * arrange-act-assert shape is visible in the larger cases below.
 */
import { describe, expect, it } from 'vitest';

import { estimateReadingTime } from '../src/lib/readingTime';

describe('estimateReadingTime', () => {
  it('counts Markdown body words and rounds up at 200 WPM by default', () => {
    // Arrange: 201 simple words. Act + assert: default 200 WPM should round up
    // to two minutes, proving partial minutes do not display as too-short reads.
    const content = Array.from({ length: 201 }, (_, index) => `word${index}`).join(' ');

    expect(estimateReadingTime(content)).toMatchObject({
      minutes: 2,
      words: 201,
      wordsPerMinute: 200,
    });
  });

  it('returns one minute for short non-empty content', () => {
    expect(estimateReadingTime('A short post.')).toMatchObject({
      minutes: 1,
      words: 3,
    });
  });

  it('returns zero minutes for empty content', () => {
    expect(estimateReadingTime('   ')).toMatchObject({
      minutes: 0,
      words: 0,
    });
  });

  it('does not count Markdown syntax as words', () => {
    // This fixture mixes frontmatter, headings, links, and inline code so the
    // test protects the "reader-facing words only" cleanup pipeline.
    const estimate = estimateReadingTime('---\ntitle: Example\n---\n## Heading\nRead [the docs](/docs) and `npm test`.');

    expect(estimate.words).toBe(7);
  });

  it('rejects invalid words-per-minute values', () => {
    // Bad configuration should fail loudly rather than silently dividing by zero.
    expect(() => estimateReadingTime('Words', 0)).toThrow(RangeError);
  });
});
