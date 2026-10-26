package com.tumpanggo.merchant

import android.app.Activity
import android.content.Context
import android.media.MediaPlayer
import android.util.Log
import android.webkit.JavascriptInterface
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject

class MerchantWebBridge(
    private val context: Context,
    private val onPermissionRequested: () -> Unit,
    private val onCloseAppRequested: () -> Unit = {}
) {
    companion object {
        private const val TAG = "MerchantWebBridge"
    }

    @Volatile
    private var activeTestPlayer: MediaPlayer? = null

    @JavascriptInterface
    fun isNativeApp(): Boolean = true

    @JavascriptInterface
    fun getFcmToken(): String {
        val prefs = context.getSharedPreferences(TumpangFirebaseMessagingService.PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(TumpangFirebaseMessagingService.KEY_FCM_TOKEN, "") ?: ""
    }

    /**
     * Called by WebView when a merchant authenticates or restores an authenticated session.
     * Binds this device's FCM token to the authenticated store and clears stale notifications if switching stores.
     */
    @JavascriptInterface
    fun setAuthenticatedMerchant(merchantId: String, authToken: String?) {
        val cleanMerchantId = merchantId.trim()
        if (cleanMerchantId.isEmpty()) return

        val prefs = context.getSharedPreferences(TumpangFirebaseMessagingService.PREFS_NAME, Context.MODE_PRIVATE)
        val prevMerchantId = prefs.getString(TumpangFirebaseMessagingService.KEY_MERCHANT_ID, null)

        if (!prevMerchantId.isNullOrBlank() && prevMerchantId != cleanMerchantId) {
            Log.i(TAG, "Merchant account switched ($prevMerchantId -> $cleanMerchantId); clearing previous tray alerts.")
            NotificationHelper.clearAllMerchantNotifications(context.applicationContext)
        }

        prefs.edit()
            .putString(TumpangFirebaseMessagingService.KEY_MERCHANT_ID, cleanMerchantId)
            .putString(TumpangFirebaseMessagingService.KEY_AUTH_TOKEN, authToken)
            .apply()

        if (!TumpangMerchantApplication.isFirebaseInitialized(context)) {
            Log.w(TAG, "FirebaseApp not initialized (missing google-services.json); skipping native token fetch.")
            return
        }

        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (task.isSuccessful && !task.result.isNullOrEmpty()) {
                    val latestToken = task.result
                    val oldToken = prefs.getString(TumpangFirebaseMessagingService.KEY_FCM_TOKEN, null)
                    prefs.edit().putString(TumpangFirebaseMessagingService.KEY_FCM_TOKEN, latestToken).apply()

                    CoroutineScope(Dispatchers.IO).launch {
                        TumpangFirebaseMessagingService.syncTokenWithBackendSync(
                            context = context.applicationContext,
                            merchantId = cleanMerchantId,
                            fcmToken = latestToken,
                            authToken = authToken,
                            oldFcmToken = oldToken
                        )
                    }
                } else {
                    Log.w(TAG, "Unable to retrieve FCM token: ${task.exception?.message}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Exception fetching FCM token: ${e.message}")
        }
    }

    /**
     * Called by WebView when the merchant logs out.
     * Unbinds the FCM token on the backend and clears local credentials + notification tray.
     */
    @JavascriptInterface
    fun clearAuthenticatedMerchant() {
        Log.i(TAG, "Merchant logged out; unbinding FCM token and clearing local session.")
        val prefs = context.getSharedPreferences(TumpangFirebaseMessagingService.PREFS_NAME, Context.MODE_PRIVATE)
        val fcmToken = prefs.getString(TumpangFirebaseMessagingService.KEY_FCM_TOKEN, null)
        val prevMerchantId = prefs.getString(TumpangFirebaseMessagingService.KEY_MERCHANT_ID, null)

        prefs.edit()
            .remove(TumpangFirebaseMessagingService.KEY_MERCHANT_ID)
            .remove(TumpangFirebaseMessagingService.KEY_AUTH_TOKEN)
            .putBoolean(TumpangFirebaseMessagingService.KEY_TOKEN_SYNCED, false)
            .apply()

        NotificationHelper.clearAllMerchantNotifications(context.applicationContext)

        if (!fcmToken.isNullOrBlank()) {
            TumpangFirebaseMessagingService.unregisterTokenFromBackendAsync(fcmToken, prevMerchantId)
        }
    }

    /**
     * Called when a specific order is inspected, accepted, or rejected.
     * Updates the grouped notification count without mutating DB transaction state.
     */
    @JavascriptInterface
    fun onOrderHandled(orderId: String) {
        if (orderId.isBlank()) return
        NotificationHelper.cancelOrderNotification(context.applicationContext, orderId.trim())
    }

    /**
     * Synchronizes active tray notifications with authoritative unhandled order IDs from backend API.
     */
    @JavascriptInterface
    fun syncPendingOrders(unhandledOrderIdsJson: String) {
        val prefs = context.getSharedPreferences(TumpangFirebaseMessagingService.PREFS_NAME, Context.MODE_PRIVATE)
        val merchantId = prefs.getString(TumpangFirebaseMessagingService.KEY_MERCHANT_ID, "") ?: ""
        NotificationHelper.syncUnhandledOrderIds(context.applicationContext, unhandledOrderIdsJson, merchantId)
    }

    /**
     * Plays the custom order ringtone once cleanly without overlapping or looping infinitely.
     */
    @JavascriptInterface
    fun playTestSound() {
        try {
            stopActiveTestPlayer()
            val mp = MediaPlayer.create(context.applicationContext, R.raw.order_ringtone) ?: return
            mp.isLooping = false
            activeTestPlayer = mp
            mp.setOnCompletionListener { player ->
                try {
                    player.release()
                } catch (ignored: Exception) {}
                if (activeTestPlayer === player) {
                    activeTestPlayer = null
                }
            }
            mp.start()
        } catch (e: Exception) {
            Log.e(TAG, "Error playing native test sound: ${e.message}")
        }
    }

    private fun stopActiveTestPlayer() {
        val prev = activeTestPlayer
        activeTestPlayer = null
        if (prev != null) {
            try {
                if (prev.isPlaying) prev.stop()
            } catch (ignored: Exception) {}
            try {
                prev.release()
            } catch (ignored: Exception) {}
        }
    }

    @JavascriptInterface
    fun requestNotificationPermission() {
        onPermissionRequested()
    }

    @JavascriptInterface
    fun openNotificationSettings() {
        NotificationHelper.openOrderChannelSettings(context)
    }

    @JavascriptInterface
    fun getNotificationDiagnostics(): String {
        val prefs = context.getSharedPreferences(TumpangFirebaseMessagingService.PREFS_NAME, Context.MODE_PRIVATE)
        val diag = NotificationHelper.getChannelDiagnostics(context.applicationContext)
        diag.put("firebaseInitialized", TumpangMerchantApplication.isFirebaseInitialized(context))
        diag.put("fcmTokenPresent", !(prefs.getString(TumpangFirebaseMessagingService.KEY_FCM_TOKEN, "").isNullOrBlank()))
        diag.put("fcmTokenSynced", prefs.getBoolean(TumpangFirebaseMessagingService.KEY_TOKEN_SYNCED, false))
        diag.put("sdkInt", android.os.Build.VERSION.SDK_INT)
        return diag.toString()
    }

    @JavascriptInterface
    fun getDeviceInfo(): String {
        return JSONObject().apply {
            put("platform", "Android")
            put("model", android.os.Build.MODEL)
            put("manufacturer", android.os.Build.MANUFACTURER)
            put("sdkInt", android.os.Build.VERSION.SDK_INT)
            put("appVersion", TumpangFirebaseMessagingService.APP_VERSION)
            put("firebaseInitialized", TumpangMerchantApplication.isFirebaseInitialized(context))
        }.toString()
    }

    @JavascriptInterface
    fun closeApp() {
        if (context is Activity) {
            context.runOnUiThread { onCloseAppRequested() }
        } else {
            onCloseAppRequested()
        }
    }
}
