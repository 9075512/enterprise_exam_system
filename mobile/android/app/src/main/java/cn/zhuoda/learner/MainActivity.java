package cn.zhuoda.learner;

import android.annotation.SuppressLint;
import android.Manifest;
import android.content.pm.PackageManager;
import android.webkit.PermissionRequest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;
import org.json.JSONTokener;

/** 在线学员客户端：无 JS 原生桥，账号、答卷和计时仍由现有服务端负责。 */
public class MainActivity extends Activity {
    private static final int PICK_FILE = 100;
    private static final int SAVE_FILE = 101;
    private static final int CAMERA_PERMISSION = 102;
    private PermissionRequest pendingCameraRequest;
    private static final int BLUE = 0xFF2563EB;
    private static final int BACKGROUND = 0xFFF4F7FC;
    private static final String UA_MARKER = " ZhuodaLearnerAndroid/" + BuildConfig.VERSION_NAME
            + " ZhuodaLearnerBuild/" + BuildConfig.VERSION_CODE;
    private WebView webView;
    private FrameLayout root;
    private LinearLayout chrome;
    private LinearLayout errorPanel;
    private ProgressBar progress;
    private TextView errorText;
    private SharedPreferences preferences;
    private String server;
    private String retryUrl;
    private boolean failed;
    private boolean paused;
    private long lastBackAt;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private ValueCallback<Uri[]> fileCallback;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private byte[] pendingDownload;
    private final Runnable downloadPoll = new Runnable() {
        @Override public void run() {
            if (paused || isFinishing() || isDestroyed()) return;
            if (webView != null && !failed && pendingDownload == null && ServerAddress.sameOrigin(server, webView.getUrl())) {
                WebView source = webView;
                source.evaluateJavascript("JSON.stringify(window.__zhuodaDownloadQueue?.[0] ?? null)", value -> {
                    if (source != webView || paused || isFinishing() || isDestroyed() || pendingDownload != null) return;
                    try {
                        Object decoded = new JSONTokener(value).nextValue();
                        if (!(decoded instanceof String) || "null".equals(decoded)) return;
                        JSONObject item = new JSONObject((String) decoded);
                        webView.evaluateJavascript("window.__zhuodaDownloadQueue?.shift()", null);
                        saveDownload(item.getString("name"), item.getString("data"));
                    } catch (Exception ignored) { toast("无法准备下载文件，请重试"); }
                });
            }
            handler.postDelayed(this, 750);
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        preferences = getSharedPreferences("learner", MODE_PRIVATE);
        server = preferences.getString("server", BuildConfig.DEFAULT_SERVER_URL);
        try { server = ServerAddress.normalize(server); }
        catch (IllegalArgumentException ignored) { server = ServerAddress.normalize(BuildConfig.DEFAULT_SERVER_URL); }
        createLayout();
        createWebView();
        // 不持久化整张 WebView：重启从首页经后端恢复登录态和未交答卷。
        open(server + "/exam/home");
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, this::handleBack);
        }
    }

    private void createLayout() {
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        else getWindow().getDecorView().setSystemUiVisibility(getWindow().getDecorView().getSystemUiVisibility()
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        root = new FrameLayout(this);
        root.setBackgroundColor(BACKGROUND);
        chrome = new LinearLayout(this);
        chrome.setOrientation(LinearLayout.VERTICAL);
        root.addView(chrome, new FrameLayout.LayoutParams(-1, -1));
        // Android 15 强制 edge-to-edge；原生容器处理刘海和手势区，网页无需二次补偿。
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
        });
        // 页面已有移动导航，原生外壳不再添加第二层顶部栏。
        // 服务器设置由连接失败页的“检查服务器地址”入口提供。
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setProgressTintList(android.content.res.ColorStateList.valueOf(BLUE));
        progress.setVisibility(View.GONE);
        chrome.addView(progress, new LinearLayout.LayoutParams(-1, dp(2)));
        setContentView(root);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(BACKGROUND);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // 仅系统选图器返回的 content:// URI。
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUserAgentString(settings.getUserAgentString() + UA_MARKER);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String target = request.getUrl().toString();
                if (request.hasGesture() && request.isForMainFrame() && ServerAddress.isAppDownload(server, target)) {
                    openAppDownload(target);
                    return true;
                }
                if (ServerAddress.sameOrigin(server, target)) return false;
                if (request.hasGesture() && request.isForMainFrame()) openExternal(request.getUrl());
                return true;
            }

            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                denyPendingCamera();
                // 跳转一旦离开配置站点就终止；不向外站注入脚本或转交登录态。
                if (!ServerAddress.sameOrigin(server, url)) {
                    view.stopLoading();
                    showError("页面跳转到了其他站点，请检查服务器地址");
                    return;
                }
                failed = false;
                retryUrl = url;
                errorPanel.setVisibility(View.GONE);
                view.setVisibility(View.VISIBLE);
                progress.setVisibility(View.VISIBLE);
            }

            @Override public void onPageFinished(WebView view, String url) {
                if (failed || !ServerAddress.sameOrigin(server, url)) return;
                progress.setVisibility(View.GONE);
                CookieManager.getInstance().flush();
                // 首次安装直接兼容当前线上页面；后续前端也通过 UA 识别学员 App。
                installLearnerMode();
                handler.removeCallbacks(downloadPoll);
                handler.postDelayed(downloadPoll, 750);
            }

            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError("暂时无法连接学习服务器\n请检查网络连接后重试");
            }

            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) showError("服务器暂时无法打开页面（" + response.getStatusCode() + "）");
            }

            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                showError("服务器证书验证失败，请联系管理员检查 HTTPS 证书");
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (!isTrustedCameraRequest(request)) { request.deny(); return; }
                    denyPendingCamera();
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                    } else {
                        pendingCameraRequest = request;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION);
                    }
                });
            }

            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                runOnUiThread(() -> { if (pendingCameraRequest == request) pendingCameraRequest = null; });
            }

            @Override public void onProgressChanged(WebView view, int value) { progress.setProgress(value); }

            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) { callback.onCustomViewHidden(); return; }
                fullscreenView = view;
                fullscreenCallback = callback;
                chrome.setVisibility(View.GONE);
                root.addView(view, new FrameLayout.LayoutParams(-1, -1));
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }

            @Override public void onHideCustomView() { hideFullscreen(); }

            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!ServerAddress.sameOrigin(server, view.getUrl())) return false;
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*"); // 学员简答题/富文本选图，不请求相册或存储权限。
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(intent, PICK_FILE); }
                catch (ActivityNotFoundException ignored) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                    toast("未找到图片选择器，请安装系统文件管理器");
                }
                return true;
            }
        });
        webView.setDownloadListener((url, userAgent, disposition, mime, length) -> {
            if (ServerAddress.isAppDownload(server, url)) openAppDownload(url);
            else toast("请通过系统浏览器下载此文件");
        });
        chrome.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1));
        createErrorPanel();
    }

    private void createErrorPanel() {
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(dp(32), dp(24), dp(32), dp(24));
        errorPanel.setBackgroundColor(BACKGROUND);
        TextView icon = label("连接暂时中断", 24, 0xFF18243B);
        icon.setTypeface(null, Typeface.BOLD);
        errorPanel.addView(icon);
        errorText = label("", 15, 0xFF64748B);
        errorText.setGravity(Gravity.CENTER);
        errorText.setPadding(0, dp(20), 0, dp(24));
        errorPanel.addView(errorText);
        Button retry = new Button(this);
        retry.setText("重新连接");
        retry.setTextColor(Color.WHITE);
        retry.setBackgroundTintList(android.content.res.ColorStateList.valueOf(BLUE));
        retry.setOnClickListener(view -> open(retryUrl == null ? server + "/exam/home" : retryUrl));
        errorPanel.addView(retry, new LinearLayout.LayoutParams(dp(220), dp(52)));
        Button config = new Button(this, null, android.R.attr.borderlessButtonStyle);
        config.setText("检查服务器地址");
        config.setTextColor(BLUE);
        config.setOnClickListener(view -> showSettings());
        errorPanel.addView(config);
        errorPanel.setVisibility(View.GONE);
        chrome.addView(errorPanel, new LinearLayout.LayoutParams(-1, 0, 1));
    }

    private void open(String url) {
        if (!ServerAddress.sameOrigin(server, url)) url = server + "/exam/home";
        failed = false;
        retryUrl = url;
        errorPanel.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(url);
    }

    private void showError(String message) {
        failed = true;
        progress.setVisibility(View.GONE);
        webView.setVisibility(View.GONE);
        errorText.setText(message);
        errorPanel.setVisibility(View.VISIBLE);
    }

    private void showSettings() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        input.setText(server);
        input.setSelectAllOnFocus(true);
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(24), dp(8), dp(24), 0);
        TextView hint = label("请输入考试系统的访问根地址。更换服务器后需要重新登录。", 14, 0xFF64748B);
        hint.setPadding(0, 0, 0, dp(12));
        form.addView(hint);
        form.addView(input, new LinearLayout.LayoutParams(-1, dp(52)));
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("服务器连接")
                .setView(form)
                .setNegativeButton("取消", null)
                .setNeutralButton("关于", (d, which) -> new AlertDialog.Builder(this)
                        .setTitle(getString(cn.zhuoda.learner.R.string.app_name) + " " + BuildConfig.VERSION_NAME)
                        .setMessage("学习课程、在线练题、参加考试、查看成绩。\n\n当前服务器：" + server + "\n\n本应用需要网络连接，学习和考试数据由服务器保存。")
                        .setPositiveButton("知道了", null).show())
                .setPositiveButton("保存并连接", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            final String address;
            try { address = ServerAddress.normalize(input.getText().toString()); }
            catch (IllegalArgumentException error) { input.setError(error.getMessage()); return; }
            dialog.dismiss();
            if (address.equals(server)) { open(server + "/exam/home"); return; }
            // 清理旧站点的本地会话，不能把上一服务器的登录态交给新站点。
            webView.stopLoading();
            handler.removeCallbacks(downloadPoll);
            if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
            chrome.removeView(webView);
            chrome.removeView(errorPanel);
            webView.destroy();
            webView = null;
            WebStorage.getInstance().deleteAllData();
            CookieManager.getInstance().removeAllCookies(success -> {
                if (isFinishing() || isDestroyed()) return;
                server = address;
                preferences.edit().putString("server", server).apply();
                createWebView();
                open(server + "/exam/home");
            });
        }));
        dialog.show();
    }

    private void openExternal(Uri uri) {
        String scheme = uri.getScheme();
        if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) return;
        new AlertDialog.Builder(this).setTitle("打开外部链接")
                .setMessage("将在浏览器中打开：\n" + uri.getHost())
                .setNegativeButton("取消", null)
                .setPositiveButton("打开", (dialog, which) -> {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (ActivityNotFoundException ignored) { toast("未找到浏览器"); }
                }).show();
    }

    private void openAppDownload(String url) {
        if (!ServerAddress.isAppDownload(server, url)) return;
        withCurrentPath(path -> {
            if (path.isEmpty() || path.startsWith("/exam/taking/")) { toast("请完成考试后再下载更新"); return; }
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
            catch (ActivityNotFoundException ignored) { toast("未找到浏览器，请在手机浏览器打开 " + server + "/download"); }
        });
    }

    private void installLearnerMode() {
        try {
            String css = JSONObject.quote(readAsset("mobile-login.css"));
            String installStyle = "(() => { if (document.getElementById('zhuoda-mobile-login-style')) return;"
                    + "const style = document.createElement('style'); style.id = 'zhuoda-mobile-login-style';"
                    + "style.textContent = " + css + "; document.head.appendChild(style); })();";
            webView.evaluateJavascript(installStyle + readAsset("learner-mode.js"), null);
        } catch (java.io.IOException ignored) {
            toast("学员模式加载失败，请重新打开应用");
        }
    }

    private String readAsset(String name) throws java.io.IOException {
        try (java.io.InputStream stream = getAssets().open(name);
             java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream()) {
            byte[] bytes = new byte[4096];
            int count;
            while ((count = stream.read(bytes)) != -1) buffer.write(bytes, 0, count);
            return buffer.toString("UTF-8");
        }
    }

    private void saveDownload(String filename, String dataUrl) {
        if (dataUrl.length() > 14 * 1024 * 1024 || !dataUrl.startsWith("data:")) {
            toast("文件过大或格式不支持，请通过网页端下载");
            return;
        }
        int comma = dataUrl.indexOf(',');
        if (comma < 0 || !dataUrl.substring(0, comma).endsWith(";base64")) return;
        pendingDownload = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
        if (pendingDownload.length > 10 * 1024 * 1024) { pendingDownload = null; toast("文件超过 10 MB"); return; }
        String mime = filename.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf") ? "application/pdf"
                : filename.toLowerCase(java.util.Locale.ROOT).endsWith(".csv") ? "text/csv" : "application/octet-stream";
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, filename.replaceAll("[\\\\/\\x00-\\x1f]", "_").trim());
        try { startActivityForResult(intent, SAVE_FILE); }
        catch (ActivityNotFoundException ignored) { pendingDownload = null; toast("未找到文件保存器，请通过网页端下载"); }
    }

    private interface PathCallback { void accept(String path); }
    private void withCurrentPath(PathCallback callback) {
        if (webView == null) { callback.accept(""); return; }
        webView.evaluateJavascript("location.pathname", value -> {
            try { callback.accept((String) new JSONTokener(value).nextValue()); }
            catch (Exception ignored) { callback.accept(""); }
        });
    }

    private static boolean isExam(String path) { return path.startsWith("/exam/taking/"); }

    @Override public void onBackPressed() { handleBack(); }
    private void handleBack() {
        if (fullscreenView != null) { hideFullscreen(); return; }
        withCurrentPath(path -> {
            if (isExam(path)) {
                toast("考试进行中，请使用答题页的交卷按钮");
                return;
            }
            if (!path.equals("/exam/home") && !path.equals("/login") && !failed) {
                webView.evaluateJavascript("history.state && history.state.back ? history.back() : location.replace('/exam/home')", null);
                return;
            }
            long now = SystemClock.elapsedRealtime();
            if (lastBackAt != 0 && now - lastBackAt < 2000) { finish(); }
            else { lastBackAt = now; toast("再按一次返回键退出"); }
        });
    }

    private void hideFullscreen() {
        if (fullscreenView == null) return;
        root.removeView(fullscreenView);
        fullscreenView = null;
        chrome.setVisibility(View.VISIBLE);
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (fullscreenCallback != null) fullscreenCallback.onCustomViewHidden();
        fullscreenCallback = null;
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == SAVE_FILE && pendingDownload != null) {
            byte[] bytes = pendingDownload;
            pendingDownload = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                Uri destination = data.getData();
                new Thread(() -> {
                    try (java.io.OutputStream output = getContentResolver().openOutputStream(destination)) {
                        if (output == null) throw new java.io.IOException("No document output stream");
                        output.write(bytes);
                        runOnUiThread(() -> toast("文件已保存"));
                    } catch (java.io.IOException | SecurityException ignored) { runOnUiThread(() -> toast("保存失败，请检查目标位置后重试")); }
                }, "learner-download").start();
            }
        }
        if (requestCode == PICK_FILE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    result = new Uri[count];
                    for (int i = 0; i < count; i++) result[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) result = new Uri[]{data.getData()};
            }
            // 仅将 content URI 交回可信的作答页面，不接受 file:// 或其他协议。
            if (result != null) for (Uri uri : result) if (!"content".equals(uri.getScheme())) { result = null; break; }
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        }
    }

    private boolean isTrustedCameraRequest(PermissionRequest request) {
        String[] resources = request.getResources();
        return !isFinishing() && !isDestroyed() && webView != null
                && "https".equalsIgnoreCase(request.getOrigin().getScheme())
                && ServerAddress.sameOrigin(server, request.getOrigin().toString())
                && ServerAddress.sameOrigin(server, webView.getUrl())
                && resources.length == 1 && PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resources[0]);
    }

    private void denyPendingCamera() {
        if (pendingCameraRequest != null) {
            pendingCameraRequest.deny();
            pendingCameraRequest = null;
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != CAMERA_PERMISSION || pendingCameraRequest == null) return;
        PermissionRequest request = pendingCameraRequest;
        pendingCameraRequest = null;
        if (grantResults.length == 1 && grantResults[0] == PackageManager.PERMISSION_GRANTED && isTrustedCameraRequest(request)) {
            request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        } else request.deny();
    }

    @Override protected void onPause() {
        paused = true;
        handler.removeCallbacks(downloadPoll);
        if (webView != null) {
            webView.evaluateJavascript("window.dispatchEvent(new Event('zhuoda:app-background'))", null);
            webView.onPause();
        }
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        if (webView != null && paused) {
            webView.onResume(); paused = false;
            webView.evaluateJavascript("window.dispatchEvent(new Event('zhuoda:app-foreground'))", null);
        }
        handler.removeCallbacks(downloadPoll);
        handler.postDelayed(downloadPoll, 750);
    }

    @Override protected void onDestroy() {
        denyPendingCamera();
        handler.removeCallbacksAndMessages(null);
        pendingDownload = null;
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        hideFullscreen();
        if (webView != null) {
            if (webView.getParent() instanceof ViewGroup) ((ViewGroup) webView.getParent()).removeView(webView);
            webView.destroy();
        }
        super.onDestroy();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView label(String text, int size, int color) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }
    private void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_SHORT).show(); }
}
