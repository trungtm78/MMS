import { useState } from 'react'
import type { AppRoute } from '@/types/routes'

export function useFavorites(userId: string) {
  const KEY = `mms-favorites-${userId}`

  const [favorites, setFavorites] = useState<AppRoute[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '[]') as AppRoute[]
    } catch {
      return []
    }
  })

  const persist = (next: AppRoute[]) => {
    localStorage.setItem(KEY, JSON.stringify(next))
    setFavorites(next)
  }

  return {
    favorites,
    isFavorite: (r: AppRoute) => favorites.includes(r),
    toggle: (r: AppRoute) =>
      persist(favorites.includes(r) ? favorites.filter((x) => x !== r) : [...favorites, r]),
    remove: (r: AppRoute) => persist(favorites.filter((x) => x !== r)),
  }
}
