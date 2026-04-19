import { useEffect, useMemo, useState } from "react";

import {
  type EmojiCategoryId,
  type EmojiDefinition,
  EMOJI_CATEGORY_LABELS,
  EMOJI_DEFINITIONS,
  loadRecentEmojis,
  rememberRecentEmoji,
} from "./emoji";

type EmojiPickerProps = {
  disabled?: boolean;
  onSelect: (emoji: string) => void;
};

function matchesQuery(emoji: EmojiDefinition, normalizedQuery: string) {
  if (!normalizedQuery) {
    return true;
  }

  return [emoji.label, ...emoji.keywords, emoji.emoji].some((value) =>
    value.toLowerCase().includes(normalizedQuery),
  );
}

export function EmojiPicker({ disabled = false, onSelect }: EmojiPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<EmojiCategoryId>("faces");
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);

  useEffect(() => {
    setRecentEmojis(loadRecentEmojis());
  }, []);

  const recentEmojiDefinitions = useMemo(
    () =>
      recentEmojis
        .map((recentEmoji) =>
          EMOJI_DEFINITIONS.find((emojiDefinition) => emojiDefinition.emoji === recentEmoji),
        )
        .filter((emojiDefinition): emojiDefinition is EmojiDefinition => emojiDefinition !== undefined),
    [recentEmojis],
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleEmojis = useMemo(() => {
    const sourceEmojis = normalizedQuery
      ? EMOJI_DEFINITIONS
      : activeCategory === "recent"
        ? recentEmojiDefinitions
        : EMOJI_DEFINITIONS.filter((emojiDefinition) => emojiDefinition.category === activeCategory);

    return sourceEmojis.filter((emojiDefinition) => matchesQuery(emojiDefinition, normalizedQuery));
  }, [activeCategory, normalizedQuery, recentEmojiDefinitions]);

  function handleSelect(emoji: string) {
    rememberRecentEmoji(emoji);
    setRecentEmojis(loadRecentEmojis());
    onSelect(emoji);
  }

  return (
    <div className="emoji-picker" role="dialog" aria-label="Emoji picker">
      <input
        className="emoji-picker-search"
        type="search"
        placeholder="Search emoji"
        value={searchQuery}
        disabled={disabled}
        onChange={(event) => setSearchQuery(event.target.value)}
      />
      <div className="emoji-picker-tabs" role="tablist" aria-label="Emoji categories">
        {(Object.keys(EMOJI_CATEGORY_LABELS) as EmojiCategoryId[]).map((categoryId) => (
          <button
            key={categoryId}
            className={
              activeCategory === categoryId ? "emoji-picker-tab is-active" : "emoji-picker-tab"
            }
            type="button"
            role="tab"
            aria-selected={activeCategory === categoryId}
            disabled={disabled}
            onClick={() => setActiveCategory(categoryId)}
          >
            {EMOJI_CATEGORY_LABELS[categoryId]}
          </button>
        ))}
      </div>
      {visibleEmojis.length === 0 ? (
        <p className="emoji-picker-empty">No emoji matched that search.</p>
      ) : (
        <div className="emoji-picker-grid">
          {visibleEmojis.map((emojiDefinition) => (
            <button
              key={`${emojiDefinition.category}-${emojiDefinition.emoji}`}
              className="emoji-picker-button"
              type="button"
              title={emojiDefinition.label}
              aria-label={emojiDefinition.label}
              disabled={disabled}
              onClick={() => handleSelect(emojiDefinition.emoji)}
            >
              {emojiDefinition.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
