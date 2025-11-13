/**
 * Tests for chunk hashing utility
 *
 * Trace:
 *   task_id: TASK-022
 */

import { describe, it, expect } from 'vitest';
import { computeChunkHash } from './hash.js';

describe('computeChunkHash', () => {
  it('should compute a consistent SHA-256 hash for the same text', async () => {
    const text = 'This is a test chunk of text.';
    const hash1 = await computeChunkHash(text);
    const hash2 = await computeChunkHash(text);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
  });

  it('should produce different hashes for different texts', async () => {
    const text1 = 'This is the first chunk.';
    const text2 = 'This is the second chunk.';

    const hash1 = await computeChunkHash(text1);
    const hash2 = await computeChunkHash(text2);

    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty strings', async () => {
    const hash = await computeChunkHash('');

    expect(hash).toHaveLength(64);
    // SHA-256 of empty string is known
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('should handle multi-line text', async () => {
    const text = `Line 1
Line 2
Line 3`;
    const hash = await computeChunkHash(text);

    expect(hash).toHaveLength(64);
  });

  it('should handle unicode characters', async () => {
    const text = 'Hello 世界 🌍';
    const hash = await computeChunkHash(text);

    expect(hash).toHaveLength(64);
  });

  it('should be sensitive to whitespace changes', async () => {
    const text1 = 'Hello World';
    const text2 = 'Hello  World'; // Extra space

    const hash1 = await computeChunkHash(text1);
    const hash2 = await computeChunkHash(text2);

    expect(hash1).not.toBe(hash2);
  });

  it('should handle large text chunks', async () => {
    const largeText = 'A'.repeat(10000);
    const hash = await computeChunkHash(largeText);

    expect(hash).toHaveLength(64);
  });
});
