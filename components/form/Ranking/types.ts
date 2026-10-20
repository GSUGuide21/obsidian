export type RankingOption = {
    value: string;
    label: string;
    /** A second, quieter line. */
    description?: string;
};

export type RankingProps = {
    options: RankingOption[];
    /** The options' values, best first. Default: the options' order. */
    value?: string[];
    defaultValue?: string[];
    onChange?: (value: string[]) => void;
    /** Submits with a form: one hidden input per option, in rank order, under this name. */
    name?: string;
    disabled?: boolean;
    id?: string;
    className?: string;
    "aria-label"?: string;
    "aria-labelledby"?: string;
};
