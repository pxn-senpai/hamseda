// What changed in each release, shown once to users after they update.
// Add an entry for every new version before publishing it.
export const CHANGELOG: Record<string, { fa: string[]; en: string[] }> = {
  '0.2.14': {
    fa: [
      'نشانگر صحبت کردن: حلقه‌ی دور آواتار وقتی کسی صحبت می‌کند، نفس‌کشان است',
      'ورود به صفحه‌ها با انیمیشن از سمت راست',
      'کارت سرورها و دکمه‌ها با ماوس و کلیک واکنش نشان می‌دهند',
      'انیمیشن‌ها با تنظیم «کاهش حرکت» سیستم خاموش می‌شوند',
    ],
    en: [
      'Speaking indicator: the ring around an avatar pulses while someone talks',
      'Pages slide in from the right',
      'Server cards and buttons react to hover and click',
      'Animations turn off when reduced motion is on in system settings',
    ],
  },
  '0.2.13': {
    fa: [
      'دکمه‌ی اتصال در کارت سرورها کوچک‌تر و وسط‌چین شد',
    ],
    en: [
      'Connect button on server cards is smaller and centered',
    ],
  },
  '0.2.12': {
    fa: [
      'رفع خش صدا: بلندگو دیگر نمونه‌های صوتی را از دست نمی‌دهد',
      'کارت سرورها فشرده‌تر و خواناتر شد',
      'دکمه‌ی پیام‌های خصوصی در صفحه‌ی اصلی با شمارش خوانده‌نشده',
      'دکمه‌ی ربات موزیک در کارت پروفایل کامل نمایش داده می‌شود',
    ],
    en: [
      'Fixed crackle: the speaker no longer drops audio samples',
      'Tidier server cards',
      'Private messages button on home with unread count',
      'Music bot button fits fully on the profile card',
    ],
  },
  '0.2.11': {
    fa: [
      'کیفیت صدا بهتر شد: تبدیل نرخ نمونه نرم‌تر، فیلتر صدای زمزمه‌ی میکروفون و بیت‌ریت بالاتر',
      'نام برنامه به «اوا» تغییر کرد',
      'نوار سمت راست فقط گفتگوهای خصوصی خوانده‌نشده را نشان می‌دهد',
    ],
    en: [
      'Better voice quality: smoother resampling, mic rumble filter and higher bitrate',
      'App renamed to ava (اوا)',
      'The side bar shows only unread private chats',
    ],
  },
  '0.2.10': {
    fa: [
      'کارت پروفایل هر کاربر، رول‌های سرور او را با رنگ نشان می‌دهد',
      'صفحه‌ی پروفایل: تغییر نام نمایشی، بیو و عکس پروفایل',
      'اصلاح چیدمان صفحه‌ی پروفایل و حذف حالت ورودی از آن',
    ],
    en: [
      'Member profile cards show each person\'s server roles in color',
      'Profile page: change display name, bio and picture',
      'Profile layout fixes; input mode removed from the profile page',
    ],
  },
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
