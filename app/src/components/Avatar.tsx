import { avatarColor, initial } from '../lib/util';

interface Props {
  name: string;
  size?: number;
  talking?: boolean;
  dim?: boolean;
}

/** Round letter avatar. TeamSpeak avatars can come later; for now the first letter is enough. */
export function Avatar({ name, size = 32, talking, dim }: Props) {
  return (
    <span
      className={`avatar${talking ? ' talking' : ''}${dim ? ' dim' : ''}`}
      style={{ width: size, height: size, background: avatarColor(name), fontSize: size * 0.45 }}
      aria-hidden="true"
    >
      {initial(name)}
    </span>
  );
}
