import React, { useState, useEffect } from 'react';
import { addPRTag, removePRTag } from '../api/client';

const PREDEFINED_TAGS = [
  '⭐ Starred',
  '🚀 Must Review',
  '🧪 Needs QA',
  '⏳ Waiting on Author',
  '🚫 Blocked'
];

export default function PRTagBar({ prNumber, repoName, activeTags = [], onTagsUpdated }) {
  const [tags, setTags] = useState(activeTags);
  const [customTagInput, setCustomTagInput] = useState('');
  const [showInput, setShowInput] = useState(false);

  useEffect(() => {
    setTags(activeTags);
  }, [activeTags]);

  async function handleToggleTag(tagStr) {
    const exists = tags.includes(tagStr);
    try {
      if (exists) {
        const res = await removePRTag(prNumber, tagStr, repoName);
        setTags(res.tags || []);
      } else {
        const res = await addPRTag(prNumber, tagStr, repoName);
        setTags(res.tags || []);
      }
      if (onTagsUpdated) onTagsUpdated();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleAddCustomTag(e) {
    e.preventDefault();
    if (!customTagInput.trim()) return;
    const tagVal = customTagInput.trim();
    setCustomTagInput('');
    setShowInput(false);
    
    try {
      const res = await addPRTag(prNumber, tagVal, repoName);
      setTags(res.tags || []);
      if (onTagsUpdated) onTagsUpdated();
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="pr-tag-bar">
      <span className="tag-bar-label">Tags & Flags:</span>
      
      <div className="tags-chips-group">
        {/* Predefined Quick Tags */}
        {PREDEFINED_TAGS.map(ptag => {
          const isSelected = tags.includes(ptag);
          return (
            <button
              key={ptag}
              onClick={() => handleToggleTag(ptag)}
              className={`tag-chip quick-chip ${isSelected ? 'selected' : ''}`}
            >
              {ptag}
            </button>
          );
        })}

        {/* Custom Tags */}
        {tags
          .filter(t => !PREDEFINED_TAGS.includes(t))
          .map(ctag => (
            <span key={ctag} className="tag-chip custom-chip selected">
              {ctag}
              <button onClick={() => handleToggleTag(ctag)} className="remove-tag-btn">&times;</button>
            </span>
          ))}

        {/* Custom Tag Input Toggle */}
        {showInput ? (
          <form onSubmit={handleAddCustomTag} className="inline-tag-form">
            <input
              type="text"
              placeholder="Tag name..."
              value={customTagInput}
              onChange={e => setCustomTagInput(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn-tag-add">Add</button>
            <button type="button" onClick={() => setShowInput(false)} className="btn-tag-cancel">&times;</button>
          </form>
        ) : (
          <button onClick={() => setShowInput(true)} className="btn-add-custom-tag">+ Add Custom Tag</button>
        )}
      </div>
    </div>
  );
}
