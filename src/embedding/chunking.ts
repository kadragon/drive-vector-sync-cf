/**
 * Text chunking with approximate token counting
 *
 * Note: Replaces tiktoken with approximate counting to reduce Worker bundle size
 * Approximation: ~4 characters per token (good enough for chunking purposes)
 *
 * Trace:
 *   spec_id: SPEC-embedding-pipeline-1
 *   task_id: TASK-004
 */

export interface ChunkResult {
  text: string;
  index: number;
  tokenCount: number;
}

/**
 * Approximate token counting
 * Uses ~4 characters per token heuristic (typical for GPT models)
 * Memory-efficient: iterates without creating new strings
 */
function approximateTokenCount(text: string): number {
  let charCount = 0;
  let inWhitespace = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const isSpace = char === ' ' || char === '\n' || char === '\r' || char === '\t';

    if (isSpace) {
      // Count consecutive whitespace as single space
      if (!inWhitespace) {
        charCount++;
        inWhitespace = true;
      }
    } else {
      charCount++;
      inWhitespace = false;
    }
  }

  return Math.ceil(charCount / 4);
}

/**
 * Chunk text at approximate token boundaries with configurable overlap
 *
 * @param text - The text to chunk
 * @param maxTokens - Maximum tokens per chunk (default: 2000)
 * @param overlapTokens - Number of tokens to overlap between chunks (default: 200)
 */
export function chunkText(
  text: string,
  maxTokens: number = 2000,
  overlapTokens: number = 200
): ChunkResult[] {
  // Validate parameters
  if (maxTokens <= 0) {
    throw new Error('maxTokens must be positive');
  }

  if (overlapTokens < 0) {
    throw new Error('overlapTokens must be non-negative');
  }

  // Auto-adjust overlap if it's too large for the given maxTokens
  const effectiveOverlap = Math.min(overlapTokens, Math.floor(maxTokens * 0.5));

  const approximateTokens = approximateTokenCount(text);

  // If text is within limit, return single chunk
  // Additional safety: also check raw length to prevent whitespace-heavy inputs from bypassing limits
  if (approximateTokens <= maxTokens && text.length <= maxTokens * 4) {
    return [
      {
        text,
        index: 0,
        tokenCount: approximateTokens,
      },
    ];
  }

  // Convert token limits to character limits (approximate)
  const maxChars = maxTokens * 4;
  const overlapChars = effectiveOverlap * 4;
  const stepChars = maxChars - overlapChars;

  // Split into chunks with overlap
  const chunks: ChunkResult[] = [];
  const textLength = text.length;

  for (let i = 0; i < textLength; i += stepChars) {
    const end = Math.min(i + maxChars, textLength);
    const chunkText = text.substring(i, end);

    chunks.push({
      text: chunkText,
      index: chunks.length,
      tokenCount: approximateTokenCount(chunkText),
    });
  }

  return chunks;
}

/**
 * Count tokens in text (approximate)
 */
export function countTokens(text: string): number {
  return approximateTokenCount(text);
}

/**
 * Validate chunk size
 */
export function validateChunkSize(chunks: ChunkResult[], maxTokens: number): boolean {
  return chunks.every(chunk => chunk.tokenCount <= maxTokens);
}
