/**
 * Text chunking with token counting using tiktoken
 *
 * Trace:
 *   spec_id: SPEC-embedding-pipeline-1
 *   task_id: TASK-004
 */

import { get_encoding } from 'tiktoken';

export interface ChunkResult {
  text: string;
  index: number;
  tokenCount: number;
}

/**
 * Chunk text at token boundaries with configurable overlap
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
  if (overlapTokens < 0) {
    throw new Error('overlapTokens must be non-negative');
  }

  // Auto-adjust overlap if it's too large for the given maxTokens
  // Overlap should not exceed 50% of maxTokens to ensure progress
  const effectiveOverlap = Math.min(overlapTokens, Math.floor(maxTokens * 0.5));

  if (effectiveOverlap >= maxTokens) {
    throw new Error('overlapTokens must be less than maxTokens');
  }

  // Get encoding for text-embedding-3-large (uses cl100k_base)
  const encoding = get_encoding('cl100k_base');

  try {
    const tokens = encoding.encode(text);

    // If text is within limit, return single chunk
    if (tokens.length <= maxTokens) {
      return [
        {
          text,
          index: 0,
          tokenCount: tokens.length,
        },
      ];
    }

    // Split into chunks with overlap
    const chunks: ChunkResult[] = [];
    const step = maxTokens - effectiveOverlap;

    for (let i = 0; i < tokens.length; i += step) {
      const chunkTokens = tokens.slice(i, i + maxTokens);
      const chunkText = new TextDecoder().decode(encoding.decode(chunkTokens));

      chunks.push({
        text: chunkText,
        index: chunks.length,
        tokenCount: chunkTokens.length,
      });

      // If we've covered all tokens, break
      if (i + maxTokens >= tokens.length) {
        break;
      }
    }

    return chunks;
  } finally {
    encoding.free();
  }
}

/**
 * Count tokens in text
 */
export function countTokens(text: string): number {
  const encoding = get_encoding('cl100k_base');

  try {
    const tokens = encoding.encode(text);
    return tokens.length;
  } finally {
    encoding.free();
  }
}

/**
 * Validate chunk size
 */
export function validateChunkSize(chunks: ChunkResult[], maxTokens: number): boolean {
  return chunks.every(chunk => chunk.tokenCount <= maxTokens);
}
