import type { ReactNode } from "react";

export type FileAcceptMode =
    | "image"
    | "video"
    | "audio"
    | "media"
    | "document"
    | "archive"
    | "all"

/** Why a file wasn't taken. */
export type FileRejection = {
    file: File;
    reason: "type" | "size" | "count";
};

export type FileInputProps = {
    /** What kinds of files to take (one mode, or several). Default "all". */
    accept?: FileAcceptMode | FileAcceptMode[];
    /** Take several files. Default false (a new file replaces the old). */
    multiple?: boolean;
    /** The largest file allowed, in bytes. */
    maxSize?: number;
    /** With `multiple`: the most files allowed. */
    maxFiles?: number;
    value?: File[];
    defaultValue?: File[];
    onChange?: (files: File[]) => void;
    /** Files that were dropped or picked but not taken, and why. */
    onReject?: (rejections: FileRejection[]) => void;
    /** Submits the files with a form (which needs encType="multipart/form-data"). */
    name?: string;
    required?: boolean;
    disabled?: boolean;
    /** The drop zone's text. Default: "Drop files here or browse". */
    children?: ReactNode;
    id?: string;
    className?: string;
    "aria-label"?: string;
    "aria-labelledby"?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
};
