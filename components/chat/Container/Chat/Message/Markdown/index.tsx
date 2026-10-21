import Markdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { User } from "@/lib/chat/types";
import { useChannelLinks } from "@/components/chat/Core/ChannelLinks";
import { linkChannels } from "@/lib/chat/channelLinks";
import { remarkSpoiler, SPOILER_PROPERTY } from "@/lib/chat/spoiler";
import { FONT_PROPERTY, remarkStyledText, SIZE_PROPERTY, styleCss } from "@/lib/chat/styledText";
import { safeUrl } from "@/lib/chat/url";
import Mention from "../Attachment/Mention";
import Spoiler from "./Spoiler";

type MarkdownTextProps = {
  text: string;
  /** Members mentioned by this message; "@Name" in the text becomes a chip. */
  mentions: { userId: string; name: string }[];
  users: Record<string, User>;
  selfId: string;
  /** "page" renders full-size headings and roomier spacing (wiki pages). */
  variant?: "message" | "page";
  /** The group's custom emoji (name → image URL): ":name:" in the text shows the image. */
  emoji?: Record<string, string>;
  /** Where the text is: "#name" links to that group's channels (see ChannelLinksContext). */
  subgroupId?: string;
};

const MENTION_PREFIX = "mention:";
const EMOJI_PREFIX = "emoji:";
const CHANNEL_PREFIX = "channel:";

/** Rewrite ":name:" for the group's custom emoji as links the `a` renderer turns into images. */
function linkEmoji(text: string, emoji: Record<string, string> | undefined) {
  if (!emoji) return text;
  return text.replace(/:([a-z0-9_]{2,32}):/g, (match, name: string) =>
    Object.hasOwn(emoji, name) ? `[${match}](${EMOJI_PREFIX}${name})` : match,
  );
}

/** Rewrite "@Name" for mentioned members as links the `a` renderer turns into chips. */
function linkMentions(text: string, mentions: MarkdownTextProps["mentions"]) {
  if (mentions.length === 0) return text;
  const names = [...mentions].sort((a, b) => b.name.length - a.name.length);
  const pattern = new RegExp(
    `@(${names.map((m) => m.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );
  return text.replace(pattern, (match, name: string) => {
    const mention = names.find((m) => m.name.toLowerCase() === name.toLowerCase());
    if (!mention) return match;
    const label = match.replace(/[[\]\\]/g, "\\$&");
    return `[${label}](${MENTION_PREFIX}${encodeURIComponent(mention.userId)})`;
  });
}

/**
 * Message text as GitHub-flavoured Markdown. Raw HTML is never rendered,
 * links are limited to http(s), and images are dropped (use attachments).
 * Single newlines are kept as line breaks, as people expect in chat, and
 * "||spoilers||" stay covered until clicked.
 */
export default function MarkdownText({ text, mentions, users, selfId, variant = "message", emoji, subgroupId }: MarkdownTextProps) {
  const links = useChannelLinks();
  const channels = links && subgroupId ? links.channelsFor(subgroupId) : [];
  // A message that's only custom emoji shows them bigger, as with emoji in most chat apps.
  const onlyEmoji = Boolean(emoji) && /^(\s*:[a-z0-9_]{2,32}:)+\s*$/.test(text) &&
    [...text.matchAll(/:([a-z0-9_]{2,32}):/g)].every(([, name]) => Object.hasOwn(emoji!, name));
  const messageComponents: Components = {
    a: ({ href, children }) => {
      if (href?.startsWith(EMOJI_PREFIX)) {
        const name = href.slice(EMOJI_PREFIX.length);
        const src = emoji?.[name];
        if (!src) return <span>{children}</span>;
        return (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded emoji
          <img
            src={src}
            alt={`:${name}:`}
            title={`:${name}:`}
            className={onlyEmoji ? "inline size-10 align-bottom" : "inline size-5 align-text-bottom"}
          />
        );
      }
      if (href?.startsWith(CHANNEL_PREFIX) && links) {
        const channelId = decodeURIComponent(href.slice(CHANNEL_PREFIX.length));
        return (
          <button
            type="button"
            onClick={() => links.open(channelId)}
            className="rounded bg-accent/15 px-1 font-medium text-accent-bright hover:bg-accent/25"
          >
            {children}
          </button>
        );
      }
      if (href?.startsWith(MENTION_PREFIX)) {
        const userId = decodeURIComponent(href.slice(MENTION_PREFIX.length));
        return (
          <Mention attachment={{ type: "mention", userId }} user={users[userId]} isSelf={userId === selfId} inline />
        );
      }
      const url = safeUrl(href);
      if (!url) return <span>{children}</span>;
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent-bright underline-offset-2 hover:underline">
          {children}
        </a>
      );
    },
    // "||hidden||" (see lib/chat/spoiler.ts); other spans pass through.
    // Pages' fonts and sizes (see lib/chat/styledText.ts), from the known lists only.
    span: ({ node, children, ...props }) => {
      const properties = node?.properties ?? {};
      if (SPOILER_PROPERTY in properties) return <Spoiler>{children}</Spoiler>;
      if (FONT_PROPERTY in properties || SIZE_PROPERTY in properties) {
        return <span style={styleCss(properties[FONT_PROPERTY], properties[SIZE_PROPERTY])}>{children}</span>;
      }
      return <span {...props}>{children}</span>;
    },
    p: ({ children }) => <p className="leading-6 not-first:mt-1.5">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    code: ({ children }) => (
      <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
    ),
    pre: ({ children }) => (
      <pre className="my-1.5 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[13px] leading-5 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[1em]">
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote className="my-1 border-l-2 border-border pl-3 text-muted">{children}</blockquote>
    ),
    ul: ({ children }) => <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="my-1 list-decimal space-y-0.5 pl-5">{children}</ol>,
    // Headings stay message-sized; they're for structure, not shouting.
    h1: ({ children }) => <p className="mt-1.5 font-bold">{children}</p>,
    h2: ({ children }) => <p className="mt-1.5 font-bold">{children}</p>,
    h3: ({ children }) => <p className="mt-1.5 font-semibold">{children}</p>,
    h4: ({ children }) => <p className="mt-1.5 font-semibold">{children}</p>,
    h5: ({ children }) => <p className="mt-1.5 font-semibold">{children}</p>,
    h6: ({ children }) => <p className="mt-1.5 font-semibold">{children}</p>,
    hr: () => <hr className="my-2 border-border" />,
    table: ({ children }) => (
      <div className="my-1.5 overflow-x-auto">
        <table className="border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border border-border bg-surface-2 px-2 py-1 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
  };

  const components: Components =
    variant === "page"
      ? {
          ...messageComponents,
          p: ({ children }) => <p className="mt-3 leading-7 first:mt-0">{children}</p>,
          h1: ({ children }) => <h1 className="mt-8 mb-3 text-2xl font-bold tracking-tight first:mt-0">{children}</h1>,
          h2: ({ children }) => (
            <h2 className="mt-7 mb-2 border-b border-border pb-1 text-xl font-semibold tracking-tight first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => <h3 className="mt-5 mb-1.5 text-lg font-semibold first:mt-0">{children}</h3>,
          h4: ({ children }) => <h4 className="mt-4 mb-1 font-semibold first:mt-0">{children}</h4>,
          h5: ({ children }) => <h5 className="mt-4 mb-1 font-semibold first:mt-0">{children}</h5>,
          h6: ({ children }) => <h6 className="mt-4 mb-1 font-semibold text-muted first:mt-0">{children}</h6>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6 leading-7">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6 leading-7">{children}</ol>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-accent/50 pl-4 text-muted">{children}</blockquote>
          ),
          hr: () => <hr className="my-6 border-border" />,
        }
      : messageComponents;

  return (
    <Markdown
      // Fonts and sizes are for pages; messages keep to the chat's own type.
      remarkPlugins={variant === "page" ? [remarkGfm, remarkBreaks, remarkSpoiler, remarkStyledText] : [remarkGfm, remarkBreaks, remarkSpoiler]}
      components={components}
      disallowedElements={["img"]}
      unwrapDisallowed
      urlTransform={(url) =>
        url.startsWith(MENTION_PREFIX) || url.startsWith(EMOJI_PREFIX) || url.startsWith(CHANNEL_PREFIX)
          ? url
          : defaultUrlTransform(url)
      }
    >
      {linkChannels(linkEmoji(linkMentions(text, mentions), emoji), channels, CHANNEL_PREFIX)}
    </Markdown>
  );
}
