package com.tumpanggo.merchant

import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class TumpangFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "TumpangFCM"
        const val PREFS_NAME = "tumpang_merchant_prefs"
        const val KEY_FCM_TOKEN = "fcm_token"
        const val KEY_MERCHANT_ID = "authenticated_merchant_id"
        const val KEY_AUTH_TOKEN = "auth_jwt_token"
        const val ACTION_NEW_ORDER_RECEIVED = "com.tumpanggo.merchant.NEW_ORDER_RECEIVED"
        const val SERVER_URL = "https://tumpanggo.vercel.app"
    }

    private val httpClient = OkHttpClient()

    /**
     * Called when a new FCM registration token is generated (initial launch or rotation)
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "New FCM Device Token received: ${token.take(20)}...")

        // Save token to SharedPreferences
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_FCM_TOKEN, token).apply()

        // Check if merchant is already authenticated; if so, register token immediately to backend
        val merchantId = prefs.getString(KEY_MERCHANT_ID, null)
        val authToken = prefs.getString(KEY_AUTH_TOKEN, null)

        if (!merchantId.isNullOrEmpty()) {
            registerTokenToBackend(merchantId, token, authToken)
        }
    }

    /**
     * Called when a push message is received from FCM.
     * Guaranteed to execute even if the app is killed, phone screen is locked, or app is in background.
     */
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.i(TAG, "FCM message received from: ${remoteMessage.from}")

        // 1. Acquire temporary WakeLock to wake CPU & alert screen
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "TumpangGo:OrderWakeLock"
        )
        try {
            wakeLock.acquire(10000L) // hold max 10s
        } catch (e: Exception) {
            Log.w(TAG, "Failed to acquire WakeLock: ${e.message}")
        }

        try {
            val data = remoteMessage.data
            Log.d(TAG, "Payload data: $data")

            val orderId = data["orderId"] ?: ""
            val orderNumber = data["orderNumber"] ?: (orderId.ifEmpty { "Pesanan Baru" })
            val customerName = data["customerName"] ?: "Pelanggan"
            val itemCount = data["itemCount"] ?: "1"
            val subtotal = data["subtotal"] ?: "0"
            val merchantId = data["merchantId"] ?: ""
            val pendingCount = data["pendingCount"]?.toIntOrNull() ?: 1
            val type = data["type"] ?: "NEW_ORDER"

            // 2. Post high-priority system notification with custom sound
            if (orderId.isNotEmpty() || type == "NEW_ORDER") {
                NotificationHelper.showOrderNotification(
                    context = applicationContext,
                    orderId = orderId,
                    orderNumber = orderNumber,
                    customerName = customerName,
                    itemCount = itemCount,
                    subtotal = subtotal,
                    pendingCount = pendingCount,
                    merchantId = merchantId
                )

                // 3. Send local broadcast so active activity can update UI in real-time
                val orderBroadcast = Intent(ACTION_NEW_ORDER_RECEIVED).apply {
                    putExtra(MainActivity.EXTRA_ORDER_ID, orderId)
                    putExtra(MainActivity.EXTRA_ORDER_NUMBER, orderNumber)
                    setPackage(packageName)
                }
                sendBroadcast(orderBroadcast)
            } else {
                // Test notification or general announcement
                val title = remoteMessage.notification?.title ?: data["title"] ?: "TumpangGo Merchant"
                val body = remoteMessage.notification?.body ?: data["body"] ?: "Notifikasi baru diterima."
                NotificationHelper.showOrderNotification(
                    context = applicationContext,
                    orderId = "general_" + System.currentTimeMillis(),
                    orderNumber = "INFO",
                    customerName = title,
                    itemCount = "1",
                    subtotal = "0",
                    pendingCount = 1,
                    merchantId = merchantId
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error processing incoming FCM message: ${e.message}", e)
        } finally {
            if (wakeLock.isHeld) {
                try {
                    wakeLock.release()
                } catch (ignored: Exception) {}
            }
        }
    }

    /**
     * Registers this device's FCM token to the TumpangGo backend API
     */
    private fun registerTokenToBackend(merchantId: String, fcmToken: String, authToken: String?) {
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
                    .url("$SERVER_URL/api/push/subscribe")
                    .post(requestBody)

                if (!authToken.isNullOrEmpty()) {
                    requestBuilder.addHeader("Authorization", "Bearer $authToken")
                }

                val response = httpClient.newCall(requestBuilder.build()).execute()
                val responseBody = response.body?.string() ?: ""

                if (response.isSuccessful) {
                    Log.i(TAG, "Successfully registered FCM token for merchant $merchantId: $responseBody")
                } else {
                    Log.w(TAG, "Failed to register FCM token (HTTP ${response.code}): $responseBody")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Network exception while registering FCM token: ${e.message}")
            }
        }
    }
}
