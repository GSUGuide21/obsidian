import Avatar from "@/components/chat/GroupList/Group/Avatar";
import type { User } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

type MentionMenuProps = {
  id: string;
  users: User[];
  activeIndex: number;
  onPick: (user: User) => void;
  onHover: (index: number) => void;
};

export const mentionOptionId = (menuId: string, index: number) => `${menuId}-option-${index}`;

export default function MentionMenu({ id, users, activeIndex, onPick, onHover }: MentionMenuProps) {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label="Mention someone"
      className="absolute right-0 bottom-full left-0 z-20 mb-2 max-w-xs rounded-xl border border-border bg-surface p-1 shadow-xl"
    >
      {users.map((user, index) => (
        <li
          key={user.id}
          id={mentionOptionId(id, index)}
          role="option"
          aria-selected={index === activeIndex}
          // Keep focus in the textarea while picking with the mouse.
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(user);
          }}
          onMouseEnter={() => onHover(index)}
          className={cn(
            "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm",
            index === activeIndex && "bg-surface-2",
          )}
        >
          <Avatar name={user.name} color={user.color} src={user.avatarUrl} size="sm" status={user.status} />
          <span className="truncate">{user.name}</span>
        </li>
      ))}
    </ul>
  );
}
