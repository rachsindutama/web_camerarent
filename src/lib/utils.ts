import { clsx, type ClassValue } from 'clsx';
import { format } from 'date-fns';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTime(date: Date | number | { toDate: () => Date } | null | undefined): string {
  if (!date) return '—';
  const resolved = typeof date === 'object' && 'toDate' in date ? date.toDate() : new Date(date);
  return format(resolved, 'dd MMM yyyy, HH:mm');
}

export function formatDateShort(date: Date | number | { toDate: () => Date } | null | undefined): string {
  if (!date) return '—';
  const resolved = typeof date === 'object' && 'toDate' in date ? date.toDate() : new Date(date);
  return format(resolved, 'dd MMM yyyy');
}

export function getInitials(name?: string | null): string {
  if (!name) return 'OP';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

