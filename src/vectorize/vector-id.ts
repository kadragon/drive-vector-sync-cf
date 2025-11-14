/**
 * Vector ID generation and parsing utilities
 * Shared between Qdrant and Vectorize implementations
 *
 * Trace:
 *   spec_id: SPEC-vectorize-migration-1
 *   task_id: TASK-025
 */

/**
 * Generate vector ID from file ID and chunk index
 * Format: {fileId}_{chunkIndex}
 *
 * This format allows file IDs to contain underscores while still
 * being parseable using lastIndexOf('_')
 */
export function generateVectorId(fileId: string, chunkIndex: number): string {
  return `${fileId}_${chunkIndex}`;
}

/**
 * Parse vector ID to extract file ID and chunk index
 * Uses lastIndexOf to handle file IDs that contain underscores
 */
export function parseVectorId(vectorId: string): { fileId: string; chunkIndex: number } {
  const lastUnderscoreIndex = vectorId.lastIndexOf('_');

  if (lastUnderscoreIndex === -1) {
    throw new Error(`Invalid vector ID format: ${vectorId}`);
  }

  const fileId = vectorId.substring(0, lastUnderscoreIndex);
  const chunkIndexStr = vectorId.substring(lastUnderscoreIndex + 1);
  const chunkIndex = parseInt(chunkIndexStr, 10);

  if (isNaN(chunkIndex)) {
    throw new Error(`Invalid chunk index in vector ID: ${vectorId}`);
  }

  return {
    fileId,
    chunkIndex,
  };
}
