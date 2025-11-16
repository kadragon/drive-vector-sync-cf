/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-031
 */

export interface EmbeddedAsset {
  /** Base64-encoded body contents */
  base64: string;
  /** HTTP content-type header value */
  contentType: string;
  /** Strong ETag for conditional requests */
  etag: string;
  /** Cache-Control header value */
  cacheControl: string;
}

export type AssetMap = Record<string, EmbeddedAsset>;
