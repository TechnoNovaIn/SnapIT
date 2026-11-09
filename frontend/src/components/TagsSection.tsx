import React, { useState } from 'react';
import { Tag, Plus, X } from 'lucide-react';

interface TagsSectionProps {
  tags: string[];
  onUpdateTags: (tags: string[]) => void;
}

const PRESET_CATEGORIES = [
  'Travel',
  'Medical',
  'Fuel',
  'Office Supplies',
  'Purchase',
  'Utility Bill',
  'Food & Dining',
  'Other',
];

export const TagsSection: React.FC<TagsSectionProps> = ({ tags, onUpdateTags }) => {
  const [newTagInput, setNewTagInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddTag = (tagName: string) => {
    const trimmed = tagName.trim();
    if (!trimmed) return;
    if (!tags.includes(trimmed)) {
      onUpdateTags([...tags, trimmed]);
    }
    setNewTagInput('');
    setIsAdding(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateTags(tags.filter((t) => t !== tagToRemove));
  };

  return (
    <div className="tags-card">
      <div className="tags-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Tag size={18} color="#059669" />
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>All Tags</h4>
        </div>

        {!isAdding ? (
          <button
            className="btn-secondary"
            style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }}
            onClick={() => setIsAdding(true)}
          >
            <Plus size={14} />
            <span>Add Tag</span>
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              type="text"
              placeholder="Tag name..."
              value={newTagInput}
              autoFocus
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTag(newTagInput);
                if (e.key === 'Escape') setIsAdding(false);
              }}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.825rem',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                outline: 'none',
              }}
            />
            <button
              className="btn-primary"
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
              onClick={() => handleAddTag(newTagInput)}
            >
              Add
            </button>
            <button
              className="icon-btn"
              onClick={() => setIsAdding(false)}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="tags-list">
        {tags && tags.length > 0 ? (
          tags.map((t) => (
            <span key={t} className="tag-pill">
              #{t}
              <X size={13} className="remove-tag" onClick={() => handleRemoveTag(t)} />
            </span>
          ))
        ) : (
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            No tags attached yet. Add custom tags or click presets below.
          </span>
        )}
      </div>

      <div className="preset-tags">
        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Quick Presets:</span>
        {PRESET_CATEGORIES.map((cat) => {
          const isSelected = tags?.includes(cat);
          if (isSelected) return null;
          return (
            <button
              key={cat}
              className="preset-pill"
              onClick={() => handleAddTag(cat)}
            >
              + {cat}
            </button>
          );
        })}
      </div>
    </div>
  );
};
