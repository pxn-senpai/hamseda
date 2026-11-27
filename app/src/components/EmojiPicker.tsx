import { useEffect, useRef } from 'react';

const EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤩',
  '🤔', '😐', '😴', '😅', '😭', '😤', '😡', '🥳', '🤯', '😱',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '👋', '✌️', '🫡',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '✨', '🔥',
  '🎉', '🎮', '🎧', '🎤', '🎵', '🎶', '🏆', '⚔️', '🛡️', '🎯',
  '☕', '🍕', '🍉', '🌙', '⭐', '🌈', '☀️', '🌧️', '❄️', '🌸',
  '✅', '❌', '⚠️', '💯', '🆗', '🤖', '👀', '🙈', '😺', '🐱',
];

interface Props {
  onPick: (emoji: string) => void;
  onClose: () => void;
}

/** A small grid of common emoji. Nothing is downloaded, so it works offline. */
export function EmojiPicker({ onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="emoji-pop" ref={ref} role="dialog" aria-label="Emoji">
      <div className="emoji-grid">
        {EMOJIS.map((e) => (
          <button key={e} type="button" className="emoji-btn" onClick={() => onPick(e)}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
