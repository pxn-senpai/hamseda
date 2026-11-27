// What changed in each release, shown once to users after they update.
// Add an entry for every new version before publishing it.
export const CHANGELOG: Record<string, { fa: string[]; en: string[] }> = {
  '0.2.9': {
    fa: [
      'گفتگوهای خصوصی بالای نوار سمت راست با شمارش پیام‌های خوانده‌نشده',
      'صفحه‌ی جدا برای پیام‌های خصوصی با دکمه‌ی بازگشت',
      'پروفایل: تغییر نام نمایشی، بیو و عکس پروفایل',
      'خروج از سرور با انیمیشن برگشت به صفحه‌ی اصلی',
      'صفحه‌ی شروع با آیکون و انیمیشن، و اصلاح چیدمان صفحه‌ی اصلی',
    ],
    en: [
      'Private chats at the top of the side bar with unread counts',
      'Private messages have their own page with a back button',
      'Profile: change display name, bio and picture',
      'Leave server returns to home with an animation',
      'Startup screen with icon and animation; home layout fixes',
    ],
  },
  '0.2.8': {
    fa: [
      'صفحه‌ی شروع با نمایش آیکون برنامه و انیمیشن ورود',
      'پنل کاربری حالا صفحه‌ی جدا دارد، با دکمه‌ی بازگشت',
      'خروج از ویس فقط از کانال ویس فعلی خارج می‌کند',
      'دکمه‌ی امتحان دمو حذف شد و افزودن سرور به صفحه‌ی اصلی برگشت',
    ],
    en: [
      'Startup screen with the app icon and entry animation',
      'Profile now has its own page with a back button',
      'Leave voice leaves only the current voice channel',
      'Removed the demo button; add server is back on home',
    ],
  },
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
