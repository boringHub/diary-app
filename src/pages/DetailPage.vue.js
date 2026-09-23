import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { alertController, IonContent, IonIcon, IonPage } from '@ionic/vue';
import { chevronBack, createOutline, heart, heartOutline } from 'ionicons/icons';
import { useDiaryStore } from '../stores/diaryStore';
import { moodLabels } from '../types/diary';
const route = useRoute();
const router = useRouter();
const store = useDiaryStore();
store.ensureLoaded();
const diary = computed(() => store.get(String(route.params.id)));
async function remove() {
    if (!diary.value)
        return;
    const id = diary.value.id;
    const alert = await alertController.create({
        header: '删除这篇日记？',
        message: '日记会从时间线中移除。',
        buttons: [
            { text: '取消', role: 'cancel' },
            { text: '删除', role: 'destructive', handler: () => { store.remove(id); router.replace('/timeline'); } },
        ],
    });
    await alert.present();
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
const __VLS_0 = {}.IonPage;
/** @type {[typeof __VLS_components.IonPage, typeof __VLS_components.IonPage, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
const __VLS_5 = {}.IonContent;
/** @type {[typeof __VLS_components.IonContent, typeof __VLS_components.IonContent, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({}));
const __VLS_7 = __VLS_6({}, ...__VLS_functionalComponentArgsRest(__VLS_6));
__VLS_8.slots.default;
if (__VLS_ctx.diary) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "screen detail-screen" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "subbar" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.diary))
                    return;
                __VLS_ctx.router.replace('/timeline');
            } },
        ...{ class: "icon-button" },
        'aria-label': "返回时间线",
    });
    const __VLS_9 = {}.IonIcon;
    /** @type {[typeof __VLS_components.IonIcon, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
        icon: (__VLS_ctx.chevronBack),
    }));
    const __VLS_11 = __VLS_10({
        icon: (__VLS_ctx.chevronBack),
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.moodLabels[__VLS_ctx.diary.mood]);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.diary))
                    return;
                __VLS_ctx.store.toggleFavorite(__VLS_ctx.diary.id);
            } },
        ...{ class: "icon-button" },
        'aria-label': (__VLS_ctx.diary.isFavorite ? '取消收藏' : '收藏'),
    });
    const __VLS_13 = {}.IonIcon;
    /** @type {[typeof __VLS_components.IonIcon, ]} */ ;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
        icon: (__VLS_ctx.diary.isFavorite ? __VLS_ctx.heart : __VLS_ctx.heartOutline),
    }));
    const __VLS_15 = __VLS_14({
        icon: (__VLS_ctx.diary.isFavorite ? __VLS_ctx.heart : __VLS_ctx.heartOutline),
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.diary))
                    return;
                __VLS_ctx.router.push(`/diary/${__VLS_ctx.diary.id}/edit`);
            } },
        ...{ class: "icon-button" },
        'aria-label': "编辑日记",
    });
    const __VLS_17 = {}.IonIcon;
    /** @type {[typeof __VLS_components.IonIcon, ]} */ ;
    // @ts-ignore
    const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
        icon: (__VLS_ctx.createOutline),
    }));
    const __VLS_19 = __VLS_18({
        icon: (__VLS_ctx.createOutline),
    }, ...__VLS_functionalComponentArgsRest(__VLS_18));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ class: "detail-paper" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "detail-date" },
    });
    (new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full' }).format(__VLS_ctx.diary.updatedAt));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    (__VLS_ctx.diary.title || '无题');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "detail-body" },
    });
    (__VLS_ctx.diary.body);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.remove) },
        ...{ class: "delete-button" },
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "empty-state" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.diary))
                    return;
                __VLS_ctx.router.push('/timeline');
            } },
        ...{ class: "primary-button" },
    });
}
var __VLS_8;
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['screen']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-screen']} */ ;
/** @type {__VLS_StyleScopedClasses['subbar']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-paper']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-date']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-body']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-button']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-button']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            IonContent: IonContent,
            IonIcon: IonIcon,
            IonPage: IonPage,
            chevronBack: chevronBack,
            createOutline: createOutline,
            heart: heart,
            heartOutline: heartOutline,
            moodLabels: moodLabels,
            router: router,
            store: store,
            diary: diary,
            remove: remove,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
