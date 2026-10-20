export const random = (min: number, max: number, inclusive: boolean = false) => {
    const range = (max - min) + Number(inclusive);
    return (Math.random() * range) + min;
};

export const randomInt = (min: number, max: number, inclusive: boolean = false) => {
    return Math.floor(random(min, max, inclusive));
};