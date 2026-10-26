package com.tumpanggo.merchant

import android.Manifest
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MainActivity"
        const val EXTRA_ORDER_ID = "orderId"
        const val EXTRA_ORDER_NUMBER = "orderNumber"
        const val EXTRA_MERCHANT_ID = "merchantId"
        const val EXTRA_TARGET_URL = "targetUrl"
        const val DEFAULT_URL = "https://tumpanggo.vercel.app/merchant"
    }

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var progressBar: ProgressBar

    private var pendingTargetUrl: String? = null
    private var pendingOrderId: String? = null
    private var pendingOrderNumber: String? = null
    private var networkCallbackRegistered = false

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    // Android 13+ (API 33+) runtime notification permission launcher
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            Log.i(TAG, "POST_NOTIFICATIONS permission granted.")
            NotificationHelper.createNotificationChannels(this)
        } else {
            Log.w(TAG, "POST_NOTIFICATIONS permission denied.")
            Toast.makeText(
                this,
                "Izin notifikasi dinonaktifkan. Aktifkan di Pengaturan agar pesanan baru tetap berbunyi saat layar mati.",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    // Foreground receiver when a new FCM message arrives while the Merchant app is open
    private val orderBroadcastReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val orderId = intent?.getStringExtra(EXTRA_ORDER_ID) ?: return
            val orderNumber = intent.getStringExtra(EXTRA_ORDER_NUMBER) ?: ""
            Log.i(TAG, "Foreground order broadcast received: #$orderNumber ($orderId)")
            dispatchForegroundOrderRefreshToWeb(orderId, orderNumber)
        }
    }

    // Offline -> Online network recovery listener: re-syncs unsent token & flushes pending outbox events
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            super.onAvailable(network)
            handleNetworkRestored()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        NotificationHelper.createNotificationChannels(this)
        requestNotificationPermissionIfNeeded()

        // Extract deep-link / PendingIntent extras BEFORE initial WebView load
        extractIntentExtras(intent, isNewIntent = false)

        setupViews()
        registerConnectivityMonitor()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (::webView.isInitialized && webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    private fun setupViews() {
        val rootLayout = androidx.constraintlayout.widget.ConstraintLayout(this).apply {
            layoutParams = androidx.constraintlayout.widget.ConstraintLayout.LayoutParams(
                androidx.constraintlayout.widget.ConstraintLayout.LayoutParams.MATCH_PARENT,
                androidx.constraintlayout.widget.ConstraintLayout.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(android.graphics.Color.parseColor("#F4F7F5"))
        }

        swipeRefresh = SwipeRefreshLayout(this).apply {
            id = View.generateViewId()
            layoutParams = androidx.constraintlayout.widget.ConstraintLayout.LayoutParams(
                androidx.constraintlayout.widget.ConstraintLayout.LayoutParams.MATCH_PARENT,
                androidx.constraintlayout.widget.ConstraintLayout.LayoutParams.MATCH_PARENT
            )
            setColorSchemeColors(android.graphics.Color.parseColor("#15803D"))
        }

        webView = WebView(this).apply {
            id = View.generateViewId()
            layoutParams = androidx.constraintlayout.widget.ConstraintLayout.LayoutParams(
                androidx.constraintlayout.widget.ConstraintLayout.LayoutParams.MATCH_PARENT,
                androidx.constraintlayout.widget.ConstraintLayout.LayoutParams.MATCH_PARENT
            )
        }

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            id = View.generateViewId()
            layoutParams = androidx.constraintlayout.widget.ConstraintLayout.LayoutParams(
                androidx.constraintlayout.widget.ConstraintLayout.LayoutParams.MATCH_PARENT,
                8
            )
            max = 100
            progressTintList = android.content.res.ColorStateList.valueOf(android.graphics.Color.parseColor("#15803D"))
            visibility = View.GONE
        }

        swipeRefresh.addView(webView)
        rootLayout.addView(swipeRefresh)
        rootLayout.addView(progressBar)
        setContentView(rootLayout)

        configureWebView()

        swipeRefresh.setOnRefreshListener {
            webView.reload()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.setSupportZoom(false)

        val bridge = MerchantWebBridge(
            context = this,
            onPermissionRequested = { runOnUiThread { requestNotificationPermissionIfNeeded() } },
            onCloseAppRequested = { finish() }
        )

        webView.addJavascriptInterface(bridge, "TumpangNativeBridge")
        webView.addJavascriptInterface(bridge, "AndroidBridge")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                    swipeRefresh.isRefreshing = false
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                swipeRefresh.isRefreshing = false

                // Persist pendingOrderId into localStorage AND dispatch custom event so if the user
                // must re-authenticate on PortalLogin first, MerchantView still opens the exact order after login!
                pendingOrderId?.let { orderId ->
                    val ordNum = pendingOrderNumber ?: ""
                    deliverPendingOrderDeepLinkToWeb(orderId, ordNum)
                    pendingOrderId = null
                    pendingOrderNumber = null
                }
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    swipeRefresh.isRefreshing = false
                    Log.w(TAG, "WebView main-frame error: ${error?.description}")
                }
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                if (
                    url.startsWith("tel:") ||
                    url.startsWith("whatsapp:") ||
                    url.startsWith("https://wa.me/") ||
                    url.startsWith("intent:")
                ) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        return true
                    } catch (e: Exception) {
                        Log.w(TAG, "Could not launch external link: ${e.message}")
                    }
                }
                return false
            }
        }

        val urlToLoad = pendingTargetUrl ?: DEFAULT_URL
        pendingTargetUrl = null
        Log.i(TAG, "Loading Merchant Portal URL: $urlToLoad")
        webView.loadUrl(urlToLoad)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        extractIntentExtras(intent, isNewIntent = true)
    }

    private fun extractIntentExtras(intent: Intent?, isNewIntent: Boolean) {
        if (intent == null) return

        var orderId = intent.getStringExtra(EXTRA_ORDER_ID)
        val orderNumber = intent.getStringExtra(EXTRA_ORDER_NUMBER)
        var targetUrl = intent.getStringExtra(EXTRA_TARGET_URL)

        // Also support deep-link URIs such as https://tumpanggo.vercel.app/merchant?orderId=ord_xxx
        // or tumpanggo://merchant?orderId=ord_xxx
        val dataUri = intent.data
        if (dataUri != null) {
            val uriOrderId = dataUri.getQueryParameter("orderId")
            if (orderId.isNullOrBlank() && !uriOrderId.isNullOrBlank()) {
                orderId = uriOrderId
            }
            if (targetUrl.isNullOrBlank() && dataUri.scheme == "https") {
                targetUrl = dataUri.toString()
            } else if (targetUrl.isNullOrBlank() && !uriOrderId.isNullOrBlank()) {
                targetUrl = "/merchant?orderId=${Uri.encode(uriOrderId)}"
            }
        }

        if (!orderId.isNullOrBlank()) {
            val cleanOrderId = orderId.trim()
            pendingOrderId = cleanOrderId
            pendingOrderNumber = orderNumber ?: ""

            // Update notification count without changing order status in DB
            NotificationHelper.cancelOrderNotification(this, cleanOrderId)

            if (isNewIntent && ::webView.isInitialized) {
                deliverPendingOrderDeepLinkToWeb(cleanOrderId, orderNumber ?: "")
                pendingOrderId = null
                pendingOrderNumber = null
                return
            }
        }

        if (!targetUrl.isNullOrBlank()) {
            val fullUrl = if (targetUrl.startsWith("http")) {
                targetUrl
            } else {
                "${TumpangFirebaseMessagingService.SERVER_URL}$targetUrl"
            }

            if (isNewIntent && ::webView.isInitialized) {
                webView.loadUrl(fullUrl)
            } else {
                pendingTargetUrl = fullUrl
            }
        }
    }

    private fun escapeJsString(raw: String): String {
        return raw
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", "")
            .replace("\r", "")
    }

    /**
     * Stores target orderId in localStorage so it survives login verification if session expired,
     * and dispatches `tumpang:openOrder` immediately if MerchantView is already mounted.
     */
    private fun deliverPendingOrderDeepLinkToWeb(orderId: String, orderNumber: String) {
        if (!::webView.isInitialized) return
        val safeOrderId = escapeJsString(orderId)
        val safeOrderNum = escapeJsString(orderNumber)
        val script = """
            (function() {
                try {
                    localStorage.setItem('tumpang_pending_open_order_id', '$safeOrderId');
                    window.dispatchEvent(new CustomEvent('tumpang:openOrder', {
                        detail: { orderId: '$safeOrderId', orderNumber: '$safeOrderNum' }
                    }));
                } catch (e) {}
            })();
        """.trimIndent()
        runOnUiThread {
            webView.evaluateJavascript(script, null)
        }
    }

    /**
     * Notifies an already-open foreground WebView to refresh its order list when an FCM order arrives,
     * without changing tabs intrusively or playing a duplicate Web Audio ringtone.
     */
    private fun dispatchForegroundOrderRefreshToWeb(orderId: String, orderNumber: String) {
        if (!::webView.isInitialized) return
        val safeOrderId = escapeJsString(orderId)
        val safeOrderNum = escapeJsString(orderNumber)
        val script = """
            (function() {
                try {
                    window.dispatchEvent(new CustomEvent('tumpang:newOrderPush', {
                        detail: { orderId: '$safeOrderId', orderNumber: '$safeOrderNum' }
                    }));
                } catch (e) {}
            })();
        """.trimIndent()
        runOnUiThread {
            webView.evaluateJavascript(script, null)
        }
    }

    private fun registerConnectivityMonitor() {
        try {
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val req = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            cm.registerNetworkCallback(req, networkCallback)
            networkCallbackRegistered = true
        } catch (e: Exception) {
            Log.w(TAG, "Unable to register NetworkCallback: ${e.message}")
        }
    }

    private fun handleNetworkRestored() {
        val prefs = getSharedPreferences(TumpangFirebaseMessagingService.PREFS_NAME, Context.MODE_PRIVATE)
        val merchantId = prefs.getString(TumpangFirebaseMessagingService.KEY_MERCHANT_ID, null)
        val authToken = prefs.getString(TumpangFirebaseMessagingService.KEY_AUTH_TOKEN, null)
        val fcmToken = prefs.getString(TumpangFirebaseMessagingService.KEY_FCM_TOKEN, null)
        val tokenSynced = prefs.getBoolean(TumpangFirebaseMessagingService.KEY_TOKEN_SYNCED, false)

        if (!merchantId.isNullOrBlank() && !authToken.isNullOrBlank()) {
            CoroutineScope(Dispatchers.IO).launch {
                if (!tokenSynced && !fcmToken.isNullOrBlank()) {
                    TumpangFirebaseMessagingService.syncTokenWithBackendSync(
                        context = applicationContext,
                        merchantId = merchantId,
                        fcmToken = fcmToken,
                        authToken = authToken
                    )
                }

                // Flush any pending/retrying outbox push notifications missed while device was offline
                try {
                    val body = JSONObject().put("entityId", merchantId).toString()
                        .toRequestBody("application/json".toMediaType())
                    val req = Request.Builder()
                        .url("${TumpangFirebaseMessagingService.SERVER_URL}/api/push/retry-pending")
                        .post(body)
                        .addHeader("Authorization", "Bearer $authToken")
                        .build()
                    httpClient.newCall(req).execute().close()
                } catch (ignored: Exception) {}
            }
        }

        if (::webView.isInitialized) {
            runOnUiThread {
                webView.evaluateJavascript(
                    "try { window.dispatchEvent(new CustomEvent('tumpang:networkRestored')); } catch(e) {}",
                    null
                )
            }
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val status = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            if (status != PackageManager.PERMISSION_GRANTED) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        val filter = IntentFilter(TumpangFirebaseMessagingService.ACTION_NEW_ORDER_RECEIVED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(orderBroadcastReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(orderBroadcastReceiver, filter)
        }
    }

    override fun onPause() {
        super.onPause()
        try {
            unregisterReceiver(orderBroadcastReceiver)
        } catch (ignored: Exception) {}
    }

    override fun onDestroy() {
        if (networkCallbackRegistered) {
            try {
                val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                cm.unregisterNetworkCallback(networkCallback)
            } catch (ignored: Exception) {}
            networkCallbackRegistered = false
        }
        if (::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }
}
