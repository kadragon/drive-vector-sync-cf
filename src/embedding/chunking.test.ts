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
      chunks.forEach((chunk) => {
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
      chunks.forEach((chunk) => {
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
      chunks.forEach((chunk) => {
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
});
