export const DEFAULT_READING_WORDS_PER_MINUTE = 200;

export interface ReadingTimeEstimate {
  minutes: number;
  words: number;
  wordsPerMinute: number;
}

export function estimateReadingTime(
  source: string | undefined,
  wordsPerMinute = DEFAULT_READING_WORDS_PER_MINUTE,
): ReadingTimeEstimate {
  if (!Number.isFinite(wordsPerMinute) || wordsPerMinute <= 0) {
    throw new RangeError('wordsPerMinute must be a positive number.');
  }

  const words = countWords(normalizeMarkdownForReadingTime(source ?? ''));
  const minutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / wordsPerMinute));

  return { minutes, words, wordsPerMinute };
}

function normalizeMarkdownForReadingTime(source: string): string {
  return source
    .replace(/^---[\s\S]*?---\s*/, ' ')
    .replace(/```[\s\S]*?```/g, (codeBlock) => codeBlock.replace(/```[^\n]*|```/g, ' '))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[\[[^\]]+\]\]/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_~=-]/g, ' ');
}

function countWords(source: string): number {
  return source.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
