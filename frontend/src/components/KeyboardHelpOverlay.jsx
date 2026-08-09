import React from 'react';
import Modal from './Modal';

const SHORTCUTS = [
  { keys: ['1'], label: 'Go to PR Matrix' },
  { keys: ['2'], label: 'Go to Collision Matrix' },
  { keys: ['3'], label: 'Go to PR Workspaces' },
  { keys: ['4'], label: 'Go to Release Builder' },
  { keys: ['Ctrl', 'B'], label: 'Toggle sidebar' },
  { keys: ['Ctrl', 'K'], label: 'Focus search' },
  { keys: ['/'], label: 'Focus search' },
  { keys: ['j'], label: 'Next PR row (matrix)' },
  { keys: ['k'], label: 'Previous PR row (matrix)' },
  { keys: ['Enter'], label: 'Open focused PR (matrix)' },
  { keys: ['x'], label: 'Toggle selection on focused row' },
  { keys: ['Esc'], label: 'Close drawer or modal' },
  { keys: ['?'], label: 'Show this help' },
];

export default function KeyboardHelpOverlay({ isOpen, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} titleId="kbd-help-title" className="keyboard-help-modal">
      <div className="modal-header">
        <h3 id="kbd-help-title">⌨️ Keyboard Shortcuts</h3>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">&times;</button>
      </div>
      <div className="modal-body">
        <ul className="shortcut-list">
          {SHORTCUTS.map(s => (
            <li key={s.label + s.keys.join('')}>
              <span className="shortcut-keys">
                {s.keys.map(k => <kbd key={k}>{k}</kbd>)}
              </span>
              <span className="shortcut-label">{s.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
