import { avatarColor, initial } from '../lib/util';

interface Props {
  name: string;
  size?: number;
  talking?: boolean;
  dim?: boolean;
  /** Profile picture (data: URL). The letter is shown when there is none. */
  src?: string;
}

/** Round letter avatar. TeamSpeak avatars can come later; for now the first letter is enough. */
export function Avatar({ name, size = 32, talking, dim, src }: Props) {
  if (src) {
    return (
      <img
        className={`avatar photo${talking ? ' talking' : ''}${dim ? ' dim' : ''}`}
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        draggable={false}
      />
    );
  }
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
