import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

export function fmtMs(ms: number) {
  return `${ms}ms`;
}

export function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}
