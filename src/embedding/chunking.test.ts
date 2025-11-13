/**
 * Tests for text chunking with tiktoken
 *
 * Trace:
 *   spec_id: SPEC-embedding-pipeline-1
 *   task_id: TASK-004
 */

import { describe, it, expect } from 'vitest';
import { chunkText, countTokens, validateChunkSize } from './chunking';

describe('Chunking Module', () => {
  describe('TEST-embedding-pipeline-2: Chunk large file at 2000 token boundaries', () => {
    it('should return single chunk for small text', () => {
      const text = 'This is a small text with few tokens.';
      const chunks = chunkText(text, 2000);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe(text);
      expect(chunks[0].index).toBe(0);
      expect(chunks[0].tokenCount).toBeLessThanOrEqual(2000);
    });

    it('should split large text into multiple chunks', () => {
      // Generate text that exceeds 2000 tokens
      const longText = 'word '.repeat(3000); // ~3000 tokens
      const chunks = chunkText(longText, 2000);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].index).toBe(0);
      expect(chunks[1].index).toBe(1);
    });

    it('should respect maxTokens parameter', () => {
      const text = 'word '.repeat(500);
      const chunks = chunkText(text, 100);

      // Should create multiple chunks with each having <= 100 tokens
      chunks.forEach(chunk => {
        expect(chunk.tokenCount).toBeLessThanOrEqual(100);
      });
    });

    it('should handle empty text', () => {
      const chunks = chunkText('', 2000);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe('');
      expect(chunks[0].tokenCount).toBe(0);
    });

    it('should assign sequential indices to chunks', () => {
      const longText = 'word '.repeat(3000);
      const chunks = chunkText(longText, 1000);

      chunks.forEach((chunk, idx) => {
        expect(chunk.index).toBe(idx);
      });
    });
  });

  describe('TEST-embedding-pipeline-6: Track chunk indices correctly', () => {
    it('should track chunk metadata correctly', () => {
      const text = 'word '.repeat(2500);
      const chunks = chunkText(text, 1000);

      // Verify each chunk has required metadata
      chunks.forEach(chunk => {
        expect(chunk).toHaveProperty('text');
        expect(chunk).toHaveProperty('index');
        expect(chunk).toHaveProperty('tokenCount');
        expect(typeof chunk.index).toBe('number');
        expect(typeof chunk.tokenCount).toBe('number');
      });
    });
  });

  describe('countTokens utility', () => {
    it('should count tokens correctly', () => {
      const text = 'Hello world, this is a test.';
      const count = countTokens(text);

      expect(count).toBeGreaterThan(0);
      expect(typeof count).toBe('number');
    });

    it('should return 0 for empty string', () => {
      const count = countTokens('');
      expect(count).toBe(0);
    });

    it('should count tokens for long text', () => {
      const longText = 'word '.repeat(100);
      const count = countTokens(longText);

      expect(count).toBeGreaterThan(90); // Should be around 100
      expect(count).toBeLessThan(110);
    });
  });

  describe('validateChunkSize utility', () => {
    it('should validate chunks are within size limit', () => {
      const text = 'word '.repeat(1500);
      const chunks = chunkText(text, 1000);

      const isValid = validateChunkSize(chunks, 1000);
      expect(isValid).toBe(true);
    });

    it('should return false if any chunk exceeds limit', () => {
      const chunks = [
        { text: 'test', index: 0, tokenCount: 500 },
        { text: 'test', index: 1, tokenCount: 1500 }, // Exceeds 1000
      ];

      const isValid = validateChunkSize(chunks, 1000);
      expect(isValid).toBe(false);
    });

    it('should return true for empty chunks array', () => {
      const isValid = validateChunkSize([], 1000);
      expect(isValid).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle text with special characters', () => {
      const text = '你好世界 Hello 🌍 مرحبا';
      const chunks = chunkText(text, 2000);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe(text);
    });

    it('should handle very long text with many tokens', () => {
      // Create text with many tokens (each word will be a token)
      const longText = Array.from({ length: 2500 }, (_, i) => `word${i}`).join(' ');
      const chunks = chunkText(longText, 1000);

      // Should create multiple chunks
      expect(chunks.length).toBeGreaterThan(1);

      // Verify all chunks are within limit
      chunks.forEach(chunk => {
        expect(chunk.tokenCount).toBeLessThanOrEqual(1000);
      });
    });

    it('should handle text with newlines and whitespace', () => {
      const text = 'Line 1\n\nLine 2\n  Line 3\t\tLine 4';
      const chunks = chunkText(text, 2000);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].tokenCount).toBeGreaterThan(0);
    });

    it('should handle markdown-like text', () => {
      const markdown = `
# Heading 1

This is a paragraph with **bold** and *italic* text.

- List item 1
- List item 2

\`\`\`javascript
const code = 'example';
\`\`\`
      `;

      const chunks = chunkText(markdown, 2000);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].tokenCount).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should handle large documents efficiently', () => {
      const largeText = 'word '.repeat(10000); // ~10k tokens
      const startTime = Date.now();

      const chunks = chunkText(largeText, 2000);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000);
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('Chunk Overlap (TASK-020)', () => {
    it('should create overlapping chunks with default 200 token overlap', () => {
      // Create text with ~3000 tokens
      const longText = 'word '.repeat(3000);
      const chunks = chunkText(longText, 2000, 200);

      // With 2000 max tokens and 200 overlap:
      // - Step size = 2000 - 200 = 1800
      // - Should create more chunks than without overlap
      expect(chunks.length).toBeGreaterThan(1);

      // All chunks except possibly the last should be at maxTokens
      chunks.slice(0, -1).forEach(chunk => {
        expect(chunk.tokenCount).toBeLessThanOrEqual(2000);
      });
    });

    it('should create chunks without overlap when overlapTokens is 0', () => {
      // Create a very long text to ensure multiple chunks
      const longText = 'word '.repeat(10000); // Very long text
      const chunksWithOverlap = chunkText(longText, 2000, 400);
      const chunksWithoutOverlap = chunkText(longText, 2000, 0);

      // Both should have multiple chunks
      expect(chunksWithOverlap.length).toBeGreaterThan(2);
      expect(chunksWithoutOverlap.length).toBeGreaterThan(2);

      // Without overlap should create fewer chunks (or equal if text is short)
      expect(chunksWithoutOverlap.length).toBeLessThanOrEqual(chunksWithOverlap.length);
    });

    it('should have content overlap between consecutive chunks', () => {
      // Create text with distinct words to verify overlap
      const text = Array.from({ length: 3000 }, (_, i) => `word${i}`).join(' ');
      const chunks = chunkText(text, 1000, 200);

      expect(chunks.length).toBeGreaterThan(1);

      // Check that consecutive chunks have overlapping content
      for (let i = 0; i < chunks.length - 1; i++) {
        const currentChunk = chunks[i].text;
        const nextChunk = chunks[i + 1].text;

        // Extract first 50 characters from next chunk
        const nextChunkStart = nextChunk.substring(0, Math.min(50, nextChunk.length));

        // This substring should exist in the current chunk (overlap verification)
        const hasOverlap = currentChunk.includes(nextChunkStart);
        expect(hasOverlap).toBe(true);
      }
    });

    it('should auto-adjust overlap when it exceeds 50% of maxTokens', () => {
      const longText = 'word '.repeat(500);
      // Request 200 token overlap but maxTokens is only 100
      // Should auto-adjust to max 50 tokens (50% of 100)
      const chunks = chunkText(longText, 100, 200);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.tokenCount).toBeLessThanOrEqual(100);
      });
    });

    it('should handle custom overlap values', () => {
      const longText = 'word '.repeat(6000); // ~6000 tokens
      const chunks50 = chunkText(longText, 2000, 100); // step = 1900
      const chunks400 = chunkText(longText, 2000, 400); // step = 1600

      // More overlap = more chunks (smaller step size)
      // With 100 overlap: step = 1900, chunks = ceil(6000/1900) = 4
      // With 400 overlap: step = 1600, chunks = ceil(6000/1600) = 4
      expect(chunks400.length).toBeGreaterThanOrEqual(chunks50.length);
    });

    it('should throw error for negative overlap', () => {
      const text = 'test text';
      expect(() => chunkText(text, 1000, -10)).toThrow('overlapTokens must be non-negative');
    });

    it('should throw error for non-positive maxTokens', () => {
      const text = 'test text';
      expect(() => chunkText(text, 0, 100)).toThrow('maxTokens must be positive');
      expect(() => chunkText(text, -100, 100)).toThrow('maxTokens must be positive');
    });

    it('should produce valid, non-empty chunks with overlap', () => {
      // Create a text with clear sentence structure
      const paragraph = 'This is a test sentence. '.repeat(400); // ~400 sentences
      const chunks = chunkText(paragraph, 1000, 200);

      expect(chunks.length).toBeGreaterThan(1);

      // Verify each chunk has meaningful content (not cut mid-word)
      chunks.forEach(chunk => {
        expect(chunk.text.length).toBeGreaterThan(0);
        // Should not be just whitespace
        expect(chunk.text.trim().length).toBeGreaterThan(0);
      });
    });
  });
});
