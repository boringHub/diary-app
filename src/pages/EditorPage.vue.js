import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { alertController, IonContent, IonIcon, IonPage } from '@ionic/vue';
import { chevronBack } from 'ionicons/icons';
import { useDiaryStore } from '../stores/diaryStore';
const router = useRouter();
const route = useRoute();
const store = useDiaryStore();
store.ensureLoaded();
const existing = computed(() => route.params.id ? store.get(String(route.params.id)) : undefined);
const title = ref(existing.value?.title ?? '');
const body = ref(existing.value?.body ?? '');
const mood = ref(existing.value?.mood ?? 'calm');
const moods = ['calm', 'happy', 'sad', 'tired', 'excited'];
const labels = { calm: '平静', happy: '开心', sad: '低落', tired: '疲惫', excited: '期待' };
const isDirty = computed(() => title.value !== (existing.value?.title ?? '') || body.value !== (existing.value?.body ?? '') || mood.value !== (existing.value?.mood ?? 'calm'));
function closeEditor() {
    if (existing.value)
        router.replace(`/diary/${existing.value.id}`);
    else
        router.replace('/timeline');
}
async function cancel() {
    if (!isDirty.value)
        return closeEditor();
    const alert = await alertController.create({
        header: '放弃这次编辑？',
        message: '尚未保存的内容会丢失。',
        buttons: [
            { text: '继续编辑', role: 'cancel' },
            { text: '放弃', role: 'destructive', handler: closeEditor },
        ],
    });
    await alert.present();
}
function save() {
    const item = store.save({ id: existing.value?.id, title: title.value.trim(), body: body.value.trim(), mood: mood.value });
    router.replace(`/diary/${item.id}`);
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "screen editor-screen" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "subbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.cancel) },
    ...{ class: "icon-button" },
    'aria-label': "返回",
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
(__VLS_ctx.existing ? '编辑日记' : '新建日记');
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.save) },
    ...{ class: "text-button" },
    disabled: (!__VLS_ctx.body.trim() || !__VLS_ctx.isDirty),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "editor-paper" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ class: "title-input" },
    placeholder: "给今天取个标题",
    maxlength: "50",
});
(__VLS_ctx.title);
__VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
    value: (__VLS_ctx.body),
    ...{ class: "body-input" },
    placeholder: "写下此刻的心情、看到的风景，或者一句还没说出口的话……",
    autofocus: true,
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "editor-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.body.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mood-section" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "section-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mood-picker" },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.moods))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.mood = item;
            } },
        key: (item),
        ...{ class: ({ selected: __VLS_ctx.mood === item }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "mood-dot" },
        ...{ class: (item) },
    });
    (__VLS_ctx.labels[item]);
}
var __VLS_8;
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['screen']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-screen']} */ ;
/** @type {__VLS_StyleScopedClasses['subbar']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['text-button']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-paper']} */ ;
/** @type {__VLS_StyleScopedClasses['title-input']} */ ;
/** @type {__VLS_StyleScopedClasses['body-input']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['mood-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-label']} */ ;
/** @type {__VLS_StyleScopedClasses['mood-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['mood-dot']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            IonContent: IonContent,
            IonIcon: IonIcon,
            IonPage: IonPage,
            chevronBack: chevronBack,
            existing: existing,
            title: title,
            body: body,
            mood: mood,
            moods: moods,
            labels: labels,
            isDirty: isDirty,
            cancel: cancel,
            save: save,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
