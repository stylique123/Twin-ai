import { clsx, type ClassValue } from 'clsx'

// Tiny className combiner used across the redesigned UI.
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}
