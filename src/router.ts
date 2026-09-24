import { createRouter, createWebHistory } from '@ionic/vue-router'
import TimelinePage from './pages/TimelinePage.vue'
import EditorPage from './pages/EditorPage.vue'
import DetailPage from './pages/DetailPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import ThemesPage from './pages/ThemesPage.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/timeline' },
    { path: '/timeline', component: TimelinePage },
    { path: '/diary/new', component: EditorPage },
    { path: '/diary/:id', component: DetailPage },
    { path: '/diary/:id/edit', component: EditorPage },
    { path: '/themes', component: ThemesPage },
    { path: '/settings', component: SettingsPage },
  ],
})
