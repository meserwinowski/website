import { describe, expect, it } from 'vitest';

import { estimateReadingTime } from '../src/lib/readingTime';

describe('estimateReadingTime', () => {
  it('counts Markdown body words and rounds up at 200 WPM by default', () => {
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
    const estimate = estimateReadingTime('---\ntitle: Example\n---\n## Heading\nRead [the docs](/docs) and `npm test`.');

    expect(estimate.words).toBe(7);
  });

  it('rejects invalid words-per-minute values', () => {
    expect(() => estimateReadingTime('Words', 0)).toThrow(RangeError);
  });
});
