// Class-name composition: `clsx` for conditionals, `tailwind-merge` so a
// caller's `className` overrides a primitive's default instead of both
// landing in the output.

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: readonly ClassValue[]): string {
  return twMerge(clsx(inputs));
}
