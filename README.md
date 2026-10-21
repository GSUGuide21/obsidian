# Obsidian Chat

Obsidian Chat is a self-hosted, real-time group chat app. One deployment is an
**instance** with its own name. People sign in (or join as guests), gather in
**groups**, and talk in each group's **channels**, in **direct messages**, and
on **voice and video calls**.

It's a single Node.js server that runs both the web app (Next.js) and the
live chat (socket.io), with everything stored in **Supabase** (Postgres and auth).

---

## What it does

### Accounts and sign-in
- Sign in with **Google**, **Facebook (Meta)**, Apple, Microsoft or Twitch, or
  with **email**: a password, an emailed sign-in link, and password resets.
  The sign-in screen shows whichever methods are switched on in Supabase.
- **Guests** can join with just a display name, unless an instance admin turns
  that off. Guests can't upload files, start direct messages or create groups.
- **Profiles:** a name, photo, color, bio and cover photo, plus a separate
  profile in each group. **Status:** online, away, do not disturb or
  invisible, with custom text and emoji.

### Groups and channels
- **Finding people:** Discover's **People** tab lists everyone signed in, most
  recently around first, to search by name, message or call. Anyone can leave
  themselves out (Settings → Privacy → "Let people find me"). Then only people who
  share a group or conversation with them can find them.
- Groups are **public** (listed on the Discover page, open to join) or
  **private** (invite by name or by an invite link with an expiry and use limit).
- **Channel types:**
  - **Text:** ordinary chat.
  - **Announcement:** only owners and admins post; everyone replies in threads.
  - **Forum:** posts with titles and tags, listed by latest activity, each with its own thread.
  - **Wiki:** one shared page, edited as rich text or Markdown, with a chat tab.
    Headings 1–6, tables, checklists, code blocks, spoilers, emoji, channel links,
    and a choice of fonts and text sizes.
  - **Voice:** opening it joins its call.
- **Private channels** are only seen by the roles and people they let in,
  plus the group's owner, admins, moderators and channel managers. Everyone else doesn't
  get them at all: not in the sidebar, search, unread counts or live events.
- **Categories** sort channels into sidebar sections. They can be created
  empty, renamed, deleted and reordered. Channels and categories are arranged
  by drag and drop.
- **Slow mode** limits how often each member can post. **Disappearing
  messages** deletes messages after an hour, a day or a week.

### Messages
- Markdown, **spoilers** (`||hidden||`), @mentions, replies, **threads**,
  reactions (custom emoji too), editing with **edit history**, deleting,
  pinning, forwarding, saving for later, and marking unread.
- **Copy link to message:** links open the message (or its thread) for anyone
  who can see it, even through signing in.
- **Attachments:** files, images, video, audio, voice messages, GIFs (Tenor),
  stickers, link previews and embedded videos.
- **Polls:** single or multiple choice, with an optional limit ("up to 3") and
  an optional closing time.
- **Quizzes:** graded by the server, so the answer can't be read off the
  message. Once one closes, its answer is shown to everyone.
- **Events** with RSVPs and reminders. Scheduled messages. Slash commands answered by bots.
- **Search** within a channel, a group, or everything, with filters such as
  `from:ada in:#general has:image before:2026-10-01`. Each group also has a
  **Browse** panel listing its events, polls, quizzes, media, files and voice messages.

### Staying in touch
- Presence, typing indicators, unread counts, optional read receipts ("Seen by").
- Per-channel notification levels, desktop notifications and **web push**.
- A quick switcher (Ctrl/⌘+K) and keyboard shortcuts.
- **Calls:** one-on-one and group voice and video, with screen sharing (WebRTC).

### Moderation
- **Ranks:** owner, admin, moderator and member. **Custom roles** grant specific
  permissions on top of a rank.
- Mute, kick and ban. Blocked-word filter, message reports, and members can
  block each other.
- A **moderation log** records who did what, with before and after snapshots.
- **Integrations:** incoming webhooks (post into a channel, or start forum
  posts) and group bots with their own slash commands.
- **Instance admin:** the instance's name, whether guests may join, and a
  notice shown to everyone.

### Languages
The interface is available in **English, Spanish and French**. It follows the
browser's language unless one is picked in Settings → Appearance, and dates
follow the same language. The sign-in screen, sidebar, chat header and
composer, search and the settings screen are translated; the rest of the
interface is still English-only (see [Translations](#translations)).
Messages themselves are never translated.

---

## Getting started

### Requirements
- **Node.js 22.18 or newer.** The server runs its TypeScript directly with
  Node's type stripping.
- **Yarn 1** (`packageManager` in package.json).
- A **Supabase** project.

### 1. Install
```bash
yarn install
```

### 2. Configure
Create `.env.local` in the project root:

| Variable | Required | What it's for |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your project's URL, e.g. `https://abc.supabase.co`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | The project's **publishable** key (`sb_publishable_…`). |
| `NEXT_SUPABASE_ADMIN_KEY` | Yes | The **secret** key. Only the server uses it; never expose it. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | No | Web push. Generate the keys with `npx web-push generate-vapid-keys`; the subject is a `mailto:` address or https URL. Push stays off without them. |
| `TENOR_API_KEY` | No | GIF search (a Tenor key from Google Cloud). GIFs stay off without it. |
| `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`, `NEXT_PUBLIC_TURN_CREDENTIAL` | No | A TURN server, so calls connect across strict networks. Public STUN servers are used either way. |
| `PORT` | No | Defaults to 3000. |

### 3. Set up the database
Apply every file in [supabase/migrations/](supabase/migrations/) **in order**,
with the Supabase CLI (`npx supabase db push`) or by pasting each into the
SQL editor. Row-level security is on with no policies: only the chat server,
using the secret key, reads and writes chat data.

### 4. Set up sign-in
In the Supabase dashboard:
1. **Authentication → Sign In / Providers.** Turn on what you want:
   - **Email.** "Confirm email" decides whether new accounts must click a link first.
   - **Google, Facebook, Apple, Microsoft (Azure), Twitch.** Each needs an app
     created with that provider, redirecting to
     `https://<your-project>.supabase.co/auth/v1/callback`.
2. **Authentication → URL Configuration.** Set the site URL, and add
   `http://localhost:3000/auth/callback` plus your production `/auth/callback`
   to the redirect URLs.
3. **Authentication → Emails.** For real use, set up your own SMTP server.
   Supabase's built-in sender only sends a few emails an hour.

### 5. Run it
```bash
yarn dev      # development: reloads the server on changes (tsx watch)
yarn build    # production build of the web app
yarn start    # production server
```
Open <http://localhost:3000>.

**Becoming the instance admin.** Sign in once, then run the
`20261019010000_first_user_admin.sql` migration again (it promotes the only
signed-in user). Or set it by hand:
```sql
update public.members set role = 'admin' where id = '<auth user id>';
```
Then restart the server, or reload the page.

---

## How it's built

```
Browser ──HTTP──▶ server.mts ──▶ Next.js (pages, /auth/callback, /api/*)
   │                  │
   └──socket.io──────▶└─ lib/server: the live chat ──▶ Supabase (Postgres + Auth)
```

- **[server.mts](server.mts)** starts one HTTP server for Next.js and socket.io.
  It answers incoming webhooks itself, and runs timers for event reminders,
  scheduled messages and disappearing messages.
- **[lib/server/](lib/server/)** is the chat server: one module per area.
  - [handlers/](lib/server/handlers/) registers every socket event, by area.
  - [access.ts](lib/server/access.ts) decides who can see and do what, private channels included.
  - [state.ts](lib/server/state.ts) holds what's kept in memory: groups,
    channels, members, who's online, and each channel's latest message.
  - Supabase is the source of truth.
- **[lib/chat/](lib/chat/)** is the client logic.
  - [useChat.ts](lib/chat/useChat.ts) holds the socket and all chat state.
  - [types/](lib/chat/types/) has the types shared with the server, including
    every socket event ([events.ts](lib/chat/types/events.ts)) and the
    permission rules ([permissions.ts](lib/chat/types/permissions.ts)).
- **[components/chat/](components/chat/)** is the interface: the sidebar, the
  channel view and its side panels (threads, members, search, saved, browse),
  and the settings screens.
- **[lib/i18n/](lib/i18n/)** has the interface languages and `useT()`.
- **[lib/supabase/](lib/supabase/)** handles sign-in and sessions.
  [providers.ts](lib/supabase/providers.ts) lists the sign-in methods the app supports.

**Conventions.** Server code is loaded by Node's type stripping, so its
imports from the app use explicit `.ts` paths, and only `import type` comes
from `lib/chat/types`. Client and server share validation rules by mirroring
them, with a comment pointing at the other copy.

---

## Development

```bash
yarn test     # unit tests (Node's built-in runner, tests/*.test.ts)
yarn lint     # ESLint
npx tsc --noEmit
```

Tests cover the pure logic: ordering, permissions and private channels,
search parsing, forum listing, spoilers, polls, sign-in providers and the
translations. They don't need a database.

### Translations
Interface text lives in [lib/i18n/messages/](lib/i18n/messages/).
[en.ts](lib/i18n/messages/en.ts) is the source, and every other language must
have each of its keys (TypeScript enforces this, and a test checks
placeholders match).

- **Using it:** call `const t = useT()` in a component, then
  `t("key", { name })`, or `t.plural("key", count)` for counted text.
- **Adding a language:** add it to `LOCALES` in
  [locales.ts](lib/i18n/locales.ts), add a messages file, and register it in
  [translate.ts](lib/i18n/translate.ts).
- **Still English-only:** dialogs, group and channel settings, the moderation
  screens, and message and attachment details. Move their strings into the
  dictionaries as you touch them.
