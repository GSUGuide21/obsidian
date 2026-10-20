import { randomInt } from "./random.ts";

export const choice = <T>(arr: T[]): T => {
  return arr[randomInt(0, arr.length)];
};
