/**
 * "star" and "heart": 1 to `max` (halves too, with `useDecimal`).
 * "thumb": thumbs up (1) or down (-1).
 */
export type RatingType =
    | "star"
    | "heart"
    | "thumb"

export type RatingProps = {
    type?: RatingType
    /** Stars and hearts: allow halves. Default false. */
    useDecimal?: boolean
    /** `null` for no rating yet. */
    value?: number | null
    defaultValue?: number | null
    onChange?: (value: number | null) => void
    /** Stars and hearts: how many. Default 5. */
    max?: number
    /** Show the rating without letting it change. */
    readOnly?: boolean
    disabled?: boolean
    /** Submits with a form under this name. */
    name?: string
    id?: string
    className?: string
    "aria-label"?: string
    "aria-labelledby"?: string
}
