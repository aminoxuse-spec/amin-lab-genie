package com.aminlab.teachers

import android.app.AlertDialog
import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.view.KeyEvent
import android.view.Menu
import android.view.MenuItem
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var prefs: SharedPreferences
    private var isShowingOfflineDialog = false

    // Default server URL. Edit here OR change at runtime via the overflow menu "تغيير الخادم".
    private val defaultUrl = "http://10.234.91.7:3000/mobile/index.html"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)

        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.setGeolocationEnabled(false)
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView?,
                request: android.webkit.WebResourceRequest?,
                error: android.webkit.WebResourceError?
            ) {
                if (request?.isForMainFrame != true) return
                // Avoid repeated dialogs while the page keeps retrying.
                if (isShowingOfflineDialog) return
                isShowingOfflineDialog = true
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("تعذّر الوصول إلى الخادم")
                    .setMessage(
                        "تأكد أن حاسوب المكتب يعمل وأن الهاتف متصل بنفس شبكة Wi-Fi.\n\n" +
                            "العنوان الحالي:\n" + (prefs.getString(KEY_URL, defaultUrl) ?: defaultUrl)
                    )
                    .setPositiveButton("إعادة المحاولة") { _, _ ->
                        isShowingOfflineDialog = false
                        webView.reload()
                    }
                    .setNeutralButton("تغيير العنوان") { _, _ ->
                        isShowingOfflineDialog = false
                        promptUrl(prefs.getString(KEY_URL, defaultUrl) ?: defaultUrl, allowCancel = true)
                    }
                    .setNegativeButton("إغلاق", null)
                    .setOnDismissListener { isShowingOfflineDialog = false }
                    .show()
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: android.webkit.WebResourceRequest?,
                errorResponse: android.webkit.WebResourceResponse?
            ) {
                if (request?.isForMainFrame != true) return
                if (isShowingOfflineDialog) return
                isShowingOfflineDialog = true
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("تعذّر الوصول إلى الخادم")
                    .setMessage(
                        "ردّ الخادم برمز " + (errorResponse?.statusCode ?: "?") +
                            ".\n\nالعنوان الحالي:\n" + (prefs.getString(KEY_URL, defaultUrl) ?: defaultUrl)
                    )
                    .setPositiveButton("إعادة المحاولة") { _, _ ->
                        isShowingOfflineDialog = false
                        webView.reload()
                    }
                    .setNeutralButton("تغيير العنوان") { _, _ ->
                        isShowingOfflineDialog = false
                        promptUrl(prefs.getString(KEY_URL, defaultUrl) ?: defaultUrl, allowCancel = true)
                    }
                    .setNegativeButton("إغلاق", null)
                    .setOnDismissListener { isShowingOfflineDialog = false }
                    .show()
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: android.webkit.WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                val host = request.url?.host
                val serverHost = android.net.Uri.parse(prefs.getString(KEY_URL, defaultUrl) ?: defaultUrl).host
                if (host == serverHost) return false
                return try {
                    startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url)))
                    true
                } catch (_: Exception) {
                    false
                }
            }
        }
        webView.webChromeClient = WebChromeClient()

        val url = prefs.getString(KEY_URL, null) ?: defaultUrl
        webView.loadUrl(url)

        if (!prefs.contains(KEY_URL)) {
            promptUrl(url, allowCancel = true)
        }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, MENU_CHANGE, 0, "تغيير الخادم")
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            MENU_CHANGE -> {
                promptUrl(prefs.getString(KEY_URL, defaultUrl) ?: defaultUrl, allowCancel = true)
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun promptUrl(current: String, allowCancel: Boolean) {
        val input = EditText(this).apply { setText(current) }
        val builder = AlertDialog.Builder(this)
            .setTitle("عنوان خادم Amin-Lab")
            .setMessage("أدخل عنوان الخادم (مثال: https://lab.example.edu/mobile/index.html)")
            .setView(input)
            .setPositiveButton("حفظ") { _, _ ->
                val u = input.text.toString().trim()
                if (u.isEmpty()) return@setPositiveButton
                if (!android.util.Patterns.WEB_URL.matcher(u).matches()) {
                    android.widget.Toast.makeText(this@MainActivity, "عنوان غير صالح", android.widget.Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                prefs.edit().putString(KEY_URL, u).apply()
                webView.loadUrl(u)
            }
        if (allowCancel) builder.setNegativeButton("إلغاء", null)
        builder.setCancelable(allowCancel)
        builder.show()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    companion object {
        private const val PREFS = "aminlab"
        private const val KEY_URL = "server_url"
        private const val MENU_CHANGE = 1
    }
}