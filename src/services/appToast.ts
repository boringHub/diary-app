import { reactive } from 'vue'

export interface AppToastItem {
  id: number
  message: string
}

export const appToasts = reactive<AppToastItem[]>([])

let nextToastId = 1

export function showAppToast(message: string, duration = 2200) {
  const item = { id: nextToastId++, message }
  appToasts.push(item)

  if (duration > 0) {
    setTimeout(() => dismissAppToast(item.id), duration)
  }
}

export function dismissAppToast(id: number) {
  const index = appToasts.findIndex((item) => item.id === id)
  if (index >= 0) appToasts.splice(index, 1)
}
