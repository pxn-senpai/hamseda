// What changed in each release, shown once to users after they update.
// Add an entry for every new version before publishing it.
export const CHANGELOG: Record<string, { fa: string[]; en: string[] }> = {
  '0.2.7': {
    fa: [
      'دکمه‌ی خروج از ویس، فقط از کانال ویس فعلی خارج می‌کند',
      'صفحه‌ی سرورها با کارت‌های مربعی، منوی ویرایش و حذف سرور',
      'پنل کاربری کامل با وضعیت و حالت ورودی صدا',
    ],
    en: [
      'Leave voice button leaves only the current voice channel',
      'Servers page with square cards, and edit and remove options',
      'Full profile page with status and voice mode',
    ],
  },
};
