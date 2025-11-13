/**
 * Google Drive API client with OAuth2 authentication
 *
 * Trace:
 *   spec_id: SPEC-drive-integration-1
 *   task_id: TASK-001, TASK-002, TASK-003
 */

import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { DriveError } from '../errors/index.js';
import { withRetry } from '../errors/index.js';

export interface DriveCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
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
 * Google Drive client with OAuth2 authentication
 */
export class DriveClient {
  private drive: drive_v3.Drive;
  private auth: OAuth2Client;

  constructor(credentials: DriveCredentials) {
    this.auth = new google.auth.OAuth2(credentials.clientId, credentials.clientSecret);

    this.auth.setCredentials({
      refresh_token: credentials.refreshToken,
    });

    this.drive = google.drive({ version: 'v3', auth: this.auth });
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
   * Recursively list all markdown files in a folder
   */
  async listMarkdownFiles(rootFolderId: string): Promise<DriveFileMetadata[]> {
    const files: DriveFileMetadata[] = [];
    const folderPathMap = new Map<string, string>();
    folderPathMap.set(rootFolderId, '');

    try {
      await this.scanFolder(rootFolderId, files, folderPathMap);
      return files;
    } catch (error) {
      throw new DriveError('Failed to list markdown files', {
        rootFolderId,
        error: (error as Error).message,
      });
    }
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
        } else if (item.name.endsWith('.md') || item.mimeType === 'text/markdown') {
          // Add markdown file
          files.push({
            id: item.id,
            name: item.name,
            mimeType: item.mimeType || 'text/markdown',
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

          // Only process markdown files
          if (!file.name.endsWith('.md') && file.mimeType !== 'text/markdown') {
            continue;
          }

          // Check if file is in the monitored folder tree
          const isInFolder = await this.isFileInFolder(file.id!, rootFolderId, file.parents || []);

          if (!isInFolder) {
            continue;
          }

          // Build file path
          const path = await this.buildFilePath(file.id!, file.name);

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
  async downloadFileContent(fileId: string): Promise<string> {
    try {
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
        error: (error as Error).message,
      });
    }
  }

  /**
   * Check if file is in folder tree
   */
  private async isFileInFolder(
    _fileId: string,
    rootFolderId: string,
    parents: string[]
  ): Promise<boolean> {
    if (!parents || parents.length === 0) return false;

    // Simple check: if any parent matches root folder, consider it in tree
    // For a more thorough check, we'd need to traverse the folder hierarchy
    for (const parentId of parents) {
      if (parentId === rootFolderId) return true;

      // TODO: Add recursive parent check if needed
    }

    return false;
  }

  /**
   * Build full file path from file ID
   */
  private async buildFilePath(_fileId: string, fileName: string): Promise<string> {
    // For now, just return the file name
    // TODO: Build full path by traversing parents via Drive API
    return fileName;
  }
}
