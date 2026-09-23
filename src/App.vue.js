import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDiaryStore } from './stores/diaryStore';
import { IonApp, IonIcon, IonRouterOutlet } from '@ionic/vue';
import { add, bookOutline, settingsOutline } from 'ionicons/icons';
const route = useRoute();
const router = useRouter();
const store = useDiaryStore();
store.ensureLoaded();
const nav = [
    { path: '/timeline', label: '日记', icon: bookOutline },
    { path: '/settings', label: '设置', icon: settingsOutline },
];
const showTabBar = computed(() => !route.path.startsWith('/diary/'));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
const __VLS_0 = {}.IonApp;
/** @type {[typeof __VLS_components.IonApp, typeof __VLS_components.IonApp, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
const __VLS_5 = {}.IonRouterOutlet;
/** @type {[typeof __VLS_components.IonRouterOutlet, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({}));
const __VLS_7 = __VLS_6({}, ...__VLS_functionalComponentArgsRest(__VLS_6));
if (__VLS_ctx.showTabBar) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
        ...{ class: "floating-nav" },
        'aria-label': "主导航",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showTabBar))
                    return;
                __VLS_ctx.router.push(__VLS_ctx.nav[0].path);
            } },
        ...{ class: "nav-action" },
        ...{ class: ({ active: __VLS_ctx.route.path.startsWith(__VLS_ctx.nav[0].path) }) },
    });
    const __VLS_9 = {}.IonIcon;
    /** @type {[typeof __VLS_components.IonIcon, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
        icon: (__VLS_ctx.nav[0].icon),
    }));
    const __VLS_11 = __VLS_10({
        icon: (__VLS_ctx.nav[0].icon),
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.nav[0].label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showTabBar))
                    return;
                __VLS_ctx.router.push('/diary/new');
            } },
        ...{ class: "nav-create" },
        'aria-label': "新建日记",
    });
    const __VLS_13 = {}.IonIcon;
    /** @type {[typeof __VLS_components.IonIcon, ]} */ ;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
        icon: (__VLS_ctx.add),
    }));
    const __VLS_15 = __VLS_14({
        icon: (__VLS_ctx.add),
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showTabBar))
                    return;
                __VLS_ctx.router.push(__VLS_ctx.nav[1].path);
            } },
        ...{ class: "nav-action" },
        ...{ class: ({ active: __VLS_ctx.route.path.startsWith(__VLS_ctx.nav[1].path) }) },
    });
    const __VLS_17 = {}.IonIcon;
    /** @type {[typeof __VLS_components.IonIcon, ]} */ ;
    // @ts-ignore
    const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
        icon: (__VLS_ctx.nav[1].icon),
    }));
    const __VLS_19 = __VLS_18({
        icon: (__VLS_ctx.nav[1].icon),
    }, ...__VLS_functionalComponentArgsRest(__VLS_18));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.nav[1].label);
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['floating-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-action']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-create']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-action']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            IonApp: IonApp,
            IonIcon: IonIcon,
            IonRouterOutlet: IonRouterOutlet,
            add: add,
            route: route,
            router: router,
            nav: nav,
            showTabBar: showTabBar,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
