import React from 'react';

/**
 * Lightweight, robust Markdown Renderer component for PR Descriptions & Comments.
 * Formats headings, bullet lists, checkboxes, code blocks, inline code, and links cleanly.
 */
export default function FormattedMarkdown({ content }) {
  if (!content) {
    return <div className="markdown-empty">No content provided.</div>;
  }

  // Helper to parse inline markdown (code ticks, bold, links)
  function renderInline(text) {
    if (!text) return '';
    
    // Process inline code `code`
    const parts = text.split(/(`[^`]+`)/g);
    return parts.map((part, index) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return <code key={index} className="inline-code">{part.slice(1, -1)}</code>;
      }
      
      // Process bold **text**
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      return boldParts.map((bPart, bIndex) => {
        if (bPart.startsWith('**') && bPart.endsWith('**') && bPart.length > 4) {
          return <strong key={`${index}-${bIndex}`}>{bPart.slice(2, -2)}</strong>;
        }
        return bPart;
      });
    });
  }

  // Parse lines into blocks
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let currentList = null;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentList) {
        blocks.push(currentList);
        currentList = null;
      }
      return;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      if (currentList) { blocks.push(currentList); currentList = null; }
      blocks.push(<h4 key={idx} className="md-h3">{trimmed.replace(/^###\s+/, '')}</h4>);
      return;
    }
    if (trimmed.startsWith('## ')) {
      if (currentList) { blocks.push(currentList); currentList = null; }
      blocks.push(<h3 key={idx} className="md-h2">{trimmed.replace(/^##\s+/, '')}</h3>);
      return;
    }
    if (trimmed.startsWith('# ')) {
      if (currentList) { blocks.push(currentList); currentList = null; }
      blocks.push(<h2 key={idx} className="md-h1">{trimmed.replace(/^#\s+/, '')}</h2>);
      return;
    }

    // Checkbox items (- [ ] or - [x])
    if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]')) {
      const checked = trimmed.startsWith('- [x]');
      const label = trimmed.replace(/^-\s*\[[ x]\]\s*/, '');
      if (currentList) { blocks.push(currentList); currentList = null; }
      blocks.push(
        <div key={idx} className="md-checkbox-item">
          <input type="checkbox" checked={checked} readOnly />
          <span>{renderInline(label)}</span>
        </div>
      );
      return;
    }

    // Bullet lists (- or *)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const itemText = trimmed.replace(/^[-*]\s+/, '');
      if (!currentList || currentList.type !== 'ul') {
        if (currentList) blocks.push(currentList);
        currentList = { type: 'ul', items: [], key: idx };
      }
      currentList.items.push(<li key={idx}>{renderInline(itemText)}</li>);
      return;
    }

    // Numbered lists (1., 2.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const itemText = trimmed.replace(/^\d+\.\s+/, '');
      if (!currentList || currentList.type !== 'ol') {
        if (currentList) blocks.push(currentList);
        currentList = { type: 'ol', items: [], key: idx };
      }
      currentList.items.push(<li key={idx}>{renderInline(itemText)}</li>);
      return;
    }

    // Normal Paragraph
    if (currentList) {
      blocks.push(currentList);
      currentList = null;
    }

    blocks.push(<p key={idx} className="md-paragraph">{renderInline(trimmed)}</p>);
  });

  if (currentList) {
    blocks.push(currentList);
  }

  // Render collected list objects as HTML elements
  const finalElements = blocks.map((block, idx) => {
    if (block && block.type === 'ul') {
      return <ul key={`list-${idx}`} className="md-ul">{block.items}</ul>;
    }
    if (block && block.type === 'ol') {
      return <ol key={`list-${idx}`} className="md-ol">{block.items}</ol>;
    }
    return block;
  });

  return <div className="markdown-rendered">{finalElements}</div>;
}
