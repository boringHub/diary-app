const KEY = 'shiguangjian.settings.v1';
const defaults = {
    notificationEnabled: true,
    notificationEmail: '',
    appearance: 'light',
    themeName: '记忆星空',
};
function read() {
    const value = localStorage.getItem(KEY);
    if (!value)
        return defaults;
    try {
        const settings = { ...defaults, ...JSON.parse(value) };
        if (settings.themeName === '简约浅色') {
            settings.themeName = defaults.themeName;
            localStorage.setItem(KEY, JSON.stringify(settings));
        }
        return settings;
    }
    catch {
        return defaults;
    }
}
export const settingsRepository = {
    get() {
        return read();
    },
    update(patch) {
        const settings = { ...read(), ...patch };
        localStorage.setItem(KEY, JSON.stringify(settings));
        return settings;
    },
};
