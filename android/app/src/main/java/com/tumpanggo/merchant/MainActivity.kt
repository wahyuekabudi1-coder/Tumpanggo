package com.tumpanggo.merchant

import android.Manifest
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
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

    // Register Android 13+ Notification Permission Launcher
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            Log.i(TAG, "Notification permission GRANTED by user.")
            NotificationHelper.createNotificationChannels(this)
        } else {
            Log.w(TAG, "Notification permission DENIED by user.")
            Toast.makeText(
                this,
                "Izin notifikasi ditolak. Anda mungkin tidak menerima peringatan pesanan baru saat aplikasi ditutup.",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    // Broadcast receiver for incoming orders while app is running
    private val orderBroadcastReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val orderId = intent?.getStringExtra(EXTRA_ORDER_ID)
            val orderNumber = intent?.getStringExtra(EXTRA_ORDER_NUMBER)
            Log.i(TAG, "Broadcast received in foreground activity for order: $orderNumber ($orderId)")
            if (!orderId.isNullOrEmpty()) {
                notifyWebAppNewOrder(orderId, orderNumber ?: "")
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize notification channels
        NotificationHelper.createNotificationChannels(this)

        // Check & request notification permission on Android 13+
        requestNotificationPermissionIfNeeded()

        // Build UI programmatically for robust layout
        setupViews()

        // Extract any intent extras from launch or notification click
        handleIntent(intent)

        // Configure Back Pressed Dispatcher
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
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
        settings.mediaPlaybackRequiresUserGesture = false // Allow audible ringtone
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.setSupportZoom(false)

        val bridge = MerchantWebBridge(this) {
            requestNotificationPermissionIfNeeded()
        }

        // Expose Native JavaScript Bridge
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
                // Check if there is a pending order to highlight
                pendingOrderId?.let { id ->
                    notifyWebAppNewOrder(id, "")
                    pendingOrderId = null
                }
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    swipeRefresh.isRefreshing = false
                    Log.w(TAG, "WebView navigation error: ${error?.description}")
                }
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                // Handle tel: or whatsapp: links externally
                if (url.startsWith("tel:") || url.startsWith("whatsapp:") || url.startsWith("intent:")) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        return true
                    } catch (e: Exception) {
                        Log.w(TAG, "Could not launch external intent: ${e.message}")
                    }
                }
                return false
            }
        }

        val urlToLoad = pendingTargetUrl ?: DEFAULT_URL
        Log.i(TAG, "Loading initial URL in WebView: $urlToLoad")
        webView.loadUrl(urlToLoad)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent == null) return

        val orderId = intent.getStringExtra(EXTRA_ORDER_ID)
        val orderNumber = intent.getStringExtra(EXTRA_ORDER_NUMBER)
        val targetUrl = intent.getStringExtra(EXTRA_TARGET_URL)

        Log.i(TAG, "Handling intent: orderId=$orderId, orderNumber=$orderNumber, targetUrl=$targetUrl")

        if (!orderId.isNullOrEmpty()) {
            pendingOrderId = orderId
            // Dismiss notification since user has tapped it
            NotificationHelper.cancelOrderNotification(this, orderId)
            notifyWebAppNewOrder(orderId, orderNumber ?: "")
        }

        if (!targetUrl.isNullOrEmpty()) {
            val fullUrl = if (targetUrl.startsWith("http")) targetUrl else "https://tumpanggo.vercel.app$targetUrl"
            if (::webView.isInitialized) {
                webView.loadUrl(fullUrl)
            } else {
                pendingTargetUrl = fullUrl
            }
        }
    }

    private fun notifyWebAppNewOrder(orderId: String, orderNumber: String) {
        if (::webView.isInitialized) {
            val script = """
                (function() {
                    try {
                        window.dispatchEvent(new CustomEvent('tumpang:openOrder', {
                            detail: { orderId: '$orderId', orderNumber: '$orderNumber' }
                        }));
                    } catch (e) {}
                })();
            """.trimIndent()
            webView.evaluateJavascript(script, null)
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val status = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            if (status != PackageManager.PERMISSION_GRANTED) {
                Log.i(TAG, "Requesting POST_NOTIFICATIONS runtime permission...")
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
        webView.destroy()
        super.onDestroy()
    }
}
