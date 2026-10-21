"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Bot as BotIcon, Check, Globe, Lock, Plus, RefreshCw, Trash } from "lucide-react";
import ChannelIcon from "@/components/chat/ChannelIcon";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import Dialog from "@/components/Dialog";
import Checkbox from "@/components/form/Checkbox";
import ColorPicker, { type HEXString } from "@/components/form/Color";
import Field from "@/components/form/Field";
import Input from "@/components/form/Input";
import Listbox from "@/components/form/Listbox";
import Switch from "@/components/form/Switch";
import Radio from "@/components/form/Radio";
import Select from "@/components/form/Select";
import TextArea from "@/components/form/TextArea";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import {
  AVATAR_COLORS,
  canManageGroup,
  cleanChannelName,
  cleanTagName,
  isDm,
  MAX_FORUM_TAGS,
  MAX_TAG_NAME_LENGTH,
  MAX_BOTS_PER_GROUP,
  MAX_NAME_LENGTH,
  webhookUrl,
  type BotResult,
  type ManagedBot,
  type Webhook,
  MAX_CATEGORY_LENGTH,
  MAX_CHANNEL_MEMBERS,
  MAX_CHANNEL_NAME_LENGTH,
  MAX_GROUP_DESCRIPTION_LENGTH,
  MAX_GROUP_NAME_LENGTH,
  MAX_TOPIC_LENGTH,
  DISAPPEAR_TIMES,
  type ChannelAccess,
  type ChannelDraft,
  type Group,
  type GroupDraft,
  type GroupType,
  type GroupVisibility,
  type SaveResult,
  type Subgroup,
} from "@/lib/chat/types";
import { formatDisappear } from "@/lib/chat/format";
import { categoryOrder, moveChannel, stepChannel, stepGroup, type ChannelMove } from "@/lib/chat/order";
import {
  cleanBlockedWords,
  formatSlowMode,
  MAX_BLOCKED_WORD_LENGTH,
  MAX_BLOCKED_WORDS,
  SLOW_MODES,
} from "@/lib/chat/safety";
import { cn, readableOn } from "@/lib/utils";

/** The sections of a group's settings screen (see components/chat/GroupSettings). */
export type GroupSettingsSection =
  | "about"
  | "notifications"
  | "disappearing"
  | "you"
  | "overview"
  | "categories"
  | "words"
  | "emoji"
  | "stickers"
  | "bots"
  | "roles"
  | "invites"
  | "bans"
  | "reports"
  | "log"
  | "danger";

/**
 * What's being created or edited; `null` when nothing is. Creating a group
 * and channels' settings are dialogs; a group's settings are a screen of
 * their own ("settings", opened at `section`).
 */
export type ManageTarget =
  | { kind: "group" }
  | { kind: "settings"; groupId: string; section?: GroupSettingsSection }
  | { kind: "channel"; groupId: string; channel?: Subgroup }
  | null;

type ManageDialogProps = {
  /** "settings" targets aren't dialogs (the screen shows them); this ignores them. */
  target: ManageTarget;
  onClose: () => void;
  /** After creating: open the new channel (a new group's first channel). */
  onCreated: (channelId: string) => void;
};

/** What the forms get from the chat. */
type ManageData = {
  /** The groups you manage (channels can move between them). */
  groups: Group[];
  onSaveGroup: (draft: GroupDraft, id?: string) => Promise<SaveResult>;
  onSaveChannel: (draft: ChannelDraft, id?: string) => Promise<SaveResult>;
  onDeleteChannel: (id: string) => Promise<string | undefined>;
  onMoveChannel: (move: ChannelMove) => Promise<string | undefined>;
};

/**
 * Dialog for creating groups (signed-in users) and for creating, editing and
 * deleting channels (those who manage the group).
 */
export default function ManageDialog({ target, onClose, onCreated }: ManageDialogProps) {
  const chat = useChatContext();
  const self = chat.state.users[chat.state.selfId];
  const groups = chat.state.groups.filter((g) => canManageGroup(g, self));
  const dialog = target?.kind === "settings" ? null : target;
  const actions = {
    onSaveGroup: chat.saveGroup,
    onSaveChannel: chat.saveChannel,
    onDeleteChannel: chat.deleteChannel,
    onMoveChannel: chat.moveChannel,
    onCreated,
  };
  const title = dialog?.kind === "group" ? "Create a group" : dialog?.channel ? "Channel settings" : "Create a channel";

  return (
    <Dialog open={Boolean(dialog)} title={title} onClose={onClose}>
      {dialog?.kind === "group" && <GroupForm onClose={onClose} {...actions} />}
      {dialog?.kind === "channel" && (
        <ChannelForm
          groupId={dialog.groupId}
          channel={dialog.channel}
          groups={groups}
          onClose={onClose}
          {...actions}
        />
      )}
    </Dialog>
  );
}

type Actions = ManageData & Omit<ManageDialogProps, "target">;

/** Enter in a sub-form's box shouldn't submit the settings form around it. */
const noSubmit = (event: React.KeyboardEvent) => {
  if (event.key === "Enter") event.preventDefault();
};

/** A channel's incoming webhooks: make one (its URL is shown once), copy, delete. */
function WebhookManager({ subgroupId }: { subgroupId: string }) {
  const chat = useChatContext();
  const { loadWebhooks } = chat;
  /** `undefined` while loading, `null` if they couldn't be loaded. */
  const [hooks, setHooks] = useState<Webhook[] | null>();
  const [name, setName] = useState("");
  // The new webhook's URL: shown once (only a hash of its secret is kept).
  const [created, setCreated] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const nameId = useId();

  useEffect(() => {
    let active = true;
    void loadWebhooks(subgroupId).then((list) => {
      if (active) setHooks(list ?? null);
    });
    return () => {
      active = false;
    };
  }, [subgroupId, loadWebhooks]);

  async function create() {
    setBusy(true);
    setError(undefined);
    const result = await chat.createWebhook(subgroupId, name.trim());
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setHooks((list) => [...(list ?? []), result.webhook]);
    setCreated({ id: result.webhook.id, url: webhookUrl(window.location.origin, result.webhook.id, result.token) });
    setCopied(false);
    setName("");
  }

  async function remove(id: string) {
    setBusy(true);
    setError(undefined);
    const failure = await chat.deleteWebhook(id);
    setBusy(false);
    if (failure) return setError(failure);
    setHooks((list) => list?.filter((h) => h.id !== id));
    if (created?.id === id) setCreated(null);
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Webhooks</legend>
      <p className="text-xs text-muted">
        Let other services post here: send <span className="font-mono">{'{"content": "Hello"}'}</span> as JSON to the
        webhook&apos;s URL. Anyone with the URL can post, so keep it secret.
      </p>
      {hooks === null && <p className="text-xs text-muted">Couldn&apos;t load the webhooks.</p>}
      {hooks && hooks.length > 0 && (
        <ul className="space-y-1">
          {hooks.map((hook) => (
            <li key={hook.id} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{hook.name}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(hook.id)}
                aria-label={`Delete the webhook ${hook.name}`}
                className="rounded p-1 text-muted hover:text-danger disabled:opacity-50"
              >
                <Trash className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {created && (
        <div className="space-y-1 rounded-lg border border-accent/50 bg-accent/5 px-3 py-2">
          <p className="text-xs font-medium">Copy this URL now; it won&apos;t be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-xs select-all">{created.url}</code>
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard.writeText(created.url).then(
                  () => setCopied(true),
                  () => setError("Couldn't copy. Select the URL and copy it yourself."),
                )
              }
              className="h-7 shrink-0 rounded-md border border-border px-2 text-xs font-medium hover:bg-surface-2"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
      {hooks && (
        <div className="flex items-center gap-2">
          <label htmlFor={nameId} className="sr-only">
            Webhook name
          </label>
          <Input
            id={nameId}
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Deploy bot"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={noSubmit}
            className="w-48"
          />
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void create()}
            className="h-8 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
          >
            New webhook
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/**
 * A group's bots: add one (its signing secret is shown once), refresh its
 * commands, remove it. `heading: false` keeps the legend for screen readers
 * only (the settings screen titles the section).
 */
export function BotManager({ groupId, heading = true }: { groupId: string; heading?: boolean }) {
  const chat = useChatContext();
  const { loadBots } = chat;
  /** `undefined` while loading, `null` if they couldn't be loaded. */
  const [bots, setBots] = useState<ManagedBot[] | null>();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  // The new bot's signing secret: shown once.
  const [created, setCreated] = useState<{ id: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  /** What the last add or refresh left out, or couldn't do. */
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const nameId = useId();
  const urlId = useId();

  useEffect(() => {
    let active = true;
    void loadBots(groupId).then((list) => {
      if (active) setBots(list ?? null);
    });
    return () => {
      active = false;
    };
  }, [groupId, loadBots]);

  function finish(result: BotResult) {
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setBots((list) => [...(list ?? []).filter((b) => b.id !== result.bot.id), result.bot]);
    setNotes([...(result.warning ? [result.warning] : []), ...result.skipped.map((s) => `Skipped ${s}.`)]);
    return result;
  }

  async function add() {
    setBusy(true);
    setError(undefined);
    const result = finish(await chat.addBot(groupId, name.trim(), url.trim()));
    if (!result) return;
    if (result.secret) setCreated({ id: result.bot.id, secret: result.secret });
    setCopied(false);
    setName("");
    setUrl("");
  }

  async function refresh(id: string) {
    setBusy(true);
    setError(undefined);
    finish(await chat.refreshBot(id));
  }

  async function remove(id: string) {
    setBusy(true);
    setError(undefined);
    const failure = await chat.removeBot(id);
    setBusy(false);
    if (failure) return setError(failure);
    setBots((list) => list?.filter((b) => b.id !== id));
    if (created?.id === id) setCreated(null);
    setNotes([]);
  }

  return (
    <fieldset className="space-y-2">
      <legend className={heading ? "text-sm font-medium" : "sr-only"}>Bots</legend>
      <p className="text-xs text-muted">
        Outside services that add slash commands here. When someone runs one, the bot gets a signed request at its URL
        and its answer is posted as a reply. Up to {MAX_BOTS_PER_GROUP}.
      </p>
      {bots === null && <p className="text-xs text-muted">Couldn&apos;t load the bots.</p>}
      {bots && bots.length > 0 && (
        <ul className="space-y-1">
          {bots.map((bot) => (
            <li key={bot.id} className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm">
              <div className="flex items-center gap-2">
                <BotIcon aria-hidden className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate font-medium">{bot.name}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void refresh(bot.id)}
                  aria-label={`Refresh commands for ${bot.name}`}
                  title="Refresh commands"
                  className="rounded p-1 text-muted hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(bot.id)}
                  aria-label={`Remove the bot ${bot.name}`}
                  className="rounded p-1 text-muted hover:text-danger disabled:opacity-50"
                >
                  <Trash className="size-3.5" />
                </button>
              </div>
              <p className="truncate text-xs text-muted" title={bot.url}>
                {bot.url}
              </p>
              <p className="mt-0.5 font-mono text-xs text-muted">
                {bot.commands.length > 0 ? bot.commands.map((c) => `/${c.name}`).join("  ") : "No commands yet"}
              </p>
            </li>
          ))}
        </ul>
      )}
      {created && (
        <div className="space-y-1 rounded-lg border border-accent/50 bg-accent/5 px-3 py-2">
          <p className="text-xs font-medium">
            The bot&apos;s signing secret: copy it now, it won&apos;t be shown again. The bot checks each request&apos;s{" "}
            <span className="font-mono">X-Obsidian-Signature</span> with it.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-xs select-all">{created.secret}</code>
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard.writeText(created.secret).then(
                  () => setCopied(true),
                  () => setError("Couldn't copy. Select the secret and copy it yourself."),
                )
              }
              className="h-7 shrink-0 rounded-md border border-border px-2 text-xs font-medium hover:bg-surface-2"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
      {notes.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {bots && bots.length < MAX_BOTS_PER_GROUP && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={nameId} className="sr-only">
            Bot name
          </label>
          <Input
            id={nameId}
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Deploy bot"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={noSubmit}
            className="w-36"
          />
          <label htmlFor={urlId} className="sr-only">
            Bot URL
          </label>
          <Input
            id={urlId}
            type="url"
            value={url}
            maxLength={2048}
            placeholder="https://bot.example.com/obsidian"
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={noSubmit}
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            disabled={busy || !name.trim() || !url.trim()}
            onClick={() => void add()}
            className="h-8 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
          >
            {busy ? "Working…" : "Add bot"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** "Move up / Move down" buttons; they apply right away, separately from Save. */
function Position({
  label,
  onStep,
  canStep,
}: {
  label: string;
  onStep: (step: -1 | 1) => Promise<string | undefined>;
  canStep: (step: -1 | 1) => boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function step(direction: -1 | 1) {
    setBusy(true);
    setError(await onStep(direction));
    setBusy(false);
  }
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm font-medium">{label}</span>
        {([-1, 1] as const).map((direction) => (
          <button
            key={direction}
            type="button"
            disabled={busy || !canStep(direction)}
            onClick={() => void step(direction)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {direction === -1 ? <ArrowUp aria-hidden className="size-3.5" /> : <ArrowDown aria-hidden className="size-3.5" />}
            {direction === -1 ? "Move up" : "Move down"}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const VISIBILITIES: { visibility: GroupVisibility; label: string; description: string; icon: typeof Globe }[] = [
  { visibility: "public", label: "Public", description: "Everyone can see and join it.", icon: Globe },
  { visibility: "private", label: "Private", description: "Only members see it. People join by invite.", icon: Lock },
];

/**
 * A group's name, description, color and who can see it. Creates the group
 * (in the dialog, without `group`), or, `inline` on its settings screen,
 * saves changes in place.
 */
function GroupForm({
  group,
  inline = false,
  onClose,
  onSaveGroup,
  onCreated,
}: Pick<Actions, "onClose" | "onSaveGroup" | "onCreated"> & { group?: Group; inline?: boolean }) {
  const [name, setName] = useState(group?.name ?? "");
  const [color, setColor] = useState(group?.color ?? AVATAR_COLORS[0]);
  // The color picker shows while "Custom" is chosen (from the start for a color that isn't a preset).
  const [custom, setCustom] = useState(() => !AVATAR_COLORS.includes(group?.color ?? AVATAR_COLORS[0]));
  const [visibility, setVisibility] = useState<GroupVisibility>(group?.visibility ?? "public");
  const [description, setDescription] = useState(group?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const nameId = useId();
  const descriptionId = useId();
  const visibilityId = useId();
  const cleaned = name.trim().replace(/\s+/g, " ");
  const cleanedDescription = description.trim().replace(/\s+/g, " ");
  const changed =
    !group ||
    cleaned !== group.name ||
    color !== group.color ||
    visibility !== (group.visibility ?? "public") ||
    cleanedDescription !== (group.description ?? "");

  async function submit() {
    if (!cleaned) return setError("Give the group a name.");
    setBusy(true);
    setError(undefined);
    const result = await onSaveGroup({ name: cleaned, color, visibility, description: cleanedDescription }, group?.id);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (inline) return setSaved(true);
    onClose();
    if (!group && result.channelId) onCreated(result.channelId);
  }

  // Any edit after saving takes the "Saved" note away.
  const edit = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setSaved(false);
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="space-y-5"
    >
      <div className="flex items-center gap-4">
        <Avatar name={cleaned || "?"} color={color} shape="square" size="lg" className="size-14 text-lg" />
        <Field label="Group name" htmlFor={nameId} className="flex-1">
          <Input
            id={nameId}
            autoFocus={!inline}
            maxLength={MAX_GROUP_NAME_LENGTH}
            placeholder="e.g. Marketing"
            value={name}
            onChange={(event) => edit(setName)(event.target.value)}
          />
        </Field>
      </div>

      <Field label="Description" htmlFor={descriptionId} optional hint="Shown on the group's card in Discover.">
        <TextArea
          id={descriptionId}
          rows={2}
          autoResize
          maxHeight={120}
          maxLength={MAX_GROUP_DESCRIPTION_LENGTH}
          placeholder="What's this group about?"
          value={description}
          onChange={(event) => edit(setDescription)(event.target.value)}
        />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Color</legend>
        <div className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map((swatch, index) => {
            const checked = !custom && color === swatch;
            return (
              <label key={swatch} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="group-color"
                  value={swatch}
                  checked={checked}
                  onChange={() => {
                    edit(setColor)(swatch);
                    setCustom(false);
                  }}
                  aria-label={`Color ${index + 1}`}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg ring-offset-2 ring-offset-surface transition-shadow peer-focus-visible:ring-2 peer-focus-visible:ring-accent pointer-coarse:size-10",
                    checked && "ring-2 ring-foreground",
                  )}
                  style={{ backgroundColor: swatch }}
                >
                  {checked && <Check aria-hidden className="size-4" style={{ color: readableOn(swatch) }} />}
                </span>
              </label>
            );
          })}
          <label className="relative cursor-pointer">
            <input
              type="radio"
              name="group-color"
              value="custom"
              checked={custom}
              onChange={() => setCustom(true)}
              aria-label="Custom color"
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-lg ring-offset-2 ring-offset-surface transition-shadow peer-focus-visible:ring-2 peer-focus-visible:ring-accent pointer-coarse:size-10",
                custom && "ring-2 ring-foreground",
              )}
              // The chosen custom color inside a rainbow border.
              style={{
                background: custom
                  ? `linear-gradient(${color}, ${color}) padding-box, conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00) border-box`
                  : "conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
                border: "3px solid transparent",
              }}
            >
              {custom ? (
                <Check aria-hidden className="size-4" style={{ color: readableOn(color) }} />
              ) : (
                <Plus aria-hidden className="size-4 text-white drop-shadow" />
              )}
            </span>
          </label>
        </div>
        {custom && (
          <ColorPicker
            aria-label="Custom group color"
            format="hex"
            value={{ type: "hex", value: color as HEXString }}
            onChange={(next) => {
              if (next.type === "hex") edit(setColor)(next.value);
            }}
            className="mt-3 max-w-none"
          />
        )}
      </fieldset>

      <fieldset>
        <legend id={visibilityId} className="mb-2 text-sm font-medium">
          Who can see it
        </legend>
        <Radio.Group
          type="button"
          orientation="vertical"
          value={visibility}
          onChange={edit(setVisibility)}
          aria-labelledby={visibilityId}
          className="gap-1.5"
        >
          {VISIBILITIES.map((option) => (
            <Radio
              key={option.visibility}
              value={option.visibility}
              icon={<option.icon aria-hidden className="size-4 text-muted group-data-checked:text-accent-bright" />}
              description={option.description}
            >
              {option.label}
            </Radio>
          ))}
        </Radio.Group>
        {group && group.visibility !== "private" && visibility === "private" && (
          <p className="mt-2 text-xs text-muted">
            People who haven&apos;t joined or posted in it lose access until they&apos;re invited.
          </p>
        )}
      </fieldset>

      {!group && <p className="text-xs text-muted">New groups start with a #general channel, and you become their owner.</p>}

      {inline ? (
        <SaveBar error={error} busy={busy} saved={saved} canSave={Boolean(cleaned) && changed} />
      ) : (
        <FormFooter
          error={error}
          busy={busy}
          submitLabel={group ? "Save" : "Create group"}
          canSubmit={Boolean(cleaned)}
          onCancel={onClose}
        />
      )}
    </form>
  );
}

/** A settings screen form's footer: what went wrong (or that it saved), and Save. */
function SaveBar({ error, busy, saved, canSave }: { error?: string; busy: boolean; saved: boolean; canSave: boolean }) {
  return (
    <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
      {error ? (
        <p role="alert" className="mr-auto text-sm text-danger">
          {error}
        </p>
      ) : (
        saved && (
          <p role="status" className="mr-auto flex items-center gap-1.5 text-sm text-muted">
            <Check aria-hidden className="size-4 text-online" />
            Saved
          </p>
        )
      )}
      <button
        type="submit"
        disabled={busy || !canSave}
        className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted"
      >
        {busy ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

/** The settings screen's overview: the group's details, and where it sits in your sidebar. */
export function GroupOverview({ group }: { group: Group }) {
  const chat = useChatContext();
  // Your groups in your sidebar order (direct messages aren't in it).
  const sidebarGroups = chat.state.groups.filter((g) => g.role && !isDm(g));
  return (
    <div className="space-y-8">
      <GroupForm
        // A fresh form when the group changes underneath it (someone else saved).
        key={`${group.name}|${group.color}|${group.visibility}|${group.description}`}
        group={group}
        inline
        onSaveGroup={chat.saveGroup}
        onClose={() => {}}
        onCreated={() => {}}
      />
      {group.role && (
        <Position
          label="Position in your sidebar"
          canStep={(step) => stepGroup(sidebarGroups, group.id, step) !== null}
          onStep={async (step) => {
            const order = stepGroup(sidebarGroups, group.id, step);
            return order ? chat.reorderGroups(order) : undefined;
          }}
        />
      )}
    </div>
  );
}

/** Words and phrases members' messages can't contain (moderators and up aren't affected). */
export function BlockedWordsForm({ group }: { group: Group }) {
  const chat = useChatContext();
  const { loadBlockedWords } = chat;
  /** The list as edited; `undefined` while loading, `null` if it couldn't be loaded. */
  const [words, setWords] = useState<string[] | null>();
  const [loaded, setLoaded] = useState<string[]>([]);
  // The words picked in the list, to remove.
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const inputId = useId();
  const listLabelId = useId();

  useEffect(() => {
    let active = true;
    void loadBlockedWords(group.id).then((list) => {
      if (!active) return;
      setWords(list);
      setLoaded(list ?? []);
    });
    return () => {
      active = false;
    };
  }, [group.id, loadBlockedWords]);

  if (words === undefined) return <p className="text-sm text-muted">Loading…</p>;
  if (words === null) return <p className="text-sm text-muted">Couldn&apos;t load the blocked words.</p>;
  const list = words;

  const limits = `Up to ${MAX_BLOCKED_WORDS} words or phrases, each up to ${MAX_BLOCKED_WORD_LENGTH} characters.`;

  function change(next: string[]) {
    setWords(next);
    setSaved(false);
    setError(undefined);
  }

  /** Add what's typed: one word or phrase, or several separated by commas or new lines (e.g. pasted). */
  function add() {
    const added = cleanBlockedWords(draft);
    if (!added?.length) return setError(added === null ? limits : undefined);
    const next = cleanBlockedWords([...list, ...added]);
    if (next === null) return setError(limits);
    change(next);
    setDraft("");
  }

  function removeSelected() {
    if (selected.length === 0) return;
    change(list.filter((word) => !selected.includes(word)));
    setSelected([]);
  }

  async function submit() {
    setBusy(true);
    setError(undefined);
    // Saving sends the group as it is, with the new list.
    const result = await chat.saveGroup(
      { name: group.name, color: group.color, visibility: group.visibility ?? "public", blockedWords: list },
      group.id,
    );
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setLoaded(list);
    setSaved(true);
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="space-y-5"
    >
      <Field
        label="Add a word or phrase"
        htmlFor={inputId}
        hint="Messages containing any of these are rejected, and their authors are told why. Only those who manage the group see this list."
      >
        <div className="flex gap-2">
          <Input
            id={inputId}
            placeholder="e.g. spoiler, buy now"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(undefined);
            }}
            onKeyDown={(event) => {
              // Enter adds to the list; saving is the Save button's.
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim() || list.length >= MAX_BLOCKED_WORDS}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            <Plus aria-hidden className="size-4" />
            Add
          </button>
        </div>
      </Field>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span id={listLabelId} className="text-sm font-medium">
            Blocked words <span className="font-normal text-muted tabular-nums">({list.length}/{MAX_BLOCKED_WORDS})</span>
          </span>
          <button
            type="button"
            onClick={removeSelected}
            disabled={selected.length === 0}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-danger disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
          >
            <Trash aria-hidden className="size-3.5" />
            {selected.length > 1 ? `Remove ${selected.length}` : "Remove selected"}
          </button>
        </div>
        {/* Delete or Backspace in the list removes what's selected there. */}
        <div
          onKeyDown={(event) => {
            if (event.key === "Delete" || event.key === "Backspace") {
              event.preventDefault();
              removeSelected();
            }
          }}
        >
          <Listbox
            multiple
            aria-labelledby={listLabelId}
            options={list.map((word) => ({ value: word, label: word }))}
            value={selected.filter((word) => list.includes(word))}
            onChange={setSelected}
            emptyText="No blocked words yet. Add one above."
          />
        </div>
        <p className="mt-1.5 text-xs text-muted">Select words to remove them. Words are matched regardless of case.</p>
      </div>

      <SaveBar error={error} busy={busy} saved={saved} canSave={list.join("\n") !== loaded.join("\n")} />
    </form>
  );
}

/** The owner (or an app-wide admin) deleting the group, after typing its name. */
export function DeleteGroup({ group, onDeleted }: { group: Group; onDeleted: () => void }) {
  const chat = useChatContext();
  const [confirming, setConfirming] = useState(false);
  const channels = group.subgroups.length;
  const consequence = `Its ${channels} ${channels === 1 ? "channel" : "channels"} and all their messages, threads, pins and pages will be deleted for everyone.`;

  if (confirming) {
    return (
      <div className="rounded-xl border border-danger/40 p-4">
        <DeleteConfirm
          what={`the ${group.name} group`}
          consequence={consequence}
          confirmText={group.name}
          onCancel={() => setConfirming(false)}
          onDelete={async () => {
            const failure = await chat.deleteGroup(group.id);
            if (!failure) onDeleted();
            return failure;
          }}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-danger/40 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Delete this group</p>
        <p className="mt-0.5 text-sm text-muted">{consequence} You can&apos;t undo this.</p>
      </div>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-danger-strong px-4 text-sm font-medium text-white hover:opacity-90"
      >
        <Trash aria-hidden className="size-4" />
        Delete group
      </button>
    </div>
  );
}

const TYPES: { type: GroupType; label: string; description: string }[] = [
  { type: "text", label: "Text", description: "Messages, threads, files and polls." },
  { type: "announcement", label: "Announcement", description: "Only the group's owner and admins post. Everyone can react and reply in threads." },
  { type: "forum", label: "Forum", description: "Members start posts with a title; each post has its own thread." },
  { type: "wiki", label: "Wiki", description: "A shared page anyone signed in can edit, with a chat tab." },
  { type: "voice", label: "Voice", description: "Drop in to talk. Members see who's in it from the sidebar." },
];

/**
 * Making a channel private, and who it lets in: custom roles, and people by
 * name. The group's owner, admins, moderators and channel managers always see it.
 */
function ChannelPrivacy({
  group,
  value,
  onChange,
}: {
  group: Group;
  value: ChannelAccess | null;
  onChange: (access: ChannelAccess | null) => void;
}) {
  const { state } = useChatContext();
  const [filter, setFilter] = useState("");
  const membersId = useId();
  const roles = group.roles ?? [];
  // Loaded for the open group (see member:list); people already let in stay listed.
  const members = state.members[group.id];
  const needle = filter.trim().toLowerCase();
  const people = (members ?? [])
    .filter((m) => m.user.role !== "bot" && m.role === "member")
    .filter((m) => !needle || m.user.name.toLowerCase().includes(needle) || value?.members.includes(m.user.id));

  return (
    <fieldset className="space-y-3 rounded-xl border border-border p-3">
      <Switch
        checked={value !== null}
        onChange={(on) => onChange(on ? (value ?? { roles: [], members: [] }) : null)}
        description="Only the people and roles you pick see it, along with the group's owner, admins, moderators and anyone who manages channels."
      >
        Private channel
      </Switch>
      {value && (
        <>
          {roles.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-medium">Roles that can see it</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {roles.map((role) => (
                  <Checkbox
                    key={role.id}
                    checked={value.roles.includes(role.id)}
                    onChange={(on) =>
                      onChange({ ...value, roles: on ? [...value.roles, role.id] : value.roles.filter((id) => id !== role.id) })
                    }
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: role.color }} />
                      {role.name}
                    </span>
                  </Checkbox>
                ))}
              </div>
            </div>
          )}
          <div>
            <p id={membersId} className="mb-1.5 text-sm font-medium">
              People who can see it{" "}
              <span className="font-normal text-muted tabular-nums">
                ({value.members.length}/{MAX_CHANNEL_MEMBERS})
              </span>
            </p>
            {members === undefined ? (
              <p className="text-xs text-muted">Open this group to pick people by name.</p>
            ) : (
              <>
                <Input
                  size="sm"
                  aria-label="Find people"
                  placeholder="Find people"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  className="mb-1.5"
                />
                <Listbox
                  multiple
                  aria-labelledby={membersId}
                  options={people.map((m) => ({ value: m.user.id, label: m.user.name }))}
                  value={value.members}
                  onChange={(next) => onChange({ ...value, members: next.slice(0, MAX_CHANNEL_MEMBERS) })}
                  emptyText={needle ? "Nobody by that name." : "Nobody else in the group yet."}
                />
              </>
            )}
          </div>
        </>
      )}
    </fieldset>
  );
}

/** A forum tag being edited: `id` once it's saved; `key` tells rows apart before then. */
type TagDraft = { key: string; id?: string; name: string };

/** A forum's tags: rename, remove, add (saved with the channel). */
function TagEditor({ tags, onChange }: { tags: TagDraft[]; onChange: (tags: TagDraft[]) => void }) {
  const [adding, setAdding] = useState("");
  const addId = useId();
  const name = cleanTagName(adding);
  const taken = tags.some((t) => cleanTagName(t.name).toLowerCase() === name.toLowerCase());
  const full = tags.length >= MAX_FORUM_TAGS;

  function add() {
    if (!name || taken || full) return;
    onChange([...tags, { key: `new-${Date.now()}-${tags.length}`, name }]);
    setAdding("");
  }

  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">Tags</legend>
      <p className="mb-2 text-xs text-muted">
        Members pick up to 5 for each post, and filter posts by them. Removing one takes it off every post.
      </p>
      {tags.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {tags.map((tag) => (
            <li key={tag.key} className="flex items-center gap-2">
              <Input
                size="sm"
                aria-label="Tag name"
                maxLength={MAX_TAG_NAME_LENGTH}
                value={tag.name}
                onChange={(event) => onChange(tags.map((t) => (t.key === tag.key ? { ...t, name: event.target.value } : t)))}
              />
              <button
                type="button"
                onClick={() => onChange(tags.filter((t) => t.key !== tag.key))}
                aria-label={`Remove the ${tag.name || "unnamed"} tag`}
                title="Remove tag"
                className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-danger"
              >
                <Trash className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <label htmlFor={addId} className="sr-only">
          New tag
        </label>
        <Input
          id={addId}
          size="sm"
          maxLength={MAX_TAG_NAME_LENGTH}
          placeholder={full ? `Up to ${MAX_FORUM_TAGS} tags` : "New tag, e.g. Question"}
          disabled={full}
          value={adding}
          onChange={(event) => setAdding(event.target.value)}
          onKeyDown={(event) => {
            // Enter adds the tag rather than saving the channel.
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!name || taken || full}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-40"
        >
          <Plus aria-hidden className="size-4" />
          Add
        </button>
      </div>
      {name && taken && <p className="mt-1 text-xs text-muted">There&apos;s already a tag called “{name}”.</p>}
    </fieldset>
  );
}

function ChannelForm({
  groupId: initialGroupId,
  channel,
  groups,
  onClose,
  onSaveChannel,
  onDeleteChannel,
  onMoveChannel,
  onCreated,
}: Actions & { groupId: string; channel?: Subgroup }) {
  const [groupId, setGroupId] = useState(initialGroupId);
  const group = groups.find((g) => g.id === groupId);
  // The live version (it may have moved since the dialog opened).
  const current = channel && groups.flatMap((g) => g.subgroups).find((s) => s.id === channel.id);
  const [name, setName] = useState(channel?.name ?? "");
  const [topic, setTopic] = useState(channel?.topic ?? "");
  const [type, setType] = useState<GroupType>(channel?.type ?? "text");
  const [category, setCategory] = useState(channel?.category ?? "");
  const [slowMode, setSlowMode] = useState(channel?.slowMode ?? 0);
  const slowModeId = useId();
  const [disappearAfter, setDisappearAfter] = useState(channel?.disappearAfter ?? 0);
  const [tags, setTags] = useState<TagDraft[]>(() => (channel?.tags ?? []).map((t) => ({ key: t.id, id: t.id, name: t.name })));
  /** Who a private channel lets in; null while it's public. */
  const [access, setAccess] = useState<ChannelAccess | null>(channel?.access ?? null);
  const disappearId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const ids = { name: useId(), topic: useId(), type: useId(), category: useId(), group: useId() };
  const cleaned = cleanChannelName(name);
  // Empty categories too: a channel can be the first one in.
  const categories = group ? categoryOrder(group) : [];

  if (!group) return <p className="text-sm text-muted">This group no longer exists.</p>;

  if (channel && confirming) {
    return (
      <DeleteConfirm
        what={`#${channel.name}`}
        consequence="All of its messages, threads, pins and its page will be deleted for everyone."
        onCancel={() => setConfirming(false)}
        onDelete={async () => {
          const failure = await onDeleteChannel(channel.id);
          if (!failure) onClose();
          return failure;
        }}
      />
    );
  }

  async function submit() {
    if (!cleaned || !group) return setError("Channel names need at least one letter or number.");
    setBusy(true);
    setError(undefined);
    const draft = {
      groupId: group.id,
      name: cleaned,
      type,
      topic: topic.trim(),
      category: category.trim(),
      slowMode,
      disappearAfter,
      // Sent when it's private, or when it was (making it public); not for a new public channel.
      ...((access || channel?.access) && { access }),
      // Only a forum's; another type keeps whatever it had.
      ...(type === "forum" && {
        tags: tags.flatMap((t) => {
          const name = cleanTagName(t.name);
          return name ? [{ ...(t.id && { id: t.id }), name }] : [];
        }),
      }),
    };
    const result = await onSaveChannel(draft, channel?.id);
    if (!result.ok) {
      setBusy(false);
      return setError(result.error);
    }
    // Saving edits the channel where it is; a new group is a move (to the end of its section).
    if (channel && group.id !== channel.groupId) {
      const move = moveChannel(groups, channel.id, group.id, draft.category || undefined, null);
      const failure = move ? await onMoveChannel(move) : "That group no longer exists.";
      if (failure) {
        setBusy(false);
        return setError(failure);
      }
    }
    setBusy(false);
    onClose();
    if (!channel) onCreated(result.id);
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="space-y-4"
    >
      <Field
        label="Group"
        htmlFor={ids.group}
        hint={channel && groupId !== channel.groupId ? "Saving moves it to the end of that group." : undefined}
      >
        <Select
          id={ids.group}
          value={groupId}
          onChange={(next) => {
            if (next) setGroupId(next);
          }}
          options={groups.map((g) => ({ value: g.id, label: g.name }))}
        />
      </Field>

      <Field
        label="Name"
        htmlFor={ids.name}
        hint={name && cleaned !== name ? `Shown as #${cleaned || "…"}` : "Letters, numbers, spaces, dashes and underscores."}
      >
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
            #
          </span>
          <Input
            id={ids.name}
            autoFocus
            maxLength={MAX_CHANNEL_NAME_LENGTH}
            placeholder="new-channel"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="pl-7"
          />
        </div>
      </Field>

      <fieldset>
        <legend id={ids.type} className="mb-2 text-sm font-medium">
          Type
        </legend>
        <Radio.Group
          type="button"
          orientation="vertical"
          value={type}
          onChange={setType}
          aria-labelledby={ids.type}
          className="gap-1.5"
        >
          {TYPES.map((option) => (
            <Radio
              key={option.type}
              value={option.type}
              icon={<ChannelIcon type={option.type} className="size-4 text-muted group-data-checked:text-accent-bright" />}
              description={option.description}
            >
              {option.label}
            </Radio>
          ))}
        </Radio.Group>
        {channel && type !== (channel.type ?? "text") && (
          <p className="mt-2 text-xs text-muted">Existing messages stay. A wiki&apos;s page is kept if you switch back.</p>
        )}
      </fieldset>

      <Field label="Topic" htmlFor={ids.topic} optional hint="Shown under the channel name.">
        <Input
          id={ids.topic}
          maxLength={MAX_TOPIC_LENGTH}
          placeholder="What's this channel for?"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
        />
      </Field>

      <Field label="Category" htmlFor={ids.category} optional hint="Groups channels into a section in the sidebar.">
        <Select
          type="autocomplete"
          id={ids.category}
          maxLength={MAX_CATEGORY_LENGTH}
          placeholder={categories[0] ? `e.g. ${categories[0]}` : "e.g. Projects"}
          value={category}
          onChange={setCategory}
          options={categories.map((c) => ({ value: c, label: c }))}
        />
      </Field>

      <Field label="Slow mode" htmlFor={slowModeId} hint="How long each member waits between messages. Moderators and up aren't limited.">
        <Select
          id={slowModeId}
          value={String(slowMode)}
          onChange={(value) => setSlowMode(Number(value ?? 0))}
          options={SLOW_MODES.map((seconds) => ({
            value: String(seconds),
            label: seconds === 0 ? "Off" : formatSlowMode(seconds),
          }))}
        />
      </Field>

      <Field
        label="Disappearing messages"
        htmlFor={disappearId}
        hint="Messages, with their threads, are deleted for everyone once they're this old. Turning it on applies to messages already here too."
      >
        <Select
          id={disappearId}
          value={String(disappearAfter)}
          onChange={(value) => setDisappearAfter(Number(value ?? 0))}
          options={DISAPPEAR_TIMES.map((seconds) => ({
            value: String(seconds),
            label: seconds === 0 ? "Off" : `After ${formatDisappear(seconds)}`,
          }))}
        />
      </Field>
      {channel && !channel.disappearAfter && disappearAfter > 0 && (
        <p role="note" className="-mt-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
          Messages in #{channel.name} older than {formatDisappear(disappearAfter)} will be deleted within a minute of
          saving, and can&apos;t be brought back.
        </p>
      )}

      {group.kind !== "dm" && <ChannelPrivacy group={group} value={access} onChange={setAccess} />}

      {type === "forum" && <TagEditor tags={tags} onChange={setTags} />}

      {channel && current && current.type !== "wiki" && <WebhookManager subgroupId={channel.id} />}

      {current && current.groupId === groupId && (
        <Position
          label={current.category ? `Position in ${current.category}` : "Position in the group"}
          canStep={(step) => stepChannel(groups, current, step) !== null}
          onStep={async (step) => {
            const move = stepChannel(groups, current, step);
            return move ? onMoveChannel(move) : undefined;
          }}
        />
      )}

      <FormFooter
        error={error}
        busy={busy}
        submitLabel={channel ? "Save" : "Create channel"}
        canSubmit={Boolean(cleaned)}
        onCancel={onClose}
        onDelete={channel ? () => setConfirming(true) : undefined}
        deleteLabel="Delete channel"
      />
    </form>
  );
}

function FormFooter({
  error,
  busy,
  submitLabel,
  canSubmit,
  onCancel,
  onDelete,
  deleteLabel,
}: {
  error?: string;
  busy: boolean;
  submitLabel: string;
  canSubmit: boolean;
  onCancel: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-danger hover:bg-danger/10"
          >
            <Trash aria-hidden className="size-4" />
            {deleteLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !canSubmit}
          className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </>
  );
}

/** Second step of deleting: spells out what's lost; optionally asks to type a name. */
function DeleteConfirm({
  what,
  consequence,
  confirmText,
  onCancel,
  onDelete,
}: {
  what: string;
  consequence: ReactNode;
  /** When set, the delete button stays disabled until this is typed. */
  confirmText?: string;
  onCancel: () => void;
  onDelete: () => Promise<string | undefined>;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inputId = useId();
  const confirmed = !confirmText || typed.trim() === confirmText;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Delete <span className="font-semibold">{what}</span>?
      </p>
      <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
        {consequence} You can&apos;t undo this.
      </p>
      {confirmText && (
        <Field label={`Type "${confirmText}" to confirm`} htmlFor={inputId}>
          <Input id={inputId} autoFocus autoComplete="off" value={typed} onChange={(event) => setTyped(event.target.value)} />
        </Field>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground"
        >
          Back
        </button>
        <button
          type="button"
          autoFocus={!confirmText}
          disabled={busy || !confirmed}
          onClick={async () => {
            setBusy(true);
            const failure = await onDelete();
            setBusy(false);
            setError(failure);
          }}
          className="h-9 rounded-lg bg-danger-strong px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
