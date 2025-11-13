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
 * Chunk text at token boundaries
 */
export function chunkText(
  text: string,
  maxTokens: number = 2000
): ChunkResult[] {
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

    // Split into chunks
    const chunks: ChunkResult[] = [];
    for (let i = 0; i < tokens.length; i += maxTokens) {
      const chunkTokens = tokens.slice(i, i + maxTokens);
      const chunkText = new TextDecoder().decode(encoding.decode(chunkTokens));

      chunks.push({
        text: chunkText,
        index: chunks.length,
        tokenCount: chunkTokens.length,
      });
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
  return chunks.every((chunk) => chunk.tokenCount <= maxTokens);
}
