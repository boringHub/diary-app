import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { diaryRepository } from '../repositories/diaryRepository';
export const useDiaryStore = defineStore('diary', () => {
    const items = ref([]);
    const loaded = ref(false);
    const diaries = computed(() => items.value);
    function refresh() {
        items.value = diaryRepository.list();
        loaded.value = true;
    }
    function ensureLoaded() {
        if (!loaded.value)
            refresh();
    }
    function save(input) {
        const item = diaryRepository.save(input);
        refresh();
        return item;
    }
    function toggleFavorite(id) {
        diaryRepository.toggleFavorite(id);
        refresh();
    }
    function remove(id) {
        diaryRepository.remove(id);
        refresh();
    }
    function get(id) {
        ensureLoaded();
        return items.value.find((item) => item.id === id);
    }
    function createDraft() {
        return { title: '', body: '', mood: 'calm' };
    }
    return { diaries, loaded, ensureLoaded, refresh, save, toggleFavorite, remove, get, createDraft };
});
