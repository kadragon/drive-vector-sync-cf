/**
 * OpenAI embedding client
 *
 * Trace:
 *   spec_id: SPEC-embedding-pipeline-1
 *   task_id: TASK-005
 */

import OpenAI from 'openai';
import { EmbeddingError } from '../errors/index.js';
import { withRetry } from '../errors/index.js';

export interface EmbeddingResult {
  text: string;
  vector: number[];
  index: number;
}

export interface EmbeddingConfig {
  /**
   * OpenAI API key
   * @deprecated Use 'client' parameter instead for better flexibility
   */
  apiKey?: string;
  /**
   * Pre-configured OpenAI client instance
   * Recommended: use createOpenAIClient() from openai-factory.ts
   */
  client?: OpenAI;
  model?: string;
  dimensions?: number;
}

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_DIMENSIONS = 1536;

/**
 * OpenAI embedding client
 */
export class EmbeddingClient {
  private client: OpenAI;
  private model: string;
  private dimensions: number;

  constructor(config: EmbeddingConfig) {
    // Support both pre-configured client and legacy API key config
    if (config.client) {
      this.client = config.client;
    } else if (config.apiKey) {
      this.client = new OpenAI({
        apiKey: config.apiKey,
      });
    } else {
      throw new Error('Either "client" or "apiKey" must be provided in EmbeddingConfig');
    }

    this.model = config.model || DEFAULT_MODEL;
    this.dimensions = config.dimensions || DEFAULT_DIMENSIONS;
  }

  /**
   * Generate embeddings for a batch of texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      const response = await withRetry(async () => {
        return await this.client.embeddings.create({
          model: this.model,
          input: texts,
          dimensions: this.dimensions,
        });
      });

      // Sort by index to ensure correct order
      const embeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map(item => item.embedding);

      // Validate dimensions
      for (const embedding of embeddings) {
        if (embedding.length !== this.dimensions) {
          throw new EmbeddingError('Invalid embedding dimensions', {
            expected: this.dimensions,
            actual: embedding.length,
          });
        }
      }

      return embeddings;
    } catch (error) {
      throw new EmbeddingError('Failed to generate embeddings', {
        textCount: texts.length,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Generate embedding for a single text
   */
  async embedSingle(text: string): Promise<number[]> {
    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  /**
   * Process texts in batches with concurrency control
   */
  async embedWithBatching(texts: string[], batchSize: number = 32): Promise<number[][]> {
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchEmbeddings = await this.embedBatch(batch);
      results.push(...batchEmbeddings);
    }

    return results;
  }
}
