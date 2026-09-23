import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { diaryRepository } from '../repositories/diaryRepository'
import type { Diary, Mood } from '../types/diary'

export const useDiaryStore = defineStore('diary', () => {
  const items = ref<Diary[]>([])
  const loaded = ref(false)
  const diaries = computed(() => items.value)

  function refresh() {
    items.value = diaryRepository.list()
    loaded.value = true
  }
  function ensureLoaded() {
    if (!loaded.value) refresh()
  }
  function save(input: Pick<Diary, 'title' | 'body' | 'mood'> & { id?: string }) {
    const item = diaryRepository.save(input)
    refresh()
    return item
  }
  function toggleFavorite(id: string) {
    diaryRepository.toggleFavorite(id)
    refresh()
  }
  function remove(id: string) {
    diaryRepository.remove(id)
    refresh()
  }
  function get(id: string) {
    ensureLoaded()
    return items.value.find((item) => item.id === id)
  }
  function createDraft() {
    return { title: '', body: '', mood: 'calm' as Mood }
  }

  return { diaries, loaded, ensureLoaded, refresh, save, toggleFavorite, remove, get, createDraft }
})
