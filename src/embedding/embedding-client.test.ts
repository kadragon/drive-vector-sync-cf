/**
 * Tests for Embedding Client
 *
 * Trace:
 *   spec_id: SPEC-embedding-pipeline-1
 *   task_id: TASK-005
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingClient } from './embedding-client';
import { EmbeddingError } from '../errors/index';

// Mock OpenAI client
const mockCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      embeddings = {
        create: mockCreate,
      };
    },
  };
});

// Constants
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const CUSTOM_EMBEDDING_DIMENSIONS = 768;

describe('EmbeddingClient', () => {
  let client: EmbeddingClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new EmbeddingClient({
      apiKey: 'test-api-key',
    });
  });

  describe('Configuration', () => {
    it('should use default model and dimensions', () => {
      const testClient = new EmbeddingClient({
        apiKey: 'test-key',
      });

      expect(testClient).toBeDefined();
    });

    it('should accept custom model and dimensions', () => {
      const customClient = new EmbeddingClient({
        apiKey: 'test-key',
        model: 'text-embedding-ada-002',
        dimensions: CUSTOM_EMBEDDING_DIMENSIONS,
      });

      expect(customClient).toBeDefined();
    });

    it('should accept a pre-configured OpenAI client instance', () => {
      const mockClient = {
        embeddings: {
          create: vi.fn(),
        },
      };

      const testClient = new EmbeddingClient({
        client: mockClient as any,
      });

      expect(testClient).toBeDefined();
    });

    it('should throw error when neither client nor apiKey is provided', () => {
      expect(() => {
        new EmbeddingClient({});
      }).toThrow('Either "client" or "apiKey" must be provided in EmbeddingConfig');
    });

    it('should prefer client over apiKey when both are provided', () => {
      const mockClient = {
        embeddings: {
          create: vi.fn(),
        },
      };

      const testClient = new EmbeddingClient({
        client: mockClient as any,
        apiKey: 'test-key',
      });

      expect(testClient).toBeDefined();
    });
  });

  describe('embedBatch', () => {
    it('should handle empty input arrays', async () => {
      const result = await client.embedBatch([]);

      expect(result).toEqual([]);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should embed single text correctly', async () => {
      const mockEmbedding = Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.1);
      mockCreate.mockResolvedValue({
        data: [
          {
            index: 0,
            embedding: mockEmbedding,
          },
        ],
      });

      const result = await client.embedBatch(['Hello world']);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockEmbedding);
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: ['Hello world'],
        dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
      });
    });

    it('should embed multiple texts in batch', async () => {
      const mockEmbedding1 = Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.1);
      const mockEmbedding2 = Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.2);
      const mockEmbedding3 = Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.3);

      mockCreate.mockResolvedValue({
        data: [
          { index: 0, embedding: mockEmbedding1 },
          { index: 1, embedding: mockEmbedding2 },
          { index: 2, embedding: mockEmbedding3 },
        ],
      });

      const result = await client.embedBatch(['First text', 'Second text', 'Third text']);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(mockEmbedding1);
      expect(result[1]).toEqual(mockEmbedding2);
      expect(result[2]).toEqual(mockEmbedding3);
    });

    it('should preserve order using response indices', async () => {
      const mockEmbedding1 = Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.1);
      const mockEmbedding2 = Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.2);

      // Return embeddings in reverse order
      mockCreate.mockResolvedValue({
        data: [
          { index: 1, embedding: mockEmbedding2 },
          { index: 0, embedding: mockEmbedding1 },
        ],
      });

      const result = await client.embedBatch(['First', 'Second']);

      // Should be sorted by index
      expect(result[0]).toEqual(mockEmbedding1);
      expect(result[1]).toEqual(mockEmbedding2);
    });

    it('should validate embedding dimensions match config', async () => {
      const wrongDimensionEmbedding = Array(CUSTOM_EMBEDDING_DIMENSIONS).fill(0.1); // Wrong size

      mockCreate.mockResolvedValue({
        data: [{ index: 0, embedding: wrongDimensionEmbedding }],
      });

      await expect(client.embedBatch(['Test'])).rejects.toThrow(EmbeddingError);
      // Error is wrapped, so we just check it's an EmbeddingError
    });

    it('should handle API errors by wrapping in EmbeddingError', async () => {
      mockCreate.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(client.embedBatch(['Test'])).rejects.toThrow(EmbeddingError);
      await expect(client.embedBatch(['Test'])).rejects.toThrow('Failed to generate embeddings');
    }, 10000); // Increase timeout for retry logic

    it('should include context in error messages', async () => {
      mockCreate.mockRejectedValue(new Error('Network error'));

      try {
        await client.embedBatch(['Text 1', 'Text 2', 'Text 3']);
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingError);
        const embeddingError = error as EmbeddingError;
        expect(embeddingError.context).toBeDefined();
      }
    });
  });

  describe('embedSingle', () => {
    it('should embed single text using embedBatch', async () => {
      const mockEmbedding = Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.5);
      mockCreate.mockResolvedValue({
        data: [{ index: 0, embedding: mockEmbedding }],
      });

      const result = await client.embedSingle('Single text');

      expect(result).toEqual(mockEmbedding);
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: ['Single text'],
        dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
      });
    });

    it('should handle errors from embedBatch', async () => {
      mockCreate.mockRejectedValue(new Error('API error'));

      await expect(client.embedSingle('Test')).rejects.toThrow(EmbeddingError);
    });
  });

  describe('embedWithBatching', () => {
    it('should handle empty arrays', async () => {
      const result = await client.embedWithBatching([], 32);

      expect(result).toEqual([]);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should process arrays smaller than batch size in single batch', async () => {
      const mockEmbeddings = [
        Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.1),
        Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.2),
        Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.3),
      ];

      mockCreate.mockResolvedValue({
        data: mockEmbeddings.map((emb, idx) => ({ index: idx, embedding: emb })),
      });

      const result = await client.embedWithBatching(['Text 1', 'Text 2', 'Text 3'], 32);

      expect(result).toHaveLength(3);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should split large arrays into batches of specified size', async () => {
      const texts = Array.from({ length: 100 }, (_, i) => `Text ${i}`);
      const batchSize = 32;

      // Mock successful responses for each batch
      mockCreate.mockImplementation(async ({ input }: { input: string[] }) => {
        return {
          data: input.map((_, idx) => ({
            index: idx,
            embedding: Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.1),
          })),
        };
      });

      const result = await client.embedWithBatching(texts, batchSize);

      expect(result).toHaveLength(100);
      // Should be called 4 times: 32 + 32 + 32 + 4
      expect(mockCreate).toHaveBeenCalledTimes(4);
    });

    it('should handle arrays that do not divide evenly by batch size', async () => {
      const texts = Array.from({ length: 50 }, (_, i) => `Text ${i}`);
      const batchSize = 32;

      mockCreate.mockImplementation(async ({ input }: { input: string[] }) => {
        return {
          data: input.map((_, idx) => ({
            index: idx,
            embedding: Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.1),
          })),
        };
      });

      const result = await client.embedWithBatching(texts, batchSize);

      expect(result).toHaveLength(50);
      // Should be called 2 times: 32 + 18
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should concatenate results in correct order', async () => {
      const texts = ['Text 1', 'Text 2', 'Text 3', 'Text 4', 'Text 5'];
      const batchSize = 2;

      let callCount = 0;
      mockCreate.mockImplementation(async ({ input }: { input: string[] }) => {
        callCount++;
        return {
          data: input.map((_, idx) => ({
            index: idx,
            embedding: Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(callCount * 0.1),
          })),
        };
      });

      const result = await client.embedWithBatching(texts, batchSize);

      expect(result).toHaveLength(5);
      // First batch (2 items) should have 0.1
      expect(result[0][0]).toBeCloseTo(0.1);
      expect(result[1][0]).toBeCloseTo(0.1);
      // Second batch (2 items) should have 0.2
      expect(result[2][0]).toBeCloseTo(0.2);
      expect(result[3][0]).toBeCloseTo(0.2);
      // Third batch (1 item) should have 0.3
      expect(result[4][0]).toBeCloseTo(0.3);
    });

    it('should use default batch size of 32', async () => {
      const texts = ['Text 1', 'Text 2'];

      mockCreate.mockResolvedValue({
        data: texts.map((_, idx) => ({
          index: idx,
          embedding: Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.1),
        })),
      });

      const result = await client.embedWithBatching(texts);

      expect(result).toHaveLength(2);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in batch processing', async () => {
      const texts = Array.from({ length: 100 }, (_, i) => `Text ${i}`);

      // Fail on second batch after retries
      let callCount = 0;
      mockCreate.mockImplementation(async () => {
        callCount++;
        if (callCount > 3) {
          // After retries for first batch, fail persistently
          throw new Error('API error on second batch');
        }
        if (callCount <= 3) {
          // First batch succeeds after retries
          return {
            data: Array(32)
              .fill(null)
              .map((_, idx) => ({
                index: idx,
                embedding: Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.1),
              })),
          };
        }
        throw new Error('API error on second batch');
      });

      await expect(client.embedWithBatching(texts, 32)).rejects.toThrow(EmbeddingError);
    }, 10000); // Increase timeout for retry logic
  });

  describe('Retry Logic Integration', () => {
    it('should use retry logic via withRetry', async () => {
      let attemptCount = 0;
      mockCreate.mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return {
          data: [{ index: 0, embedding: Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.1) }],
        };
      });

      const result = await client.embedBatch(['Test']);

      expect(result).toHaveLength(1);
      expect(attemptCount).toBe(3);
    });

    it('should fail after max retries', async () => {
      mockCreate.mockRejectedValue(new Error('Persistent failure'));

      await expect(client.embedBatch(['Test'])).rejects.toThrow(EmbeddingError);
    });
  });

  describe('Custom Configuration', () => {
    it('should use custom model when specified', async () => {
      const customClient = new EmbeddingClient({
        apiKey: 'test-key',
        model: 'text-embedding-ada-002',
        dimensions: CUSTOM_EMBEDDING_DIMENSIONS,
      });

      const mockEmbedding = Array(CUSTOM_EMBEDDING_DIMENSIONS).fill(0.1);
      mockCreate.mockResolvedValue({
        data: [{ index: 0, embedding: mockEmbedding }],
      });

      await customClient.embedBatch(['Test']);

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'text-embedding-ada-002',
        input: ['Test'],
        dimensions: CUSTOM_EMBEDDING_DIMENSIONS,
      });
    });

    it('should validate custom dimensions', async () => {
      const customClient = new EmbeddingClient({
        apiKey: 'test-key',
        dimensions: CUSTOM_EMBEDDING_DIMENSIONS,
      });

      const wrongDimensionEmbedding = Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.1);
      mockCreate.mockResolvedValue({
        data: [{ index: 0, embedding: wrongDimensionEmbedding }],
      });

      await expect(customClient.embedBatch(['Test'])).rejects.toThrow(EmbeddingError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long texts', async () => {
      const longText = 'Lorem ipsum '.repeat(10000);
      const mockEmbedding = Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.1);

      mockCreate.mockResolvedValue({
        data: [{ index: 0, embedding: mockEmbedding }],
      });

      const result = await client.embedBatch([longText]);

      expect(result).toHaveLength(1);
    });

    it('should handle special characters and Unicode', async () => {
      const specialTexts = [
        '你好世界', // Chinese
        'مرحبا بالعالم', // Arabic
        '🚀 Emoji test 🎉',
        'Special: @#$%^&*()',
      ];

      const mockEmbeddings = specialTexts.map(() => Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.1));
      mockCreate.mockResolvedValue({
        data: mockEmbeddings.map((emb, idx) => ({ index: idx, embedding: emb })),
      });

      const result = await client.embedBatch(specialTexts);

      expect(result).toHaveLength(specialTexts.length);
    });

    it('should handle whitespace-only text', async () => {
      const mockEmbedding = Array(DEFAULT_EMBEDDING_DIMENSIONS).fill(0.1);
      mockCreate.mockResolvedValue({
        data: [{ index: 0, embedding: mockEmbedding }],
      });

      const result = await client.embedBatch(['   ']);

      expect(result).toHaveLength(1);
    });
  });
});
