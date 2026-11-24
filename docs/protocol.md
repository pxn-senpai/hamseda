# قرارداد پیام: رابط ↔ پل (bridge)

رابط (React) و پل (Node.js) با WebSocket روی `ws://127.0.0.1:8787` حرف می‌زنند. پیام‌ها JSON هستند و هر پیام یک فیلد `type` و در بیشتر موارد `connId` دارد. `connId` شناسه‌ی یک اتصال به یک سرور است، پس می‌شود هم‌زمان به چند سرور وصل بود.

در مرحله‌ی ۲ همین قرارداد را یک هسته‌ی Rust با tsclientlib پیاده می‌کند. رابط تغییر نمی‌کند.

## از رابط به پل

| `type` | فیلدها | معنی |
| --- | --- | --- |
| `connect` | `connId`, `mode` (`demo` یا `serverquery`), `address`, `port`, `nickname`, `password?`, `query?` | وصل شو. اگر `connId` از قبل باز بود، اتصال قبلی بسته می‌شود. |
| `disconnect` | `connId` | قطع کن. |
| `joinChannel` | `connId`, `channelId` | برو به کانال. |
| `setSelfState` | `connId`, `inputMuted?`, `outputMuted?` | میکروفون یا صدای خودت را قطع/وصل کن. |
| `sendMessage` | `connId`, `channelId`, `text` | پیام بفرست (حداکثر ۱۰۰۰ کاراکتر). |

## از پل به رابط

| `type` | فیلدها | معنی |
| --- | --- | --- |
| `status` | `connId`, `state` (`connecting`، `connected`، `disconnected`، `error`), `message?`, `code?` | وضعیت اتصال. |
| `snapshot` | `connId`, `selfId`, `server`, `groups`, `channels`, `clients` | کل وضعیت سرور؛ بعد از اتصال و بعد از هر تغییر مهم فرستاده می‌شود. |
| `clientPatch` | `connId`, `clientId`, `changes` | فقط تغییرات یک کاربر (مثلاً صحبت می‌کند یا میکروفونش قطع شد). |
| `message` | `connId`, `channelId`, `message` | یک پیام چت جدید. |
| `notice` | `connId`, `code`, `message` | پیام کوتاه برای کاربر (مثلاً «فقط مشاهده»). |

## شکل داده‌ها

```text
channel: { id, parentId (0 = بالاترین سطح), order (از 0), name, topic?, maxClients?, password?, isSpacer? }
client:  { id, channelId, nickname, talking?, inputMuted?, outputMuted?, away?, awayMessage?, groupIds[], isSelf? }
group:   { id, name, sortId (کمتر = مهم‌تر) }
message: { id, from: { id, nickname }, text, ts (میلی‌ثانیه) }
```

## قوانین

- `selfId` در حالت ServerQuery صفر است، چون اتصال کوئری یک کاربر قابل‌دیدن نیست.
- کانال‌های `[cspacer]عنوان` در رابط به‌صورت عنوان دسته نشان داده می‌شوند.
- حالت ServerQuery فقط‌مشاهده است؛ پیام‌هایی مثل `joinChannel` با `notice` کد `read-only` جواب داده می‌شوند.
- پل فقط از مبدأهای مجاز (پیش‌فرض `localhost:5173`) می‌پذیرد تا سایت‌های دیگر نتوانند به آن وصل شوند.
