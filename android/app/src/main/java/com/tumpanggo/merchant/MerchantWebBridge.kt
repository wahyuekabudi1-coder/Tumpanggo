package com.tumpanggo.merchant

import android.content.Context
import android.media.MediaPlayer
import android.util.Log
import android.webkit.JavascriptInterface
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class MerchantWebBridge(
    private val context: Context,
    private val onPermissionRequested: () -> Unit
) {
    companion object {
        private const val TAG = "MerchantWebBridge"
    }

    private val httpClient = OkHttpClient()

    @JavascriptInterface
    fun isNativeApp(): Boolean {
        return true
    }

    @JavascriptInterface
    fun getFcmToken(): String {
        val prefs = context.getSharedPreferences(TumpangFirebaseMessagingService.PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(TumpangFirebaseMessagingService.KEY_FCM_TOKEN, "") ?: ""
    }

    /**
     * Called by the web application once a merchant logs in or restores their session.
     * Securely associates the device's FCM token with the authenticated merchant ID.
     */
    @JavascriptInterface
    fun setAuthenticatedMerchant(merchantId: String, authToken: String?) {
        Log.i(TAG, "Merchant authenticated in Web App: $merchantId")
        val prefs = context.getSharedPreferences(TumpangFirebaseMessagingService.PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(TumpangFirebaseMessagingService.KEY_MERCHANT_ID, merchantId)
            .putString(TumpangFirebaseMessagingService.KEY_AUTH_TOKEN, authToken)
            .apply()

        // Fetch latest FCM token and register to backend
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful && !task.result.isNullOrEmpty()) {
                val token = task.result
                prefs.edit().putString(TumpangFirebaseMessagingService.KEY_FCM_TOKEN, token).apply()
                registerToken(merchantId, token, authToken)
            } else {
                Log.w(TAG, "Could not obtain FCM token: ${task.exception?.message}")
            }
        }
    }

    /**
     * Called by the web application when an order is accepted, cooked, or dismissed.
     * Clears the active notification from the Android notification bar.
     */
    @JavascriptInterface
    fun onOrderHandled(orderId: String) {
        Log.i(TAG, "Order handled: $orderId. Dismissing native notification.")
        NotificationHelper.cancelOrderNotification(context, orderId)
    }

    /**
     * Plays the custom notification ringtone directly for testing
     */
    @JavascriptInterface
    fun playTestSound() {
        try {
            val mediaPlayer = MediaPlayer.create(context, R.raw.order_ringtone)
            mediaPlayer.setOnCompletionListener { it.release() }
            mediaPlayer.start()
        } catch (e: Exception) {
            Log.e(TAG, "Error playing test sound: ${e.message}")
        }
    }

    /**
     * Triggers runtime notification permission request on Android 13+
     */
    @JavascriptInterface
    fun requestNotificationPermission() {
        onPermissionRequested()
    }

    /**
     * Synchronously returns device and app diagnostic details
     */
    @JavascriptInterface
    fun getDeviceInfo(): String {
        val json = JSONObject().apply {
            put("platform", "Android")
            put("model", android.os.Build.MODEL)
            put("manufacturer", android.os.Build.MANUFACTURER)
            put("sdkInt", android.os.Build.VERSION.SDK_INT)
            put("appVersion", "1.0.0")
        }
        return json.toString()
    }

    private fun registerToken(merchantId: String, fcmToken: String, authToken: String?) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val jsonPayload = JSONObject().apply {
                    put("role", "MERCHANT")
                    put("entityId", merchantId)
                    put("fcmToken", fcmToken)
                    put("deviceInfo", "Android Native APK (${android.os.Build.MODEL})")
                    put("appVersion", "1.0.0")
                }

                val requestBody = jsonPayload.toString().toRequestBody("application/json".toMediaType())
                val requestBuilder = Request.Builder()
                    .url("${TumpangFirebaseMessagingService.SERVER_URL}/api/push/subscribe")
                    .post(requestBody)

                if (!authToken.isNullOrEmpty()) {
                    requestBuilder.addHeader("Authorization", "Bearer $authToken")
                }

                val response = httpClient.newCall(requestBuilder.build()).execute()
                Log.i(TAG, "FCM registration result (HTTP ${response.code}): ${response.body?.string()}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to register FCM token via bridge: ${e.message}")
            }
        }
    }
}
