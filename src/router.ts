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
    { path: '/tarot', component: () => import('./features/tarot/pages/HomePage.vue'), meta: { hideBottomNav: true } },
    { path: '/tarot/new', component: () => import('./features/tarot/pages/QuestionPage.vue'), meta: { hideBottomNav: true } },
    { path: '/tarot/history', component: () => import('./features/tarot/pages/HistoryPage.vue'), meta: { hideBottomNav: true } },
    { path: '/tarot/settings', component: () => import('./features/tarot/pages/SettingsPage.vue'), meta: { hideBottomNav: true } },
    { path: '/tarot/:id/ritual', component: () => import('./features/tarot/pages/RitualPage.vue'), meta: { hideBottomNav: true } },
    { path: '/tarot/:id/chat', component: () => import('./features/tarot/pages/ChatPage.vue'), meta: { hideBottomNav: true } },
  ],
})
