import type { ComponentPropsWithRef } from "react";

export type SortableProps = Omit<ComponentPropsWithRef<"ul">, "onChange"> & {
    /** The items' ids, in order. Each needs a <Sortable.Item id> among the children. */
    items: string[];
    /** The new order, as soon as an item moves (while dragging, too). */
    onChange: (items: string[]) => void;
    disabled?: boolean;
};

export type SortableItemProps = Omit<ComponentPropsWithRef<"li">, "id"> & {
    id: string;
    /** Names the item to screen readers: in its handle ("Reorder …") and in what's announced. */
    label: string;
    disabled?: boolean;
};

export type SortableContextType = {
    items: string[];
    /** Move the item to position `to` (0-based). */
    move: (id: string, to: number) => void;
    /** Each item's element, to find where a dragged item is over. */
    register: (id: string, element: HTMLElement | null) => void;
    elementOf: (id: string) => HTMLElement | undefined;
    /** The item being dragged by pointer. */
    dragging: string | null;
    setDragging: (id: string | null) => void;
    /** Read out to screen readers. */
    announce: (text: string) => void;
    /** The id of the text explaining the keys. */
    instructionsId: string;
    disabled: boolean;
};
