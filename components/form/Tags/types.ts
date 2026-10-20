export type TagsProps = {
    value?: string[];
    defaultValue?: string[];
    onChange?: (value: string[]) => void;
    /** Submits with a form: one hidden input per tag, under this name. */
    name?: string;
    placeholder?: string;
    disabled?: boolean;
    /** The most tags allowed. */
    max?: number;
    /** The longest a tag can be. */
    maxLength?: number;
    /** Change a typed tag before it's added (e.g. lowercase it); return "" to refuse it. */
    normalize?: (tag: string) => string;
    /** Keep a tag that's already there. Default false. */
    allowDuplicates?: boolean;
    id?: string;
    className?: string;
    "aria-label"?: string;
    "aria-labelledby"?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
};
