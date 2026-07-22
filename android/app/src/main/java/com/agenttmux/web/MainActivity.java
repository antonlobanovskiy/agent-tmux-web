package com.agenttmux.web;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 41;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 42;
    private static final String PREFS_NAME = "agent_tmux_web";
    private static final String PREF_SERVER_URL = "server_url";
    private static final String PREF_AUTH_TOKEN = "auth_token";

    private FrameLayout root;
    private WebView webView;
    private View setupView;
    private SharedPreferences preferences;
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        root = new FrameLayout(this);
        root.setFitsSystemWindows(true);
        getWindow().setStatusBarColor(Color.rgb(13, 15, 16));
        getWindow().setNavigationBarColor(Color.rgb(13, 15, 16));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(true);
        }
        setContentView(root);

        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        configureWebView();
        requestNotificationPermission();

        if (serverUrl().isEmpty()) {
            showSetup();
        } else {
            loadConfiguredServer(requestedTmuxSession(getIntent()));
        }
        WatchPollingService.startIfEnabled(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openRequestedTmuxSession(intent);
    }

    @Override
    public void onBackPressed() {
        if (setupView != null && !serverUrl().isEmpty()) {
            hideSetup();
            return;
        }

        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }

        super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) {
            return;
        }

        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            if ((results == null || results.length == 0) && data != null && data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                results = new Uri[count];
                for (int index = 0; index < count; index += 1) {
                    results[index] = data.getClipData().getItemAt(index).getUri();
                }
            }
        }

        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.addJavascriptInterface(
            new AgentNotificationBridge(this, this::showSetup),
            "AgentTmuxAndroid"
        );
        webView.setBackgroundColor(Color.rgb(13, 15, 16));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        settings.setSupportMultipleWindows(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return shouldOpenExternally(request.getUrl());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(
                WebView view,
                boolean isDialog,
                boolean isUserGesture,
                Message resultMsg
            ) {
                if (isUserGesture) {
                    openPopupUrlExternally(hitTestUrl(view));
                }
                return false;
            }

            @Override
            public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> callback,
                FileChooserParams params
            ) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException error) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "No file picker available", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }
        });

        webView.setOnLongClickListener(view -> showLinkActions(hitTestUrl(webView)));
    }

    private boolean shouldOpenExternally(Uri uri) {
        if (!ExternalLinkPolicy.shouldOpenInExternalBrowser(uri.toString(), serverUrl())) {
            return false;
        }

        openExternalUri(uri);
        return true;
    }

    private void openExternalUri(Uri uri) {
        openExternalUri(uri, false);
    }

    private void openExternalUri(Uri uri, boolean showChooser) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(showChooser ? Intent.createChooser(intent, "Open link with") : intent);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "No app can open this link", Toast.LENGTH_SHORT).show();
        }
    }

    private boolean openPopupUrlExternally(String url) {
        if (!ExternalLinkPolicy.shouldOpenPopupInExternalBrowser(url)) {
            return false;
        }

        openExternalUri(Uri.parse(url));
        return true;
    }

    private boolean showLinkActions(String url) {
        if (!ExternalLinkPolicy.shouldShowUserLinkActions(url)) {
            return false;
        }

        boolean canOpenHere = ExternalLinkPolicy.canOpenInAppWebView(url, serverUrl());
        String[] actions = canOpenHere
            ? new String[] { "Open here", "Open in browser", "Choose app", "Copy link" }
            : new String[] { "Open in browser", "Choose app", "Copy link" };

        new AlertDialog.Builder(this)
            .setTitle("Link")
            .setMessage(url)
            .setItems(actions, (dialog, which) -> handleLinkAction(url, canOpenHere, which))
            .show();
        return true;
    }

    private void handleLinkAction(String url, boolean canOpenHere, int actionIndex) {
        int index = actionIndex;
        if (canOpenHere && index == 0) {
            webView.loadUrl(url);
            return;
        }
        if (canOpenHere) {
            index -= 1;
        }

        if (index == 0) {
            openExternalUri(Uri.parse(url));
            return;
        }
        if (index == 1) {
            openExternalUri(Uri.parse(url), true);
            return;
        }
        copyLinkToClipboard(url);
    }

    private void copyLinkToClipboard(String url) {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) {
            Toast.makeText(this, "Clipboard unavailable", Toast.LENGTH_SHORT).show();
            return;
        }

        clipboard.setPrimaryClip(ClipData.newPlainText("Link", url));
        Toast.makeText(this, "Link copied", Toast.LENGTH_SHORT).show();
    }

    private static String hitTestUrl(WebView view) {
        WebView.HitTestResult hitTestResult = view == null ? null : view.getHitTestResult();
        String url = hitTestResult == null ? "" : hitTestResult.getExtra();
        return url == null ? "" : url.trim();
    }

    private void showSetup() {
        if (setupView != null) {
            return;
        }

        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.setBackgroundColor(Color.rgb(13, 15, 16));

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER_VERTICAL);
        panel.setPadding(dp(22), dp(28), dp(22), dp(28));
        scrollView.addView(panel, new ScrollView.LayoutParams(
            ScrollView.LayoutParams.MATCH_PARENT,
            ScrollView.LayoutParams.MATCH_PARENT
        ));

        TextView title = label("Agent Tmux Web", 24, "#E9F2ED");
        TextView subtitle = label("Connect this app to your running Agent Tmux Web server.", 15, "#A8B3AD");
        subtitle.setPadding(0, dp(8), 0, dp(20));

        EditText serverField = input("Server URL", serverUrl(), InputType.TYPE_TEXT_VARIATION_URI);
        EditText tokenField = input("Auth token, if enabled", authToken(), InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);

        Button connect = new Button(this);
        connect.setText("Connect");
        connect.setAllCaps(false);
        connect.setOnClickListener(view -> {
            String nextServer = normalizeServerUrl(serverField.getText().toString());
            if (nextServer.isEmpty()) {
                serverField.setError("Enter a server URL");
                return;
            }

            preferences.edit()
                .putString(PREF_SERVER_URL, nextServer)
                .putString(PREF_AUTH_TOKEN, tokenField.getText().toString().trim())
                .apply();
            hideSetup();
            loadConfiguredServer();
            WatchPollingService.startIfEnabled(this);
        });

        TextView note = label("The Android app does not run tmux locally. It loads your private server and keeps the same GUI, raw tmux mode, uploads, and launchers.", 13, "#87918D");
        note.setPadding(0, dp(16), 0, 0);

        panel.addView(title);
        panel.addView(subtitle);
        panel.addView(serverField, matchWrap());
        panel.addView(tokenField, matchWrap());
        panel.addView(connect, matchWrap());
        panel.addView(note);

        setupView = scrollView;
        root.addView(setupView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
    }

    private EditText input(String hint, String value, int inputType) {
        EditText editText = new EditText(this);
        editText.setHint(hint);
        editText.setText(value);
        editText.setSingleLine(true);
        editText.setTextColor(Color.rgb(233, 242, 237));
        editText.setHintTextColor(Color.rgb(117, 128, 123));
        editText.setInputType(inputType);
        editText.setSelectAllOnFocus(false);
        editText.setPadding(dp(12), dp(10), dp(12), dp(10));
        return editText;
    }

    private TextView label(String text, int textSize, String color) {
        TextView textView = new TextView(this);
        textView.setText(text);
        textView.setTextSize(textSize);
        textView.setTextColor(Color.parseColor(color));
        return textView;
    }

    private LinearLayout.LayoutParams matchWrap() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, dp(8), 0, dp(8));
        return params;
    }

    private void hideSetup() {
        if (setupView == null) {
            return;
        }
        root.removeView(setupView);
        setupView = null;
    }

    private void loadConfiguredServer() {
        loadConfiguredServer("");
    }

    private void loadConfiguredServer(String tmuxSession) {
        String url = buildLaunchUrl(serverUrl(), authToken(), tmuxSession);
        if (url.isEmpty()) {
            showSetup();
            return;
        }
        webView.loadUrl(url);
    }

    private void openRequestedTmuxSession(Intent intent) {
        String tmuxSession = requestedTmuxSession(intent);
        if (tmuxSession.isEmpty()) {
            return;
        }
        if (serverUrl().isEmpty()) {
            showSetup();
            return;
        }
        hideSetup();
        if (webView.getUrl() == null || webView.getUrl().trim().isEmpty()) {
            loadConfiguredServer(tmuxSession);
            return;
        }
        webView.evaluateJavascript(NotificationTarget.openSessionScript(tmuxSession), null);
    }

    private String serverUrl() {
        String stored = preferences.getString(PREF_SERVER_URL, "");
        if (stored == null || stored.trim().isEmpty()) {
            return normalizeServerUrl(BuildConfig.DEFAULT_SERVER_URL);
        }
        return normalizeServerUrl(stored);
    }

    private String authToken() {
        String stored = preferences.getString(PREF_AUTH_TOKEN, "");
        if (stored == null || stored.trim().isEmpty()) {
            return BuildConfig.DEFAULT_AUTH_TOKEN.trim();
        }
        return stored.trim();
    }

    private static String buildLaunchUrl(String serverUrl, String token, String tmuxSession) {
        String normalized = normalizeServerUrl(serverUrl);
        if (normalized.isEmpty()) {
            return "";
        }

        Uri.Builder builder = Uri.parse(normalized).buildUpon();
        if (token != null && !token.trim().isEmpty()) {
            builder.appendQueryParameter("token", token.trim());
        }
        String safeSession = NotificationTarget.clean(tmuxSession);
        if (!safeSession.isEmpty()) {
            builder.appendQueryParameter(NotificationTarget.QUERY_TMUX_SESSION, safeSession);
        }
        return builder.build().toString();
    }

    private static String requestedTmuxSession(Intent intent) {
        return intent == null ? "" : NotificationTarget.clean(intent.getStringExtra(NotificationTarget.EXTRA_TMUX_SESSION));
    }

    private static String normalizeServerUrl(String value) {
        if (value == null) {
            return "";
        }

        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return "";
        }

        if (!trimmed.matches("^[a-zA-Z][a-zA-Z0-9+.-]*://.*")) {
            trimmed = "http://" + trimmed;
        }

        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, NOTIFICATION_PERMISSION_REQUEST);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != NOTIFICATION_PERMISSION_REQUEST || grantResults.length == 0) {
            return;
        }

        if (grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            WatchPollingService.startIfEnabled(this);
        } else {
            WatchPollingService.setEnabled(this, false);
        }
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }
}
