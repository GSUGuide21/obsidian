"use client";

import { createContext, useContext } from "react";
import type { LinkableChannel } from "@/lib/chat/channelLinks";

/**
 * "#channel" links in messages: the channels a message's group has (only the
 * ones you can see), and opening one. Provided by the chat app; text outside
 * it (e.g. a preview) just isn't linked.
 */
export type ChannelLinks = {
  channelsFor: (subgroupId: string) => LinkableChannel[];
  open: (subgroupId: string) => void;
};

export const ChannelLinksContext = createContext<ChannelLinks | null>(null);

export function useChannelLinks() {
  return useContext(ChannelLinksContext);
}
