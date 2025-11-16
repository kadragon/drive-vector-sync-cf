/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-031
 */

import { STATIC_ASSETS } from './assets.js';
import type { EmbeddedAsset } from './types.js';

const decodedBodyCache = new Map<string, Uint8Array>();

/** Normalize incoming path to a static asset key if available. */
export function resolveAssetPath(pathname: string): string | null {
  if (!pathname) {
    return null;
  }

  if (pathname === '/' || pathname === '/index.html') {
    return '/';
  }

  if (STATIC_ASSETS[pathname]) {
    return pathname;
  }

  return null;
}

/** Create HTTP response for a static asset (supports conditional requests). */
export function serveStaticAsset(request: Request, assetPath: string): Response {
  const asset = STATIC_ASSETS[assetPath];
  if (!asset) {
    return new Response('Not found', { status: 404 });
  }

  const etagMatches = headerContainsTag(request.headers.get('If-None-Match'), asset.etag);
  const headers = buildHeaders(asset);

  if (etagMatches) {
    return new Response(null, { status: 304, headers });
  }

  const body = request.method === 'HEAD' ? null : decodeAssetBody(assetPath, asset);

  return new Response(body, {
    status: 200,
    headers,
  });
}

function headerContainsTag(headerValue: string | null, tag: string): boolean {
  if (!headerValue) {
    return false;
  }

  return headerValue
    .split(',')
    .map(value => value.trim())
    .includes(tag);
}

function buildHeaders(asset: EmbeddedAsset): Headers {
  return new Headers({
    'Content-Type': asset.contentType,
    'Cache-Control': asset.cacheControl,
    ETag: asset.etag,
  });
}

function decodeAssetBody(assetPath: string, asset: EmbeddedAsset): Uint8Array {
  const cached = decodedBodyCache.get(assetPath);
  if (cached) {
    return cached;
  }

  const decoded = decodeBase64(asset.base64);
  decodedBodyCache.set(assetPath, decoded);
  return decoded;
}

function decodeBase64(base64: string): Uint8Array {
  const globalBuffer = (globalThis as { Buffer?: typeof Buffer }).Buffer;
  if (globalBuffer) {
    return new Uint8Array(globalBuffer.from(base64, 'base64'));
  }

  const globalAtob = (globalThis as { atob?: (data: string) => string }).atob;
  if (typeof globalAtob === 'function') {
    const binaryString = globalAtob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  throw new Error('Base64 decoding not supported in this environment');
}
