import { useEffect, useRef, useState } from 'react';

/**
 * Subscribe to the backend's server-sent event stream.
 *
 * The app had no live channel at all — no polling, websocket, or SSE — so data
 * was stale until someone clicked "Sync PRs Now". This delivers PR updates,
 * webhook deliveries, and AI job progress as they happen.
 *
 * `handlers` is read through a ref so callers can pass inline functions without
 * tearing down and rebuilding the connection on every render.
 */
export function useEventStream(handlers = {}, { enabled = true } = {}) {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return undefined;

    let source;
    let retryTimer;
    let retryDelay = 1000;
    let closed = false;

    const listeners = [];

    function connect() {
      source = new EventSource('/api/events');

      source.onopen = () => {
        setConnected(true);
        retryDelay = 1000; // reset backoff after a successful connect
      };

      source.onerror = () => {
        setConnected(false);
        if (closed) return;
        // EventSource retries on its own, but not after the server closes the
        // stream deliberately; reconnect with capped exponential backoff.
        source.close();
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      };

      ['connected', 'prs_updated', 'sync_failed', 'webhook', 'job_update'].forEach(name => {
        const listener = (event) => {
          let payload = {};
          try {
            payload = JSON.parse(event.data || '{}');
          } catch {
            /* keep-alive comments and malformed frames are ignored */
          }
          handlersRef.current[name]?.(payload);
        };
        source.addEventListener(name, listener);
        listeners.push([name, listener]);
      });
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(retryTimer);
      listeners.forEach(([name, listener]) => source?.removeEventListener(name, listener));
      source?.close();
      setConnected(false);
    };
  }, [enabled]);

  return { connected };
}
