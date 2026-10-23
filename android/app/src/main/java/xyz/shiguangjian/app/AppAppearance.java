package xyz.shiguangjian.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;

import androidx.core.graphics.ColorUtils;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

/** Paints the backing window used by both old padded and new edge-to-edge WebViews. */
final class AppAppearance {
    private static final String THEME_COLOR = "themeBackgroundColor";
    private static final String DEFAULT_COLOR = "#07131f";
    private final Activity activity;
    private final SharedPreferences preferences;
    private String themeBackgroundColor;
    private int backgroundColor;

    AppAppearance(Activity activity) {
        this.activity = activity;
        preferences = activity.getSharedPreferences("app_appearance", Context.MODE_PRIVATE);
        String saved = preferences.getString(THEME_COLOR, DEFAULT_COLOR);
        themeBackgroundColor = isValidColor(saved) ? saved : DEFAULT_COLOR;
        backgroundColor = Color.parseColor(themeBackgroundColor);
    }

    static boolean isValidColor(String color) {
        return color != null && color.matches("#[0-9a-fA-F]{6}");
    }

    void update(String color, String themeColor) {
        backgroundColor = Color.parseColor(color);
        if (!themeColor.equalsIgnoreCase(themeBackgroundColor)) {
            themeBackgroundColor = themeColor;
            preferences.edit().putString(THEME_COLOR, themeColor).apply();
        }
    }

    @SuppressWarnings("deprecation")
    void apply(WebView webView) {
        Window window = activity.getWindow();
        View decor = window.getDecorView();
        window.setBackgroundDrawable(new ColorDrawable(backgroundColor));
        decor.setBackgroundColor(backgroundColor);
        if (webView != null) webView.setBackgroundColor(backgroundColor);

        boolean darkBackground = ColorUtils.calculateLuminance(backgroundColor) < .179;
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
        controller.setAppearanceLightStatusBars(!darkBackground);
        controller.setAppearanceLightNavigationBars(!darkBackground);

        // The app supplies a contrasting background and icons; an extra system scrim
        // would tint that background, especially with three-button navigation.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        window.setStatusBarColor(Color.TRANSPARENT);
        // Android 7 cannot draw dark navigation icons. Preserve their readability.
        window.setNavigationBarColor(
            Build.VERSION.SDK_INT < Build.VERSION_CODES.O && !darkBackground ? Color.BLACK : Color.TRANSPARENT
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) window.setNavigationBarDividerColor(Color.TRANSPARENT);
    }
}
