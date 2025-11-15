/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

class ResizeObserverMock {
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    const width = (target as HTMLElement)?.clientWidth || 1024;
    const height = (target as HTMLElement)?.clientHeight || 320;

    const entry: ResizeObserverEntry = {
      target,
      contentRect: {
        x: 0,
        y: 0,
        width,
        height,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
      },
      borderBoxSize: [],
      contentBoxSize: [],
      devicePixelContentBoxSize: [],
    } as ResizeObserverEntry;

    this.callback([entry], this);
  }

  unobserve() {}
  disconnect() {}
}

if (!('ResizeObserver' in window)) {
  // @ts-expect-error - assigning mock to window
  window.ResizeObserver = ResizeObserverMock;
}

if (!('IntersectionObserver' in window)) {
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

if (typeof window.localStorage?.getItem !== 'function') {
  const storage = (() => {
    let store = new Map<string, string>();
    return {
      getItem(key: string) {
        return store.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
      removeItem(key: string) {
        store.delete(key);
      },
      clear() {
        store = new Map();
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null;
      },
      get length() {
        return store.size;
      },
    } satisfies Storage;
  })();

  Object.defineProperty(window, 'localStorage', {
    value: storage,
  });
}

if (typeof globalThis.localStorage === 'undefined') {
  // @ts-expect-error - align globals for tests
  globalThis.localStorage = window.localStorage;
}
