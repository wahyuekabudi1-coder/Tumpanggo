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
import java.util.concurrent.TimeUnit

/**
 * Native Firebase Cloud Messaging Service for TumpangGo Merchant.
 *
 * Receives high-priority data-only FCM messages even when MainActivity / WebView is closed,
 * swipe-killed, or the device screen is off/locked.
 */
class TumpangFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "TumpangFCM"
        const val PREFS_NAME = "tumpang_merchant_prefs"
        const val KEY_FCM_TOKEN = "fcm_token"
        const val KEY_MERCHANT_ID = "authenticated_merchant_id"
        const val KEY_AUTH_TOKEN = "auth_jwt_token"
        const val KEY_TOKEN_SYNCED = "fcm_token_synced"
        const val ACTION_NEW_ORDER_RECEIVED = "com.tumpanggo.merchant.NEW_ORDER_RECEIVED"
        const val SERVER_URL = "https://tumpanggo.vercel.app"
        const val APP_VERSION = "1.1.0"

        private val sharedHttpClient: OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .build()

        private fun normalizeMerchantId(raw: String?): String {
            return (raw ?: "").trim().removePrefix("merchant_")
        }

        fun syncTokenWithBackendSync(
            context: Context,
            merchantId: String,
            fcmToken: String,
            authToken: String?,
            oldFcmToken: String? = null
        ): Boolean {
            if (merchantId.isBlank() || fcmToken.isBlank()) return false
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return try {
                val jsonPayload = JSONObject().apply {
                    put("role", "MERCHANT")
                    put("entityId", merchantId)
                    put("fcmToken", fcmToken)
                    if (!oldFcmToken.isNullOrBlank() && oldFcmToken != fcmToken) {
                        put("oldFcmToken", oldFcmToken)
                    }
                    put("deviceInfo", "Android Native APK (${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL})")
                    put("appVersion", APP_VERSION)
                }

                val requestBody = jsonPayload.toString().toRequestBody("application/json".toMediaType())
                val requestBuilder = Request.Builder()
                    .url("$SERVER_URL/api/push/subscribe")
                    .post(requestBody)

                if (!authToken.isNullOrBlank()) {
                    requestBuilder.addHeader("Authorization", "Bearer $authToken")
                }

                sharedHttpClient.newCall(requestBuilder.build()).execute().use { response ->
                    val ok = response.isSuccessful
                    prefs.edit().putBoolean(KEY_TOKEN_SYNCED, ok).apply()
                    if (ok) {
                        Log.i(TAG, "FCM token synced for merchant=$merchantId")
                    } else {
                        Log.w(TAG, "FCM token sync rejected (HTTP ${response.code})")
                    }
                    ok
                }
            } catch (e: Exception) {
                prefs.edit().putBoolean(KEY_TOKEN_SYNCED, false).apply()
                Log.w(TAG, "Network error syncing FCM token (will retry on connectivity restore): ${e.message}")
                false
            }
        }

        fun unregisterTokenFromBackendAsync(fcmToken: String, merchantId: String?) {
            if (fcmToken.isBlank()) return
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val jsonPayload = JSONObject().apply {
                        put("fcmToken", fcmToken)
                        if (!merchantId.isNullOrBlank()) {
                            put("entityId", merchantId)
                        }
                    }
                    val requestBody = jsonPayload.toString().toRequestBody("application/json".toMediaType())
                    val request = Request.Builder()
                        .url("$SERVER_URL/api/push/unsubscribe")
                        .post(requestBody)
                        .build()

                    sharedHttpClient.newCall(request).execute().use { response ->
                        Log.i(TAG, "Unbound FCM token from backend (HTTP ${response.code})")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Non-fatal error unbinding FCM token: ${e.message}")
                }
            }
        }
    }

    /**
     * Triggered on initial install or whenever Firebase rotates the device registration token.
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "FCM onNewToken received (prefix=${token.take(12)}...)")

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val previousToken = prefs.getString(KEY_FCM_TOKEN, null)

        prefs.edit()
            .putString(KEY_FCM_TOKEN, token)
            .putBoolean(KEY_TOKEN_SYNCED, false)
            .apply()

        val merchantId = prefs.getString(KEY_MERCHANT_ID, null)
        val authToken = prefs.getString(KEY_AUTH_TOKEN, null)

        if (!merchantId.isNullOrBlank() && !authToken.isNullOrBlank()) {
            CoroutineScope(Dispatchers.IO).launch {
                syncTokenWithBackendSync(
                    context = applicationContext,
                    merchantId = merchantId,
                    fcmToken = token,
                    authToken = authToken,
                    oldFcmToken = previousToken
                )
            }
        }
    }

    /**
     * Invoked for all incoming data-only FCM messages regardless of whether the app is in
     * foreground, background, locked screen, swipe-closed, or killed by Android OS memory pressure.
     */
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "TumpangGoMerchant:FCMOrderWakeLock"
        )
        try {
            wakeLock.acquire(10_000L)
        } catch (e: Exception) {
            Log.w(TAG, "WakeLock acquire notice: ${e.message}")
        }

        try {
            val data = remoteMessage.data
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val loggedInMerchantId = prefs.getString(KEY_MERCHANT_ID, null)
            val fcmToken = prefs.getString(KEY_FCM_TOKEN, null)

            // Guard 1: Do not display store order notifications if no merchant is logged in on this device
            if (loggedInMerchantId.isNullOrBlank()) {
                Log.w(TAG, "Ignoring FCM message because no merchant account is authenticated on this device.")
                if (!fcmToken.isNullOrBlank()) {
                    unregisterTokenFromBackendAsync(fcmToken, data["merchantId"])
                }
                return
            }

            val payloadMerchantId = data["merchantId"] ?: ""
            // Guard 2: Verify target store matches the authenticated merchant on this device
            if (
                payloadMerchantId.isNotBlank() &&
                normalizeMerchantId(payloadMerchantId) != normalizeMerchantId(loggedInMerchantId)
            ) {
                Log.w(
                    TAG,
                    "Ignoring FCM message intended for another store ($payloadMerchantId != $loggedInMerchantId)."
                )
                return
            }

            val type = data["type"] ?: "NEW_ORDER"
            val eventId = data["eventId"] ?: (remoteMessage.messageId ?: "")
            val orderId = data["orderId"] ?: ""
            val orderNumber = data["orderNumber"] ?: orderId.removePrefix("ord_").uppercase()
            val customerName = data["customerName"] ?: "Pelanggan"
            val itemCount = data["itemCount"] ?: "1"
            val totalOrSubtotal = data["total"] ?: data["subtotal"] ?: "0"
            val pendingCount = data["pendingCount"]?.toIntOrNull() ?: 1
            val unhandledOrderIdsJson = data["unhandledOrderIds"] ?: ""

            if (type == "TEST_NOTIFICATION") {
                val title = data["title"] ?: remoteMessage.notification?.title ?: "Tes Notifikasi TumpangGo Merchant"
                val body = data["body"] ?: remoteMessage.notification?.body
                    ?: "Push notification native aktif dan siap menerima pesanan baru."
                NotificationHelper.showTestNotification(
                    context = applicationContext,
                    title = title,
                    body = body,
                    merchantId = loggedInMerchantId
                )
                return
            }

            if (orderId.isNotBlank()) {
                // Always post native system notification via NotificationHelper (single source of sound & banner)
                NotificationHelper.showOrderNotification(
                    context = applicationContext,
                    eventId = eventId,
                    orderId = orderId,
                    orderNumber = orderNumber,
                    customerName = customerName,
                    itemCount = itemCount,
                    subtotal = totalOrSubtotal,
                    pendingCount = pendingCount,
                    merchantId = loggedInMerchantId,
                    unhandledOrderIdsJson = unhandledOrderIdsJson
                )

                // If app is currently open in foreground, notify MainActivity to refresh order list silently
                if (TumpangMerchantApplication.isAppInForeground) {
                    val orderBroadcast = Intent(ACTION_NEW_ORDER_RECEIVED).apply {
                        putExtra(MainActivity.EXTRA_ORDER_ID, orderId)
                        putExtra(MainActivity.EXTRA_ORDER_NUMBER, orderNumber)
                        setPackage(packageName)
                    }
                    sendBroadcast(orderBroadcast)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling FCM message: ${e.message}", e)
        } finally {
            if (wakeLock.isHeld) {
                try {
                    wakeLock.release()
                } catch (ignored: Exception) {}
            }
        }
    }
}
