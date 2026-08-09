import { useCallback, useEffect, useState } from 'react';

/**
 * Read/write a slice of app state in the URL query string.
 *
 * The app had no router and never touched `history`, so the active tab, repo,
 * every matrix filter, the open PR, and the active workspace were lost on
 * refresh and impossible to share. Browser Back exited the app instead of
 * closing a drawer.
 *
 * Deliberately query-string only — no router dependency, and it degrades to
 * plain state if the History API is unavailable.
 */
export function readParams() {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const out = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

export function writeParams(updates, { replace = false } = {}) {
  if (typeof window === 'undefined' || !window.history?.pushState) return;

  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    // Empty/null values drop the key entirely so shared URLs stay readable.
    if (value === null || value === undefined || value === '' || value === false) {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  }

  const qs = params.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  if (replace) {
    window.history.replaceState({}, '', url);
  } else {
    window.history.pushState({}, '', url);
  }
}

/**
 * A single URL-backed value. `push: true` creates a history entry so Back
 * undoes the change (used for the PR drawer, so Back closes it).
 */
export function useUrlParam(key, defaultValue = '', { push = false } = {}) {
  const [value, setValue] = useState(() => readParams()[key] ?? defaultValue);

  // Keep state in sync when the user navigates with Back/Forward.
  useEffect(() => {
    function onPop() {
      setValue(readParams()[key] ?? defaultValue);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [key, defaultValue]);

  const update = useCallback((next) => {
    setValue(next);
    writeParams({ [key]: next }, { replace: !push });
  }, [key, push]);

  return [value, update];
}
