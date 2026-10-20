function range(end: number): Generator<number, void>;
function range(start: number, end: number, step?: number): Generator<number, void>;
function range(startOrEnd: number, end?: number, step?: number): Generator<number, void> {
    const start = end === undefined ? 0 : startOrEnd;
    const stop = end === undefined ? startOrEnd : end;
    const increment = step ?? (stop < start ? -1 : 1);

    if (increment === 0 || !Number.isFinite(increment)) 
        throw new RangeError(`range() step must be a finite, non-zero number (got ${increment}).`);

    function* generator() {
        for (let value = start; increment > 0 ? value < stop : value > stop; value += increment) {
            yield value;
        }
    }

    return generator();
}

export { range };
export default range;
