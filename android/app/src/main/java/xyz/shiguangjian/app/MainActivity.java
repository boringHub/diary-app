package xyz.shiguangjian.app;

import android.os.Bundle;
import android.content.res.Configuration;

import androidx.activity.EdgeToEdge;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private AppAppearance appearance;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.AppTheme_NoActionBar);
        EdgeToEdge.enable(this);
        appearance = new AppAppearance(this);
        appearance.apply(null);
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(DeviceKeyAuthPlugin.class);
        registerPlugin(AppAppearancePlugin.class);
        super.onCreate(savedInstanceState);
        restoreAppearance();
    }

    @Override
    public void onResume() {
        super.onResume();
        restoreAppearance();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        restoreAppearance();
    }

    void updateAppearance(String color, String themeColor) {
        appearance.update(color, themeColor);
        applyAppearance();
    }

    private void applyAppearance() {
        if (appearance != null) appearance.apply(bridge == null ? null : bridge.getWebView());
    }

    private void restoreAppearance() {
        applyAppearance();
        // Capacitor SystemBars posts its own initialization/style update to the UI
        // queue and restores the XML window color. Reapply after that queued work.
        getWindow().getDecorView().post(this::applyAppearance);
    }
}
