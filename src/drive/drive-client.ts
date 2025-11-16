/**
 * Google Drive API client with Service Account authentication
 *
 * Trace:
 *   spec_id: SPEC-drive-integration-1
 *   task_id: TASK-001, TASK-002, TASK-003, TASK-024
 */

import { drive_v3, drive } from '@googleapis/drive';
import { JWT } from 'google-auth-library';
import { DriveError } from '../errors/index.js';
import { withRetry } from '../errors/index.js';

/**
 * Service Account credentials for Google Drive API
 * Can be provided as either a JSON string or parsed object
 */
export interface DriveCredentials {
  /**
   * Service account email (e.g., "xxx@xxx.iam.gserviceaccount.com")
   */
  clientEmail: string;

  /**
   * Private key from service account JSON
   * Must include the full key with -----BEGIN PRIVATE KEY----- header
   */
  privateKey: string;

  /**
   * Optional: Email of user to impersonate (for domain-wide delegation)
   * If not provided, uses service account's own credentials
   */
  subject?: string;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  path: string;
  parents?: string[];
}

export interface DriveChange {
  fileId: string;
  type: 'added' | 'modified' | 'deleted';
  file?: DriveFileMetadata;
}

/**
 * Google Drive client with Service Account authentication
 */
export class DriveClient {
  private static readonly MAX_RECURSION_DEPTH = 10;
  private static readonly DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

  private drive: drive_v3.Drive;
  private auth: JWT;
  private folderCache: Map<string, { name: string; parents?: string[] }>;
  private pathCache: Map<string, string>;

  constructor(credentials: DriveCredentials) {
    // Create JWT client for Service Account authentication
    this.auth = new JWT({
      email: credentials.clientEmail,
      key: credentials.privateKey,
      scopes: DriveClient.DRIVE_SCOPES,
      subject: credentials.subject, // For domain-wide delegation
    });

    this.drive = drive({ version: 'v3', auth: this.auth });
    this.folderCache = new Map();
    this.pathCache = new Map();
  }

  /**
   * Helper method to create DriveClient from JSON string
   * Useful for reading service account JSON from Cloudflare Secrets
   */
  static fromJSON(json: string, subject?: string): DriveClient {
    try {
      const parsed = JSON.parse(json);

      // Validate that parsed result is an object
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid service account JSON: must be a valid JSON object');
      }

      // Validate client_email
      if (typeof parsed.client_email !== 'string' || !parsed.client_email) {
        throw new Error('Invalid service account JSON: client_email must be a non-empty string');
      }

      // Validate private_key
      if (typeof parsed.private_key !== 'string' || !parsed.private_key) {
        throw new Error('Invalid service account JSON: private_key must be a non-empty string');
      }

      return new DriveClient({
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
        subject,
      });
    } catch (error) {
      throw new DriveError('Failed to parse service account JSON', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Clear internal caches (folder metadata and file paths)
   */
  clearCache(): void {
    this.folderCache.clear();
    this.pathCache.clear();
  }

  /**
   * Get current start page token for changes API
   */
  async getStartPageToken(): Promise<string> {
    try {
      const response = await withRetry(async () => {
        return await this.drive.changes.getStartPageToken({});
      });

      if (!response.data.startPageToken) {
        throw new DriveError('Failed to get start page token');
      }

      return response.data.startPageToken;
    } catch (error) {
      throw new DriveError('Failed to get start page token', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Recursively list all supported files in a folder (.md and .pdf)
   */
  async listMarkdownFiles(rootFolderId: string): Promise<DriveFileMetadata[]> {
    const files: DriveFileMetadata[] = [];
    const folderPathMap = new Map<string, string>();
    folderPathMap.set(rootFolderId, '');

    try {
      await this.scanFolder(rootFolderId, files, folderPathMap);
      return files;
    } catch (error) {
      throw new DriveError('Failed to list supported files', {
        rootFolderId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Count total supported files in a folder (.md and .pdf)
   * This is more efficient than listMarkdownFiles() when only the count is needed
   */
  async getTotalFileCount(rootFolderId: string): Promise<number> {
    let count = 0;

    try {
      await this.countFilesInFolder(rootFolderId, fileCount => {
        count += fileCount;
      });
      return count;
    } catch (error) {
      throw new DriveError('Failed to count supported files', {
        rootFolderId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Recursively count files in folder
   */
  private async countFilesInFolder(
    folderId: string,
    onCount: (count: number) => void
  ): Promise<void> {
    let pageToken: string | undefined;
    const subfolders: string[] = [];

    do {
      const response = await withRetry(async () => {
        return await this.drive.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          pageToken,
          fields: 'nextPageToken, files(id, name, mimeType)',
          pageSize: 1000, // Use max page size for efficiency
        });
      });

      const items = response.data.files || [];
      let fileCountOnPage = 0;

      for (const item of items) {
        if (!item.id || !item.name) continue;

        if (item.mimeType === 'application/vnd.google-apps.folder') {
          subfolders.push(item.id);
        } else if (this.isSupportedFile(item.name, item.mimeType)) {
          fileCountOnPage++;
        }
      }

      if (fileCountOnPage > 0) {
        onCount(fileCountOnPage);
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    // After collecting all subfolders, recurse in parallel
    if (subfolders.length > 0) {
      await Promise.all(
        subfolders.map(subfolderId => this.countFilesInFolder(subfolderId, onCount))
      );
    }
  }

  /**
   * Check if a file is a supported type (.md or .pdf)
   */
  private isSupportedFile(fileName: string, mimeType?: string | null): boolean {
    return (
      fileName.endsWith('.md') ||
      mimeType === 'text/markdown' ||
      fileName.endsWith('.pdf') ||
      mimeType === 'application/pdf'
    );
  }

  /**
   * Recursively scan folder for markdown files
   */
  private async scanFolder(
    folderId: string,
    files: DriveFileMetadata[],
    folderPathMap: Map<string, string>
  ): Promise<void> {
    let pageToken: string | undefined;

    do {
      const response = await withRetry(async () => {
        return await this.drive.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          pageToken,
          fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, parents)',
          pageSize: 100,
        });
      });

      const items = response.data.files || [];

      for (const item of items) {
        if (!item.id || !item.name) continue;

        const parentPath = folderPathMap.get(folderId) || '';
        const currentPath = parentPath ? `${parentPath}/${item.name}` : item.name;

        if (item.mimeType === 'application/vnd.google-apps.folder') {
          // Store folder path
          folderPathMap.set(item.id, currentPath);
          // Recursively scan subfolder
          await this.scanFolder(item.id, files, folderPathMap);
        } else if (this.isSupportedFile(item.name, item.mimeType)) {
          // Add supported file (markdown or PDF)
          files.push({
            id: item.id,
            name: item.name,
            mimeType:
              item.mimeType || (item.name.endsWith('.pdf') ? 'application/pdf' : 'text/markdown'),
            modifiedTime: item.modifiedTime || new Date().toISOString(),
            path: currentPath,
            parents: item.parents || undefined,
          });
        }
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
  }

  /**
   * Fetch changes since startPageToken
   */
  async fetchChanges(
    startPageToken: string,
    rootFolderId: string
  ): Promise<{ changes: DriveChange[]; newStartPageToken: string }> {
    const changes: DriveChange[] = [];
    let pageToken = startPageToken;

    try {
      do {
        const response = await withRetry(async () => {
          return await this.drive.changes.list({
            pageToken,
            fields:
              'nextPageToken, newStartPageToken, changes(fileId, removed, file(id, name, mimeType, modifiedTime, parents, trashed))',
            pageSize: 100,
          });
        });

        const items = response.data.changes || [];

        for (const change of items) {
          if (!change.fileId) continue;

          // Check if file is removed or trashed
          if (change.removed || change.file?.trashed) {
            changes.push({
              fileId: change.fileId,
              type: 'deleted',
            });
            continue;
          }

          const file = change.file;
          if (!file || !file.name) continue;

          // Only process supported files (markdown and PDF)
          if (!this.isSupportedFile(file.name, file.mimeType)) {
            continue;
          }

          // Check if file is in the monitored folder tree
          const isInFolder = await this.isFileInFolder(file.id!, rootFolderId, file.parents || []);

          if (!isInFolder) {
            continue;
          }

          // Build file path
          const path = await this.buildFilePath(
            file.id!,
            file.name,
            rootFolderId,
            file.parents || []
          );

          changes.push({
            fileId: file.id!,
            type: 'modified',
            file: {
              id: file.id!,
              name: file.name,
              mimeType: file.mimeType || 'text/markdown',
              modifiedTime: file.modifiedTime || new Date().toISOString(),
              path,
              parents: file.parents || undefined,
            },
          });
        }

        pageToken = response.data.nextPageToken || '';

        // If we have a new start page token, we're done
        if (response.data.newStartPageToken) {
          return {
            changes,
            newStartPageToken: response.data.newStartPageToken,
          };
        }
      } while (pageToken);

      // Should not reach here, but handle gracefully
      throw new DriveError('No newStartPageToken received');
    } catch (error) {
      throw new DriveError('Failed to fetch changes', {
        startPageToken,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Download file content
   */
  async downloadFileContent(fileId: string, mimeType?: string): Promise<string> {
    try {
      // Check if file is PDF
      const isPDF = mimeType === 'application/pdf';

      if (isPDF) {
        // Download PDF as binary
        const response = await withRetry(async () => {
          return await this.drive.files.get(
            {
              fileId,
              alt: 'media',
            },
            { responseType: 'arraybuffer' }
          );
        });

        // Import PDF extractor dynamically to avoid issues in non-PDF contexts
        const { extractTextFromPDF } = await import('../utils/pdf-extractor.js');
        const text = await extractTextFromPDF(response.data as ArrayBuffer);
        return text;
      }

      // Download text file (markdown, etc.)
      const response = await withRetry(async () => {
        return await this.drive.files.get(
          {
            fileId,
            alt: 'media',
          },
          { responseType: 'text' }
        );
      });

      return response.data as unknown as string;
    } catch (error) {
      throw new DriveError('Failed to download file content', {
        fileId,
        mimeType,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Check if file is in folder tree by recursively traversing parent chain
   */
  private async isFileInFolder(
    _fileId: string,
    rootFolderId: string,
    parents: string[]
  ): Promise<boolean> {
    if (!parents || parents.length === 0) return false;

    // Check each immediate parent
    for (const parentId of parents) {
      if (await this.isAncestorFolder(parentId, rootFolderId, 0)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Recursively check if currentFolderId is the targetFolderId or has it as an ancestor
   */
  private async isAncestorFolder(
    currentFolderId: string,
    targetFolderId: string,
    depth: number
  ): Promise<boolean> {
    // Prevent infinite recursion
    if (depth >= DriveClient.MAX_RECURSION_DEPTH) {
      return false;
    }

    if (currentFolderId === targetFolderId) {
      return true;
    }

    try {
      // Get folder info from cache or API
      let folderInfo = this.folderCache.get(currentFolderId);

      if (!folderInfo) {
        const response = await withRetry(async () => {
          return await this.drive.files.get({
            fileId: currentFolderId,
            fields: 'id, name, parents',
          });
        });

        folderInfo = {
          name: response.data.name || '',
          parents: response.data.parents || undefined,
        };

        this.folderCache.set(currentFolderId, folderInfo);
      }

      // If no parents, we've reached the root without finding target
      if (!folderInfo || !folderInfo.parents || folderInfo.parents.length === 0) {
        return false;
      }

      // Recursively check each parent
      for (const parentId of folderInfo.parents) {
        if (await this.isAncestorFolder(parentId, targetFolderId, depth + 1)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      // Log error for debugging while maintaining graceful fallback
      console.error('Failed to check folder ancestry, assuming file not in tree', {
        currentFolderId,
        targetFolderId,
        depth,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Build full file path from file ID by traversing parent folders
   *
   * When a file has multiple parents, this method selects the parent that
   * leads to the rootFolderId to ensure the correct path is built.
   */
  private async buildFilePath(
    fileId: string,
    fileName: string,
    rootFolderId: string,
    parents: string[]
  ): Promise<string> {
    // Check cache first
    if (this.pathCache.has(fileId)) {
      return this.pathCache.get(fileId)!;
    }

    try {
      if (!parents || parents.length === 0) {
        // No parents, file is at root
        this.pathCache.set(fileId, fileName);
        return fileName;
      }

      // Find the parent that leads to rootFolderId
      // This handles the case where a file has multiple parents
      let currentParentId: string | undefined;
      for (const parentId of parents) {
        if (await this.isAncestorFolder(parentId, rootFolderId, 0)) {
          currentParentId = parentId;
          break;
        }
      }

      if (!currentParentId) {
        // No parent leads to root folder
        // This shouldn't happen if isFileInFolder passed, but handle gracefully
        console.warn('No parent leads to root folder, using filename only', {
          fileId,
          fileName,
          rootFolderId,
          parents,
        });
        this.pathCache.set(fileId, fileName);
        return fileName;
      }

      // Build path by traversing parent folders
      const pathParts: string[] = [fileName];

      // Traverse up to MAX_RECURSION_DEPTH levels to prevent infinite loops
      let depth = 0;

      while (currentParentId && depth < DriveClient.MAX_RECURSION_DEPTH) {
        // Stop when we reach the root folder (don't include root folder name in path)
        if (currentParentId === rootFolderId) {
          break;
        }

        // Check if parent info is cached
        let parentInfo = this.folderCache.get(currentParentId);

        if (!parentInfo) {
          // Fetch parent folder info
          const parentResponse = await withRetry(async () => {
            return await this.drive.files.get({
              fileId: currentParentId,
              fields: 'id, name, parents',
            });
          });

          parentInfo = {
            name: parentResponse.data.name || '',
            parents: parentResponse.data.parents || undefined,
          };

          // Cache parent info
          this.folderCache.set(currentParentId, parentInfo);
        }

        // Add parent folder name to path
        if (parentInfo && parentInfo.name) {
          pathParts.unshift(parentInfo.name);
        }

        // Move to next parent
        if (parentInfo && parentInfo.parents && parentInfo.parents.length > 0) {
          currentParentId = parentInfo.parents[0];
        } else {
          break;
        }

        depth++;
      }

      // Build final path
      const fullPath = pathParts.join('/');
      this.pathCache.set(fileId, fullPath);

      return fullPath;
    } catch (error) {
      // Log error for debugging while maintaining graceful fallback
      console.error('Failed to build file path, falling back to filename', {
        fileId,
        fileName,
        error: error instanceof Error ? error.message : String(error),
      });
      return fileName;
    }
  }
}
