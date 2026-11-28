import { createContext, useContext } from 'react';
import { Avatar } from './Avatar';

/** Avatar pictures of the active server's people, by client id (data URLs). */
const AvatarPicturesContext = createContext<Record<number, string>>({});
export const AvatarPicturesProvider = AvatarPicturesContext.Provider;

interface Props {
  clientId: number;
  name: string;
  size?: number;
  talking?: boolean;
  dim?: boolean;
}

/** An avatar that shows the person's TeamSpeak picture when the server has one. */
export function ClientAvatar({ clientId, name, size, talking, dim }: Props) {
  const pictures = useContext(AvatarPicturesContext);
  return <Avatar name={name} size={size} talking={talking} dim={dim} picture={pictures[clientId]} />;
}
