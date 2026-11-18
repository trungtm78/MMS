import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import i18n from '@/i18n'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('vi-VN')
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('vi-VN')
}

export function formatMonth(month: number, year: number): string {
  return i18n.t('ui.dates.month.label', { month, year })
}
