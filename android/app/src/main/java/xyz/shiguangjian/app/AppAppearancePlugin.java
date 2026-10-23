package xyz.shiguangjian.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppAppearance")
public class AppAppearancePlugin extends Plugin {
    @PluginMethod
    public void apply(PluginCall call) {
        String color = call.getString("backgroundColor");
        String themeColor = call.getString("themeBackgroundColor");
        if (!AppAppearance.isValidColor(color) || !AppAppearance.isValidColor(themeColor)) {
            call.reject("Appearance colors must use #RRGGBB");
            return;
        }
        getBridge().executeOnMainThread(() -> {
            ((MainActivity) getActivity()).updateAppearance(color, themeColor);
            call.resolve();
        });
    }
}
