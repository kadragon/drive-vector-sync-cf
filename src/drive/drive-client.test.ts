/**
 * Tests for DriveClient path building and recursive filtering
 * Updated for Service Account authentication
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DriveClient } from './drive-client.js';
import { google } from 'googleapis';

// Mock googleapis with proper class mocking for Vitest 4.x
vi.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: class MockJWT {
        constructor() {
          // Mock JWT constructor
        }
      },
    },
    drive: vi.fn(),
  },
}));

describe('DriveClient - Path Building and Filtering', () => {
  let driveClient: DriveClient;
  let mockDrive: any;

  const mockServiceAccountCredentials = {
    clientEmail: 'test@test-project.iam.gserviceaccount.com',
    privateKey: '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----\n',
  };

  beforeEach(() => {
    mockDrive = {
      files: {
        get: vi.fn(),
        list: vi.fn(),
      },
      changes: {
        getStartPageToken: vi.fn(),
        list: vi.fn(),
      },
    };

    vi.mocked(google.drive).mockReturnValue(mockDrive as any);

    driveClient = new DriveClient(mockServiceAccountCredentials);
  });

  describe('buildFilePath', () => {
    it('should return just filename for file with no parents', async () => {
      // Mock for isFileInFolder check - file is in root folder
      mockDrive.files.get.mockResolvedValueOnce({
        data: {
          id: 'file-1',
          name: 'test.md',
          parents: [],
        },
      });

      mockDrive.changes.list.mockResolvedValueOnce({
        data: {
          changes: [
            {
              fileId: 'file-1',
              file: {
                id: 'file-1',
                name: 'test.md',
                mimeType: 'text/markdown',
                modifiedTime: '2023-01-01T00:00:00Z',
                parents: ['root-folder'],
              },
            },
          ],
          newStartPageToken: 'token-123',
        },
      });

      const result = await driveClient.fetchChanges('token-start', 'root-folder');
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].file?.path).toBe('test.md');
    });

    it('should build full path by traversing parent folders', async () => {
      // Setup: root-folder -> folder1 -> folder2 -> file.md
      mockDrive.files.get
        // isFileInFolder checks: folder-2 -> folder-1 -> root-folder
        .mockResolvedValueOnce({
          data: {
            id: 'folder-2',
            name: 'folder2',
            parents: ['folder-1'],
          },
        })
        .mockResolvedValueOnce({
          data: {
            id: 'folder-1',
            name: 'folder1',
            parents: ['root-folder'],
          },
        })
        // buildFilePath calls: file -> folder2 -> folder1 -> root-folder
        .mockResolvedValueOnce({
          data: {
            id: 'file-1',
            name: 'test.md',
            parents: ['folder-2'],
          },
        })
        // folder-2 already cached from isFileInFolder
        // folder-1 already cached from isFileInFolder
        .mockResolvedValueOnce({
          data: {
            id: 'root-folder',
            name: 'root',
            parents: [],
          },
        });

      mockDrive.changes.list.mockResolvedValueOnce({
        data: {
          changes: [
            {
              fileId: 'file-1',
              file: {
                id: 'file-1',
                name: 'test.md',
                mimeType: 'text/markdown',
                modifiedTime: '2023-01-01T00:00:00Z',
                parents: ['folder-2'],
              },
            },
          ],
          newStartPageToken: 'token-123',
        },
      });

      const result = await driveClient.fetchChanges('token-start', 'root-folder');
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].file?.path).toBe('folder1/folder2/test.md');
    });

    it('should use cached path on second request', async () => {
      // First request - will build path
      mockDrive.files.get
        // isFileInFolder: check folder-1 -> root-folder (caches folder-1)
        .mockResolvedValueOnce({
          data: {
            id: 'folder-1',
            name: 'folder1',
            parents: ['root-folder'],
          },
        });
      // buildFilePath: folder-1 already cached, no additional API calls needed

      mockDrive.changes.list.mockResolvedValueOnce({
        data: {
          changes: [
            {
              fileId: 'file-1',
              file: {
                id: 'file-1',
                name: 'test.md',
                mimeType: 'text/markdown',
                modifiedTime: '2023-01-01T00:00:00Z',
                parents: ['folder-1'],
              },
            },
          ],
          newStartPageToken: 'token-123',
        },
      });

      await driveClient.fetchChanges('token-start', 'root-folder');

      // Second request - should use cache (no more get calls)
      mockDrive.changes.list.mockResolvedValueOnce({
        data: {
          changes: [
            {
              fileId: 'file-1',
              file: {
                id: 'file-1',
                name: 'test.md',
                mimeType: 'text/markdown',
                modifiedTime: '2023-01-01T00:00:00Z',
                parents: ['folder-1'],
              },
            },
          ],
          newStartPageToken: 'token-456',
        },
      });

      await driveClient.fetchChanges('token-123', 'root-folder');

      // Should have called get only 1 time total
      // First request: isFileInFolder (folder-1), buildFilePath uses cache
      // Second request: both use cache (pathCache returns immediately)
      expect(mockDrive.files.get).toHaveBeenCalledTimes(1);
    });

    it('should build path using cached folder info', async () => {
      // isFileInFolder succeeds and caches folder-1
      mockDrive.files.get.mockResolvedValueOnce({
        data: {
          id: 'folder-1',
          name: 'folder1',
          parents: ['root-folder'],
        },
      });

      mockDrive.changes.list.mockResolvedValueOnce({
        data: {
          changes: [
            {
              fileId: 'file-1',
              file: {
                id: 'file-1',
                name: 'test.md',
                mimeType: 'text/markdown',
                modifiedTime: '2023-01-01T00:00:00Z',
                parents: ['folder-1'],
              },
            },
          ],
          newStartPageToken: 'token-123',
        },
      });

      const result = await driveClient.fetchChanges('token-start', 'root-folder');
      // buildFilePath uses cached folder info from isFileInFolder
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].file?.path).toBe('folder1/test.md');
    });

    it('should select correct parent when file has multiple parents', async () => {
      // File has two parents: folder-A (under root-folder) and folder-B (under other-root)
      // Setup: root-folder -> folder-A
      mockDrive.files.get
        // isFileInFolder: check folder-B first
        .mockResolvedValueOnce({
          data: {
            id: 'folder-B',
            name: 'folderB',
            parents: ['other-root'],
          },
        })
        .mockResolvedValueOnce({
          data: {
            id: 'other-root',
            name: 'other',
            parents: [],
          },
        })
        // isFileInFolder: check folder-A second (this matches!)
        .mockResolvedValueOnce({
          data: {
            id: 'folder-A',
            name: 'folderA',
            parents: ['root-folder'],
          },
        });

      mockDrive.changes.list.mockResolvedValueOnce({
        data: {
          changes: [
            {
              fileId: 'file-1',
              file: {
                id: 'file-1',
                name: 'test.md',
                mimeType: 'text/markdown',
                modifiedTime: '2023-01-01T00:00:00Z',
                parents: ['folder-B', 'folder-A'], // Multiple parents!
              },
            },
          ],
          newStartPageToken: 'token-123',
        },
      });

      const result = await driveClient.fetchChanges('token-start', 'root-folder');
      expect(result.changes).toHaveLength(1);
      // Should use folder-A path, not folder-B
      expect(result.changes[0].file?.path).toBe('folderA/test.md');
    });
  });

  describe('isFileInFolder', () => {
    it('should detect file in root folder (direct parent)', async () => {
      // isFileInFolder: direct parent is root-folder (matches immediately, no API call)
      // buildFilePath: parent is root-folder (stops immediately, no API call)

      mockDrive.changes.list.mockResolvedValueOnce({
        data: {
          changes: [
            {
              fileId: 'file-1',
              file: {
                id: 'file-1',
                name: 'test.md',
                mimeType: 'text/markdown',
                modifiedTime: '2023-01-01T00:00:00Z',
                parents: ['root-folder'],
              },
            },
          ],
          newStartPageToken: 'token-123',
        },
      });

      const result = await driveClient.fetchChanges('token-start', 'root-folder');
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].type).toBe('modified');
    });

    it('should detect file in nested folder (indirect parent)', async () => {
      // Setup: root-folder -> folder1 -> folder2 -> file
      mockDrive.files.get
        // isFileInFolder: traverse folder-2 -> folder-1 -> root-folder
        .mockResolvedValueOnce({
          data: {
            id: 'folder-2',
            name: 'folder2',
            parents: ['folder-1'],
          },
        })
        .mockResolvedValueOnce({
          data: {
            id: 'folder-1',
            name: 'folder1',
            parents: ['root-folder'],
          },
        });
      // buildFilePath: folder-2 and folder-1 already cached, no additional API calls

      mockDrive.changes.list.mockResolvedValueOnce({
        data: {
          changes: [
            {
              fileId: 'file-1',
              file: {
                id: 'file-1',
                name: 'test.md',
                mimeType: 'text/markdown',
                modifiedTime: '2023-01-01T00:00:00Z',
                parents: ['folder-2'],
              },
            },
          ],
          newStartPageToken: 'token-123',
        },
      });

      const result = await driveClient.fetchChanges('token-start', 'root-folder');
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].type).toBe('modified');
    });

    it('should reject file not in root folder tree', async () => {
      // isFileInFolder: other-folder -> different-root (not root-folder)
      mockDrive.files.get
        .mockResolvedValueOnce({
          data: {
            id: 'other-folder',
            name: 'other',
            parents: ['different-root'],
          },
        })
        .mockResolvedValueOnce({
          data: {
            id: 'different-root',
            name: 'different',
            parents: [],
          },
        });

      mockDrive.changes.list.mockResolvedValueOnce({
        data: {
          changes: [
            {
              fileId: 'file-1',
              file: {
                id: 'file-1',
                name: 'test.md',
                mimeType: 'text/markdown',
                modifiedTime: '2023-01-01T00:00:00Z',
                parents: ['other-folder'],
              },
            },
          ],
          newStartPageToken: 'token-123',
        },
      });

      const result = await driveClient.fetchChanges('token-start', 'root-folder');
      // File should be filtered out
      expect(result.changes).toHaveLength(0);
    });

    it('should use cached folder hierarchy', async () => {
      // First request
      mockDrive.files.get
        // isFileInFolder: folder-1 (caches folder-1)
        .mockResolvedValueOnce({
          data: {
            id: 'folder-1',
            name: 'folder1',
            parents: ['root-folder'],
          },
        });
      // buildFilePath: folder-1 already cached, no additional API calls

      mockDrive.changes.list.mockResolvedValueOnce({
        data: {
          changes: [
            {
              fileId: 'file-1',
              file: {
                id: 'file-1',
                name: 'test.md',
                mimeType: 'text/markdown',
                modifiedTime: '2023-01-01T00:00:00Z',
                parents: ['folder-1'],
              },
            },
          ],
          newStartPageToken: 'token-123',
        },
      });

      await driveClient.fetchChanges('token-start', 'root-folder');

      // Second request with same folder hierarchy
      // folder-1 is cached, no API calls needed

      mockDrive.changes.list.mockResolvedValueOnce({
        data: {
          changes: [
            {
              fileId: 'file-2',
              file: {
                id: 'file-2',
                name: 'test2.md',
                mimeType: 'text/markdown',
                modifiedTime: '2023-01-01T00:00:00Z',
                parents: ['folder-1'],
              },
            },
          ],
          newStartPageToken: 'token-456',
        },
      });

      await driveClient.fetchChanges('token-123', 'root-folder');

      // folder-1 should be cached, so 1 get call total
      // First request: isFileInFolder (folder-1), buildFilePath uses cache
      // Second request: both use cache (folder cache + path cache)
      expect(mockDrive.files.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearCache', () => {
    it('should clear all caches', async () => {
      // Build up cache
      mockDrive.files.get
        // isFileInFolder: folder-1 (caches folder-1 and path)
        .mockResolvedValueOnce({
          data: {
            id: 'folder-1',
            name: 'folder1',
            parents: ['root-folder'],
          },
        });
      // buildFilePath: folder-1 already cached, no additional API calls

      mockDrive.changes.list.mockResolvedValueOnce({
        data: {
          changes: [
            {
              fileId: 'file-1',
              file: {
                id: 'file-1',
                name: 'test.md',
                mimeType: 'text/markdown',
                modifiedTime: '2023-01-01T00:00:00Z',
                parents: ['folder-1'],
              },
            },
          ],
          newStartPageToken: 'token-123',
        },
      });

      await driveClient.fetchChanges('token-start', 'root-folder');

      // Clear cache
      driveClient.clearCache();

      // Next request should re-fetch folder-1
      mockDrive.files.get
        // isFileInFolder: folder-1 (re-fetched after cache clear)
        .mockResolvedValueOnce({
          data: {
            id: 'folder-1',
            name: 'folder1',
            parents: ['root-folder'],
          },
        });
      // buildFilePath: folder-1 already cached again, no additional API calls

      mockDrive.changes.list.mockResolvedValueOnce({
        data: {
          changes: [
            {
              fileId: 'file-1',
              file: {
                id: 'file-1',
                name: 'test.md',
                mimeType: 'text/markdown',
                modifiedTime: '2023-01-01T00:00:00Z',
                parents: ['folder-1'],
              },
            },
          ],
          newStartPageToken: 'token-456',
        },
      });

      await driveClient.fetchChanges('token-123', 'root-folder');

      // Should have called get 2 times total
      // First request: isFileInFolder (folder-1)
      // Second request after cache clear: isFileInFolder (folder-1) again
      expect(mockDrive.files.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('fromJSON - Service Account Factory Method', () => {
    it('should create DriveClient from valid service account JSON', () => {
      const serviceAccountJSON = JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        private_key_id: 'key-id',
        private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----\n',
        client_email: 'test@test-project.iam.gserviceaccount.com',
        client_id: '123456',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      });

      const client = DriveClient.fromJSON(serviceAccountJSON);
      expect(client).toBeInstanceOf(DriveClient);
    });

    it('should create DriveClient with subject for domain-wide delegation', () => {
      const serviceAccountJSON = JSON.stringify({
        client_email: 'test@test-project.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----\n',
      });

      const client = DriveClient.fromJSON(serviceAccountJSON, 'user@example.com');
      expect(client).toBeInstanceOf(DriveClient);
    });

    it('should throw error for invalid JSON', () => {
      expect(() => {
        DriveClient.fromJSON('invalid json');
      }).toThrow(/Failed to parse service account JSON/);
    });

    it('should throw error for missing client_email', () => {
      const invalidJSON = JSON.stringify({
        private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----\n',
      });

      expect(() => {
        DriveClient.fromJSON(invalidJSON);
      }).toThrow(/Failed to parse service account JSON/);
    });

    it('should throw error for missing private_key', () => {
      const invalidJSON = JSON.stringify({
        client_email: 'test@test-project.iam.gserviceaccount.com',
      });

      expect(() => {
        DriveClient.fromJSON(invalidJSON);
      }).toThrow(/Failed to parse service account JSON/);
    });

    it('should throw error for null JSON', () => {
      const invalidJSON = JSON.stringify(null);

      expect(() => {
        DriveClient.fromJSON(invalidJSON);
      }).toThrow(/Failed to parse service account JSON/);
    });

    it('should throw error for array JSON', () => {
      const invalidJSON = JSON.stringify(['client_email', 'private_key']);

      expect(() => {
        DriveClient.fromJSON(invalidJSON);
      }).toThrow(/Failed to parse service account JSON/);
    });

    it('should throw error for primitive string JSON', () => {
      const invalidJSON = JSON.stringify('not an object');

      expect(() => {
        DriveClient.fromJSON(invalidJSON);
      }).toThrow(/Failed to parse service account JSON/);
    });

    it('should throw error for primitive number JSON', () => {
      const invalidJSON = JSON.stringify(123);

      expect(() => {
        DriveClient.fromJSON(invalidJSON);
      }).toThrow(/Failed to parse service account JSON/);
    });

    it('should throw error when client_email is not a string', () => {
      const invalidJSON = JSON.stringify({
        client_email: 123,
        private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----\n',
      });

      expect(() => {
        DriveClient.fromJSON(invalidJSON);
      }).toThrow(/Failed to parse service account JSON/);
    });

    it('should throw error when client_email is empty string', () => {
      const invalidJSON = JSON.stringify({
        client_email: '',
        private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----\n',
      });

      expect(() => {
        DriveClient.fromJSON(invalidJSON);
      }).toThrow(/Failed to parse service account JSON/);
    });

    it('should throw error when private_key is not a string', () => {
      const invalidJSON = JSON.stringify({
        client_email: 'test@test-project.iam.gserviceaccount.com',
        private_key: { key: 'value' },
      });

      expect(() => {
        DriveClient.fromJSON(invalidJSON);
      }).toThrow(/Failed to parse service account JSON/);
    });

    it('should throw error when private_key is empty string', () => {
      const invalidJSON = JSON.stringify({
        client_email: 'test@test-project.iam.gserviceaccount.com',
        private_key: '',
      });

      expect(() => {
        DriveClient.fromJSON(invalidJSON);
      }).toThrow(/Failed to parse service account JSON/);
    });
  });
});
