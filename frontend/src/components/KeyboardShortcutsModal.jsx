import React, { useEffect } from 'react';

export default function KeyboardShortcutsModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcuts = [
    { key: '1', description: 'Switch to PR Matrix View' },
    { key: '2', description: 'Switch to Collision Matrix View' },
    { key: '3', description: 'Switch to PR Workspaces View' },
    { key: '4', description: 'Switch to Release Builder View' },
    { key: 'Ctrl + B', description: 'Toggle Left Sidebar Collapse' },
    { key: '?', description: 'Open Keyboard Shortcuts Helper' },
    { key: 'Esc', description: 'Close active drawer / modal' },
  ];

  return (
    <div className="drawer-backdrop modal-backdrop-center" onClick={onClose}>
      <div className="drawer-content modal-shortcuts" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>⌨️ Keyboard Shortcuts</h2>
            <p className="subtitle">Speed up your PR review and triage workflow</p>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="drawer-body">
          <div className="shortcuts-grid">
            {shortcuts.map((s, i) => (
              <div key={i} className="shortcut-row">
                <kbd className="shortcut-key">{s.key}</kbd>
                <span className="shortcut-desc">{s.description}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Close (Esc)</button>
        </div>
      </div>
    </div>
  );
}
