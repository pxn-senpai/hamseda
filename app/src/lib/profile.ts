// The user's own profile: bio and picture, kept in this app only.
// TeamSpeak has no bio field, and the picture is not uploaded to the server yet.

export interface Profile {
  bio: string;
  picture?: string; // small square image as a data URL
}

const KEY = 'hamseda.profile';

export function loadProfile(): Profile {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { bio: typeof parsed.bio === 'string' ? parsed.bio : '', picture: parsed.picture };
  } catch {
    return { bio: '' };
  }
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* storage full or blocked: the change lasts until the app closes */
  }
}

/** Reads a picture file and returns a 128px square data URL. */
export function readPicture(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('no canvas'));
        return;
      }
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('bad image'));
    };
    img.src = url;
  });
}
