export type EmojiCategoryId = "recent" | "faces" | "gestures" | "objects" | "nature" | "symbols";

export type EmojiDefinition = {
  emoji: string;
  label: string;
  keywords: string[];
  category: Exclude<EmojiCategoryId, "recent">;
};

export const EMOJI_CATEGORY_LABELS: Record<EmojiCategoryId, string> = {
  recent: "Recent",
  faces: "Faces",
  gestures: "Gestures",
  objects: "Objects",
  nature: "Nature",
  symbols: "Symbols",
};

export const EMOJI_DEFINITIONS: EmojiDefinition[] = [
  { emoji: "😀", label: "Grinning face", keywords: ["happy", "smile", "joy"], category: "faces" },
  { emoji: "😁", label: "Beaming face", keywords: ["grin", "happy", "excited"], category: "faces" },
  { emoji: "😂", label: "Face with tears of joy", keywords: ["funny", "laugh", "lol"], category: "faces" },
  { emoji: "🤣", label: "Rolling on the floor laughing", keywords: ["laugh", "funny", "haha"], category: "faces" },
  { emoji: "😊", label: "Smiling face with smiling eyes", keywords: ["smile", "warm", "kind"], category: "faces" },
  { emoji: "😍", label: "Smiling face with heart eyes", keywords: ["love", "adore", "like"], category: "faces" },
  { emoji: "😘", label: "Face blowing a kiss", keywords: ["kiss", "love", "thanks"], category: "faces" },
  { emoji: "🤔", label: "Thinking face", keywords: ["think", "hmm", "question"], category: "faces" },
  { emoji: "😴", label: "Sleeping face", keywords: ["sleep", "tired", "zzz"], category: "faces" },
  { emoji: "🤯", label: "Exploding head", keywords: ["mind blown", "shock", "wow"], category: "faces" },
  { emoji: "😎", label: "Smiling face with sunglasses", keywords: ["cool", "nice", "confident"], category: "faces" },
  { emoji: "😭", label: "Loudly crying face", keywords: ["sad", "cry", "tears"], category: "faces" },
  { emoji: "😡", label: "Pouting face", keywords: ["angry", "mad", "rage"], category: "faces" },
  { emoji: "🥳", label: "Partying face", keywords: ["party", "celebrate", "birthday"], category: "faces" },
  { emoji: "🤝", label: "Handshake", keywords: ["deal", "agreement", "partner"], category: "gestures" },
  { emoji: "👍", label: "Thumbs up", keywords: ["yes", "approve", "good"], category: "gestures" },
  { emoji: "👎", label: "Thumbs down", keywords: ["no", "reject", "bad"], category: "gestures" },
  { emoji: "👏", label: "Clapping hands", keywords: ["applause", "great", "well done"], category: "gestures" },
  { emoji: "🙏", label: "Folded hands", keywords: ["thanks", "please", "pray"], category: "gestures" },
  { emoji: "🙌", label: "Raising hands", keywords: ["celebrate", "hooray", "praise"], category: "gestures" },
  { emoji: "👀", label: "Eyes", keywords: ["look", "watch", "see"], category: "gestures" },
  { emoji: "🔥", label: "Fire", keywords: ["lit", "hot", "awesome"], category: "objects" },
  { emoji: "💡", label: "Light bulb", keywords: ["idea", "brainstorm", "think"], category: "objects" },
  { emoji: "📌", label: "Pushpin", keywords: ["pin", "note", "important"], category: "objects" },
  { emoji: "📣", label: "Megaphone", keywords: ["announce", "broadcast", "news"], category: "objects" },
  { emoji: "💬", label: "Speech balloon", keywords: ["chat", "message", "talk"], category: "objects" },
  { emoji: "📎", label: "Paperclip", keywords: ["attach", "file", "document"], category: "objects" },
  { emoji: "✅", label: "Check mark", keywords: ["done", "complete", "yes"], category: "symbols" },
  { emoji: "❌", label: "Cross mark", keywords: ["no", "wrong", "cancel"], category: "symbols" },
  { emoji: "⚠️", label: "Warning", keywords: ["alert", "careful", "risk"], category: "symbols" },
  { emoji: "⭐", label: "Star", keywords: ["favorite", "highlight", "important"], category: "symbols" },
  { emoji: "❤️", label: "Red heart", keywords: ["love", "heart", "care"], category: "symbols" },
  { emoji: "💯", label: "Hundred points", keywords: ["perfect", "great", "keep it up"], category: "symbols" },
  { emoji: "🚀", label: "Rocket", keywords: ["launch", "ship", "fast"], category: "objects" },
  { emoji: "🎉", label: "Party popper", keywords: ["celebration", "party", "congrats"], category: "objects" },
  { emoji: "🎯", label: "Direct hit", keywords: ["target", "goal", "focus"], category: "objects" },
  { emoji: "📈", label: "Chart increasing", keywords: ["growth", "metrics", "up"], category: "objects" },
  { emoji: "🌱", label: "Seedling", keywords: ["grow", "new", "fresh"], category: "nature" },
  { emoji: "🌍", label: "Globe showing Europe-Africa", keywords: ["world", "global", "earth"], category: "nature" },
  { emoji: "☀️", label: "Sun", keywords: ["day", "bright", "warm"], category: "nature" },
  { emoji: "🌙", label: "Crescent moon", keywords: ["night", "moon", "late"], category: "nature" },
  { emoji: "⚡", label: "High voltage", keywords: ["energy", "fast", "power"], category: "symbols" },
];

const RECENT_EMOJIS_STORAGE_KEY = "agentic-chat.recent-emojis";
const MAX_RECENT_EMOJIS = 18;

export function appendEmoji(currentValue: string, emoji: string) {
  return `${currentValue}${emoji}`;
}

export function loadRecentEmojis() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(RECENT_EMOJIS_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

export function rememberRecentEmoji(emoji: string) {
  if (typeof window === "undefined") {
    return;
  }

  const nextRecentEmojis = [
    emoji,
    ...loadRecentEmojis().filter((currentEmoji) => currentEmoji !== emoji),
  ].slice(0, MAX_RECENT_EMOJIS);

  window.localStorage.setItem(RECENT_EMOJIS_STORAGE_KEY, JSON.stringify(nextRecentEmojis));
}
