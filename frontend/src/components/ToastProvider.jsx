import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * Minimal toast + confirm layer.
 *
 * The app previously swallowed roughly two dozen failures into
 * `catch (err) { console.error(err) }`, so a failed sync, tag toggle, or
 * workspace save looked identical to success. Success feedback, where it
 * existed at all, was a native `alert()`.
 */
const ToastContext = createContext(null);

let nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback((message, tone = 'info', options = {}) => {
    const id = ++nextId;
    const duration = options.duration ?? (tone === 'error' ? 8000 : 4000);
    setToasts(prev => [...prev, { id, message, tone }]);
    // Errors stay long enough to read; nothing auto-dismisses if duration is 0.
    if (duration > 0) {
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
    }
    return id;
  }, [dismiss]);

  const api = useMemo(() => ({
    toast: push,
    success: (msg, opts) => push(msg, 'success', opts),
    error: (msg, opts) => push(msg, 'error', opts),
    info: (msg, opts) => push(msg, 'info', opts),

    /**
     * Promise-based confirm for destructive actions. Deleting a workspace,
     * changelog, or repository previously fired immediately with no
     * confirmation and no undo.
     */
    confirm: ({ title, message, confirmLabel = 'Delete', tone = 'danger' }) =>
      new Promise(resolve => {
        setConfirmState({ title, message, confirmLabel, tone, resolve });
      }),

    /**
     * Wrap an async action: surfaces the server's error message on failure
     * instead of dropping it into the console.
     */
    run: async (fn, { success, failure = 'Something went wrong' } = {}) => {
      try {
        const result = await fn();
        if (success) push(success, 'success');
        return result;
      } catch (err) {
        console.error(err);
        push(err?.message ? `${failure}: ${err.message}` : failure, 'error');
        return undefined;
      }
    },
  }), [push]);

  function resolveConfirm(value) {
    confirmState?.resolve(value);
    setConfirmState(null);
  }

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div className="toast-region" role="region" aria-label="Notifications">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast toast-${t.tone}`}
            role={t.tone === 'error' ? 'alert' : 'status'}
          >
            <span className="toast-msg">{t.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {confirmState && (
        <div className="modal-overlay" onClick={() => resolveConfirm(false)}>
          <div
            className="modal-container confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="confirm-title">{confirmState.title}</h3>
            </div>
            <div className="modal-body">
              <p>{confirmState.message}</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => resolveConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${confirmState.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => resolveConfirm(true)}
                autoFocus
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Keeps components usable in isolation (e.g. unit tests) without a provider.
    return {
      toast: () => {}, success: () => {}, error: () => {}, info: () => {},
      confirm: async () => true,
      run: async (fn) => fn(),
    };
  }
  return ctx;
}
