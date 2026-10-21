// "#channel" in a message links to that channel (see ChannelLinksContext for which ones).

/** A channel as "#name" in a message can link to it. */
export type LinkableChannel = { id: string; name: string };

/**
 * Rewrite "#name" for the given channels as links the Markdown renderer turns
 * into channel buttons (longest names first, so "#Game Night" wins over
 * "#Game"). Only at a word's start, and never inside a longer word.
 */
export function linkChannels(text: string, channels: LinkableChannel[], prefix: string) {
  if (channels.length === 0 || !text.includes("#")) return text;
  const sorted = [...channels].sort((a, b) => b.name.length - a.name.length);
  const names = sorted.map((c) => c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`(^|[\\s(])#(${names})(?![\\p{L}\\p{N}_-])`, "giu");
  return text.replace(pattern, (match, before: string, name: string) => {
    const channel = sorted.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!channel) return match;
    return `${before}[#${channel.name.replace(/[[\]\\]/g, "\\$&")}](${prefix}${encodeURIComponent(channel.id)})`;
  });
}
