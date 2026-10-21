"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Tags, Trash } from "lucide-react";
import Checkbox from "@/components/form/Checkbox";
import Field from "@/components/form/Field";
import Input from "@/components/form/Input";
import {
  AVATAR_COLORS,
  MAX_GROUP_ROLES,
  MAX_ROLE_NAME_LENGTH,
  ROLE_PERMISSION_LABELS,
  ROLE_PERMISSIONS_GRANTABLE,
  type GroupRole,
  type GroupRoleDraft,
  type RolePermission,
} from "@/lib/chat/types";
import { cn } from "@/lib/utils";

/** Resolves to an error message, or undefined on success. */
type Action<A extends unknown[]> = (...args: A) => Promise<string | undefined>;

type RolesSettingsProps = {
  roles: GroupRole[];
  onSave: Action<[draft: GroupRoleDraft, id?: string]>;
  onDelete: Action<[id: string]>;
  onReorder: Action<[order: string[]]>;
};

/** A role's name with its color, as it shows on members. */
export function RoleChip({ role, className }: { role: Pick<GroupRole, "name" | "color">; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-2 px-1.5 py-px text-[11px] font-medium",
        className,
      )}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: role.color }} />
      <span className="truncate">{role.name}</span>
    </span>
  );
}

/**
 * The group's custom roles (admins and up): make them, change their name,
 * color and what they allow, put them in order, and delete them. Members are
 * given roles from their card in the members list.
 */
export default function RolesSettings({ roles, onSave, onDelete, onReorder }: RolesSettingsProps) {
  // The role being edited: "new", or its id.
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  async function run(action: Promise<string | undefined>) {
    setError(undefined);
    const failure = await action;
    setError(failure);
    return failure;
  }

  function move(index: number, by: -1 | 1) {
    const order = roles.map((r) => r.id);
    [order[index], order[index + by]] = [order[index + by], order[index]];
    void run(onReorder(order));
  }

  return (
    <section aria-label="Roles" className="space-y-4">
      <p className="text-xs text-muted">
        Roles add permissions on top of someone&apos;s rank (owner, admin, moderator or member), which still decides who
        can act on whom: powers over others from a role only reach plain members. A member&apos;s first role in this list
        shows beside their name.
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {roles.length === 0 && editing !== "new" ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <Tags aria-hidden className="mx-auto mb-2 size-6 text-muted" />
          <p className="text-sm font-medium">No roles yet</p>
          <p className="mt-1 text-xs text-muted">Make one, like “Helpers” who can pin messages and mute spammers.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {roles.map((role, index) =>
            editing === role.id ? (
              <li key={role.id} className="p-3">
                <RoleForm
                  role={role}
                  roles={roles}
                  onCancel={() => setEditing(null)}
                  onSave={async (draft) => {
                    const failure = await run(onSave(draft, role.id));
                    if (!failure) setEditing(null);
                    return failure;
                  }}
                />
              </li>
            ) : (
              <li key={role.id} className="flex items-center gap-3 px-3 py-2.5">
                <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: role.color }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{role.name}</p>
                  <p className="truncate text-xs text-muted">
                    {role.permissions.length
                      ? role.permissions.map((p) => ROLE_PERMISSION_LABELS[p].label).join(", ")
                      : "Just a label: no extra permissions"}
                  </p>
                </div>
                {confirming === role.id ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="text-xs text-muted">Delete it?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirming(null);
                        void run(onDelete(role.id));
                      }}
                      className="h-7 rounded-md bg-danger-strong px-2 text-xs font-medium text-white hover:opacity-90"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="h-7 rounded-md px-2 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground"
                    >
                      Keep
                    </button>
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center">
                    <IconButton label={`Move ${role.name} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton label={`Move ${role.name} down`} disabled={index === roles.length - 1} onClick={() => move(index, 1)}>
                      <ArrowDown className="size-4" />
                    </IconButton>
                    <IconButton label={`Edit ${role.name}`} onClick={() => setEditing(role.id)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton label={`Delete ${role.name}`} danger onClick={() => setConfirming(role.id)}>
                      <Trash className="size-4" />
                    </IconButton>
                  </span>
                )}
              </li>
            ),
          )}
          {editing === "new" && (
            <li className="p-3">
              <RoleForm
                roles={roles}
                onCancel={() => setEditing(null)}
                onSave={async (draft) => {
                  const failure = await run(onSave(draft));
                  if (!failure) setEditing(null);
                  return failure;
                }}
              />
            </li>
          )}
        </ul>
      )}

      {editing !== "new" && (
        <button
          type="button"
          disabled={roles.length >= MAX_GROUP_ROLES}
          onClick={() => {
            setError(undefined);
            setEditing("new");
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Plus aria-hidden className="size-4" />
          New role
        </button>
      )}
      {roles.length >= MAX_GROUP_ROLES && (
        <p className="text-xs text-muted">A group can have up to {MAX_GROUP_ROLES} roles.</p>
      )}
    </section>
  );
}

/** Making or changing one role. */
function RoleForm({
  role,
  roles,
  onSave,
  onCancel,
}: {
  role?: GroupRole;
  roles: GroupRole[];
  onSave: (draft: GroupRoleDraft) => Promise<string | undefined>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  // New roles get a color no other role has yet, if there's one left.
  const [color, setColor] = useState(
    role?.color ?? AVATAR_COLORS.find((c) => !roles.some((r) => r.color === c)) ?? AVATAR_COLORS[0],
  );
  const [permissions, setPermissions] = useState<Set<RolePermission>>(new Set(role?.permissions));
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const trimmed = name.trim();

  function toggle(permission: RolePermission, on: boolean) {
    setPermissions((current) => {
      const next = new Set(current);
      if (on) next.add(permission);
      else next.delete(permission);
      return next;
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!trimmed || busy) return;
        setBusy(true);
        // Kept in the order they're offered.
        await onSave({ name: trimmed, color, permissions: ROLE_PERMISSIONS_GRANTABLE.filter((p) => permissions.has(p)) });
        setBusy(false);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field label="Name" htmlFor={nameId}>
          <Input
            id={nameId}
            autoFocus
            value={name}
            maxLength={MAX_ROLE_NAME_LENGTH}
            onChange={(event) => setName(event.target.value)}
            placeholder="Helpers"
          />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Color</legend>
          <div className="flex flex-wrap gap-1.5">
            {AVATAR_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                aria-pressed={swatch === color}
                onClick={() => setColor(swatch)}
                className={cn(
                  "size-7 rounded-full ring-offset-2 ring-offset-surface transition-shadow",
                  swatch === color ? "ring-2 ring-foreground" : "hover:ring-2 hover:ring-border",
                )}
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
        </fieldset>
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">What it allows</legend>
        <p className="mb-2 text-xs text-muted">On top of what their rank already allows.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLE_PERMISSIONS_GRANTABLE.map((permission) => (
            <Checkbox
              key={permission}
              checked={permissions.has(permission)}
              onChange={(on) => toggle(permission, on)}
              description={ROLE_PERMISSION_LABELS[permission].description}
            >
              {ROLE_PERMISSION_LABELS[permission].label}
            </Checkbox>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto">{trimmed && <RoleChip role={{ name: trimmed, color }} />}</span>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!trimmed || busy}
          className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : role ? "Save role" : "Make role"}
        </button>
      </div>
    </form>
  );
}

function IconButton({
  label,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent",
        danger ? "hover:text-danger" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
