import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { diaryRepository } from '../repositories/diaryRepository'
import type { SaveDiaryInput } from '../repositories/diaryRepository'
import type { Diary, Mood } from '../types/diary'

export const useDiaryStore = defineStore('diary', () => {
  const items = ref<Diary[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const diaries = computed(() => items.value)
  let loadPromise: Promise<void> | undefined

  async function refresh() {
    loading.value = true
    error.value = null
    try {
      items.value = await diaryRepository.list()
      loaded.value = true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      throw cause
    } finally {
      loading.value = false
    }
  }

  function ensureLoaded() {
    if (loaded.value) return Promise.resolve()
    loadPromise ??= refresh().finally(() => { loadPromise = undefined })
    return loadPromise
  }

  async function save(input: SaveDiaryInput) {
    saving.value = true
    error.value = null
    try {
      const item = await diaryRepository.save(input)
      await refresh()
      return item
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      throw cause
    } finally {
      saving.value = false
    }
  }

  async function toggleFavorite(id: string) {
    await diaryRepository.toggleFavorite(id)
    await refresh()
  }

  async function remove(id: string) {
    await diaryRepository.remove(id)
    await refresh()
  }

  function get(id: string) {
    return items.value.find((item) => item.id === id)
  }
  function createDraft() {
    return { title: '', body: '', mood: 'calm' as Mood }
  }

  return { diaries, loaded, loading, saving, error, ensureLoaded, refresh, save, toggleFavorite, remove, get, createDraft }
})
