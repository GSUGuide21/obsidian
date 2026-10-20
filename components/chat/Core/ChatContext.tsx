"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useCall, type CallControls } from "../../../lib/chat/useCall";
import { useChat, type ChatIdentity } from "../../../lib/chat/useChat";

/** The chat's state and actions (what useChat returns). */
export type ChatContextValue = ReturnType<typeof useChat>;

export const ChatContext = createContext<ChatContextValue | null>(null);

/** Calls get their own context: they change often while connecting, and most of the chat doesn't care. */
export const CallContext = createContext<CallControls | null>(null);

/** Connects to the chat as `identity` and shares the connection (and calls over it) with everything inside. */
export function ChatProvider({ identity, children }: { identity: ChatIdentity; children: ReactNode }) {
  const chat = useChat(identity);
  const call = useCall(chat.socketRef);
  return (
    <ChatContext value={chat}>
      <CallContext value={call}>{children}</CallContext>
    </ChatContext>
  );
}

/** The chat's state and actions, for components inside <ChatProvider>. */
export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChatContext must be used inside <ChatProvider>.");
  return context;
}

/** Calls: the ones you can see, the one this tab is in, and its controls. */
export function useCallContext() {
  const context = useContext(CallContext);
  if (!context) throw new Error("useCallContext must be used inside <ChatProvider>.");
  return context;
}
