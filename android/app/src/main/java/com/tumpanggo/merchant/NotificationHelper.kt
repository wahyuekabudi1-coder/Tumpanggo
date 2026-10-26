package com.tumpanggo.merchant

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs

/**
 * Production Android Notification Manager for TumpangGo Merchant.
 *
 * Key Guarantees:
 * - Dedicated channel named "Pesanan Baru TumpangGo Merchant" with custom sound `res/raw/order_ringtone.wav`
 *   using `USAGE_NOTIFICATION` so user silent/vibrate/DND/channel preferences are always respected.
 * - Never deletes/resets an existing channel behind the user's back; provides diagnostics + Settings intent.
 * - Strict deduplication by `eventId` and `orderId` persisted in SharedPreferences.
 * - Authoritative order count & grouping:
 *   - 1 unhandled order  -> "1 Pesanan Baru"
 *   - N unhandled orders -> "3 Pesanan Baru" ("Ada 3 pesanan baru yang perlu diperiksa")
 *   - Individual notifications grouped under `GROUP_ORDERS` without overwriting each other.
 *   - Uses `GROUP_ALERT_CHILDREN` + silent summary updates so child+summary NEVER double-ring.
 *   - Recalculates/clears summary & launcher badge `.setNumber(activeCount)` when orders are handled.
 */
object NotificationHelper {
    private const val TAG = "NotificationHelper"

    const val CHANNEL_ORDERS_ID = "tumpanggo_merchant_orders"
    const val CHANNEL_ORDERS_NAME = "Pesanan Baru TumpangGo Merchant"
    const val CHANNEL_GENERAL_ID = "tumpanggo_merchant_general"
    const val GROUP_ORDERS = "com.tumpanggo.merchant.ORDERS"
    const val SUMMARY_NOTIFICATION_ID = 1001
    private const val TEST_NOTIFICATION_ID = 1002

    private const val STATE_PREFS = "tumpang_notification_state"
    private const val KEY_PROCESSED_EVENTS = "processed_event_ids"
    private const val KEY_ACKNOWLEDGED_ORDERS = "acknowledged_order_ids"
    private const val KEY_ACTIVE_ORDERS_MAP = "active_orders_json"

    private val VIBRATION_PATTERN = longArrayOf(0, 500, 200, 500, 200, 800)

    fun getOrderSoundUri(context: Context): Uri {
        return Uri.parse(
            "${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/${R.raw.order_ringtone}"
        )
    }

    /**
     * Creates notification channels idempotently.
     * Android OS preserves user customizations if the channel already exists.
     */
    fun createNotificationChannels(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            val soundUri = getOrderSoundUri(context)
            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build()

            val ordersChannel = NotificationChannel(
                CHANNEL_ORDERS_ID,
                CHANNEL_ORDERS_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifikasi pesanan baru masuk untuk mitra toko TumpangGo Merchant"
                enableLights(true)
                lightColor = Color.parseColor("#15803D")
                enableVibration(true)
                vibrationPattern = VIBRATION_PATTERN
                setSound(soundUri, audioAttributes)
                lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
                setShowBadge(true)
            }

            val generalChannel = NotificationChannel(
                CHANNEL_GENERAL_ID,
                "Informasi & Status TumpangGo Merchant",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Informasi akun toko dan status koneksi notifikasi"
                enableLights(true)
                lightColor = Color.parseColor("#15803D")
                setShowBadge(false)
            }

            notificationManager.createNotificationChannel(ordersChannel)
            notificationManager.createNotificationChannel(generalChannel)
        }
    }

    /**
     * Inspects current OS notification & channel settings without overriding user preferences.
     */
    fun getChannelDiagnostics(context: Context): JSONObject {
        createNotificationChannels(context)
        val compatManager = NotificationManagerCompat.from(context)
        val appNotificationsEnabled = compatManager.areNotificationsEnabled()

        var channelExists = true
        var channelImportance = NotificationManager.IMPORTANCE_HIGH
        var channelSoundEnabled = true
        var channelVibrationEnabled = true

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val ch = nm.getNotificationChannel(CHANNEL_ORDERS_ID)
            if (ch == null) {
                channelExists = false
            } else {
                channelImportance = ch.importance
                channelSoundEnabled = ch.sound != null && ch.importance >= NotificationManager.IMPORTANCE_DEFAULT
                channelVibrationEnabled = ch.shouldVibrate()
            }
        }

        val activeCount = getActiveOrdersCount(context)

        return JSONObject().apply {
            put("appNotificationsEnabled", appNotificationsEnabled)
            put("channelId", CHANNEL_ORDERS_ID)
            put("channelName", CHANNEL_ORDERS_NAME)
            put("channelExists", channelExists)
            put("channelImportance", channelImportance)
            put("channelBlocked", channelImportance == NotificationManager.IMPORTANCE_NONE)
            put("channelSoundEnabled", channelSoundEnabled)
            put("channelVibrationEnabled", channelVibrationEnabled)
            put("activeNotificationCount", activeCount)
        }
    }

    /**
     * Opens the Android system settings screen for the "Pesanan Baru TumpangGo Merchant" channel
     * so the merchant can adjust sound/vibration/importance safely.
     */
    fun openOrderChannelSettings(context: Context) {
        createNotificationChannels(context)
        try {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                    putExtra(Settings.EXTRA_CHANNEL_ID, CHANNEL_ORDERS_ID)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            } else {
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.fromParts("package", context.packageName, null)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "Fallback opening app notification settings: ${e.message}")
            try {
                val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.fromParts("package", context.packageName, null)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(fallback)
            } catch (ignored: Exception) {}
        }
    }

    private fun stableOrderNotificationId(orderId: String): Int {
        val raw = abs(orderId.hashCode())
        val shifted = (raw % 900_000) + 2_000
        return shifted
    }

    private fun normalizeMerchantId(id: String?): String {
        return (id ?: "").trim().removePrefix("merchant_")
    }

    @Synchronized
    private fun isDuplicateAndRecordEvent(context: Context, eventId: String): Boolean {
        if (eventId.isBlank()) return false
        val prefs = context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE)
        val arr = try {
            JSONArray(prefs.getString(KEY_PROCESSED_EVENTS, "[]") ?: "[]")
        } catch (e: Exception) {
            JSONArray()
        }

        for (i in 0 until arr.length()) {
            if (arr.optString(i) == eventId) {
                return true
            }
        }

        val updated = JSONArray()
        val startIdx = (arr.length() - 99).coerceAtLeast(0)
        for (i in startIdx until arr.length()) {
            updated.put(arr.optString(i))
        }
        updated.put(eventId)
        prefs.edit().putString(KEY_PROCESSED_EVENTS, updated.toString()).apply()
        return false
    }

    @Synchronized
    private fun getAcknowledgedSet(context: Context): MutableSet<String> {
        val prefs = context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE)
        val set = LinkedHashSet<String>()
        try {
            val arr = JSONArray(prefs.getString(KEY_ACKNOWLEDGED_ORDERS, "[]") ?: "[]")
            for (i in 0 until arr.length()) {
                val id = arr.optString(i)
                if (id.isNotBlank()) set.add(id)
            }
        } catch (ignored: Exception) {}
        return set
    }

    @Synchronized
    private fun saveAcknowledgedSet(context: Context, set: Set<String>) {
        val prefs = context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE)
        val list = set.toList().takeLast(150)
        val arr = JSONArray()
        list.forEach { arr.put(it) }
        prefs.edit().putString(KEY_ACKNOWLEDGED_ORDERS, arr.toString()).apply()
    }

    @Synchronized
    private fun loadActiveOrdersMap(context: Context): JSONObject {
        val prefs = context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE)
        return try {
            JSONObject(prefs.getString(KEY_ACTIVE_ORDERS_MAP, "{}") ?: "{}")
        } catch (e: Exception) {
            JSONObject()
        }
    }

    @Synchronized
    private fun saveActiveOrdersMap(context: Context, map: JSONObject) {
        val prefs = context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_ACTIVE_ORDERS_MAP, map.toString()).apply()
    }

    @Synchronized
    fun getActiveOrdersCount(context: Context): Int {
        return loadActiveOrdersMap(context).length()
    }

    private fun buildOrderPendingIntent(
        context: Context,
        orderId: String,
        orderNumber: String,
        merchantId: String
    ): PendingIntent {
        val targetPath = if (orderId.isNotBlank()) {
            "/merchant?orderId=${Uri.encode(orderId)}"
        } else {
            "/merchant"
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (orderId.isNotBlank()) putExtra(MainActivity.EXTRA_ORDER_ID, orderId)
            if (orderNumber.isNotBlank()) putExtra(MainActivity.EXTRA_ORDER_NUMBER, orderNumber)
            if (merchantId.isNotBlank()) putExtra(MainActivity.EXTRA_MERCHANT_ID, merchantId)
            putExtra(MainActivity.EXTRA_TARGET_URL, targetPath)
        }

        val requestCode = if (orderId.isNotBlank()) stableOrderNotificationId(orderId) else SUMMARY_NOTIFICATION_ID
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    /**
     * Posts or updates a grouped Android notification for a new incoming order.
     */
    @Synchronized
    fun showOrderNotification(
        context: Context,
        eventId: String = "",
        orderId: String,
        orderNumber: String,
        customerName: String,
        itemCount: String,
        subtotal: String,
        pendingCount: Int = 1,
        merchantId: String = "",
        unhandledOrderIdsJson: String = ""
    ) {
        if (orderId.isBlank()) return

        // 1. Deduplicate by eventId so retried FCM packets never ring twice
        val effectiveEventId = eventId.ifBlank { "new_order:$orderId" }
        if (isDuplicateAndRecordEvent(context, effectiveEventId)) {
            Log.i(TAG, "Ignored duplicate FCM notification event: $effectiveEventId")
            return
        }

        createNotificationChannels(context)
        val notificationManager = NotificationManagerCompat.from(context)
        val activeMap = loadActiveOrdersMap(context)
        val acknowledged = getAcknowledgedSet(context)

        // 2. Reconcile against authoritative unhandledOrderIds from backend DB if provided
        if (unhandledOrderIdsJson.isNotBlank()) {
            try {
                val arr = JSONArray(unhandledOrderIdsJson)
                val authoritativeSet = HashSet<String>()
                for (i in 0 until arr.length()) {
                    val id = arr.optString(i).trim()
                    if (id.isNotEmpty()) authoritativeSet.add(id)
                }

                // Prune any previously tracked orders that are no longer unhandled in backend DB
                val existingKeys = mutableListOf<String>()
                val iter = activeMap.keys()
                while (iter.hasNext()) existingKeys.add(iter.next())

                for (existingId in existingKeys) {
                    if (existingId != orderId && !authoritativeSet.contains(existingId)) {
                        activeMap.remove(existingId)
                        try {
                            notificationManager.cancel(stableOrderNotificationId(existingId))
                        } catch (ignored: Exception) {}
                    }
                }

                // Include any authoritative unhandled orders from backend not yet acknowledged on this device
                for (authId in authoritativeSet) {
                    if (authId != orderId && !activeMap.has(authId) && !acknowledged.contains(authId)) {
                        val cleanCode = authId.removePrefix("ord_").uppercase()
                        activeMap.put(authId, JSONObject().apply {
                            put("orderId", authId)
                            put("orderNumber", "TF-$cleanCode")
                            put("customerName", "Pelanggan")
                            put("itemCount", "1")
                            put("subtotal", "0")
                            put("merchantId", merchantId)
                            put("timestamp", System.currentTimeMillis() - 1000L)
                        })
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed parsing unhandledOrderIdsJson: ${e.message}")
            }
        }

        val alreadyTracked = activeMap.has(orderId)

        // Ensure brand-new incoming order is active (remove from acknowledged if re-created)
        acknowledged.remove(orderId)
        saveAcknowledgedSet(context, acknowledged)

        activeMap.put(orderId, JSONObject().apply {
            put("orderId", orderId)
            put("orderNumber", orderNumber)
            put("customerName", customerName)
            put("itemCount", itemCount)
            put("subtotal", subtotal)
            put("merchantId", merchantId)
            put("timestamp", System.currentTimeMillis())
        })
        saveActiveOrdersMap(context, activeMap)

        val activeCount = activeMap.length().coerceAtLeast(1)
        val formattedRupiah = try {
            val num = subtotal.toLongOrNull() ?: 0L
            if (num > 0L) "Rp %,d".format(java.util.Locale("id", "ID"), num).replace(',', '.') else ""
        } catch (e: Exception) {
            ""
        }

        val childTitle = if (activeCount == 1) {
            "1 Pesanan Baru"
        } else {
            "Pesanan Baru #$orderNumber"
        }

        val amountSegment = if (formattedRupiah.isNotEmpty()) " • $formattedRupiah" else ""
        val childBody = if (activeCount == 1) {
            "Ada 1 pesanan baru (#$orderNumber • $itemCount menu$amountSegment) dari $customerName yang perlu diperiksa."
        } else {
            "$itemCount menu$amountSegment dari $customerName — perlu diperiksa."
        }

        val pendingIntent = buildOrderPendingIntent(context, orderId, orderNumber, merchantId)
        val soundUri = getOrderSoundUri(context)

        // Build individual order notification.
        // GROUP_ALERT_CHILDREN ensures ONLY this child rings once; the summary notification stays silent.
        val childBuilder = NotificationCompat.Builder(context, CHANNEL_ORDERS_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(childTitle)
            .setContentText(childBody)
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .setBigContentTitle(childTitle)
                    .bigText("$childBody\nKetuk untuk memeriksa rincian pesanan.")
            )
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOnlyAlertOnce(alreadyTracked)
            .setSound(soundUri)
            .setVibrate(VIBRATION_PATTERN)
            .setNumber(activeCount)
            .setBadgeIconType(NotificationCompat.BADGE_ICON_SMALL)
            .setContentIntent(pendingIntent)
            .setGroup(GROUP_ORDERS)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)

        try {
            notificationManager.notify(stableOrderNotificationId(orderId), childBuilder.build())
            postOrUpdateGroupSummary(context, activeMap, merchantId)
            Log.i(TAG, "Displayed native notification for order #$orderNumber ($orderId), activeCount=$activeCount")
        } catch (se: SecurityException) {
            Log.w(TAG, "POST_NOTIFICATIONS permission not granted on Android 13+: ${se.message}")
        } catch (e: Exception) {
            Log.e(TAG, "Error displaying order notification: ${e.message}", e)
        }
    }

    /**
     * Updates or cancels the group summary notification ("3 Pesanan Baru") silently without double-ringing.
     */
    @Synchronized
    private fun postOrUpdateGroupSummary(
        context: Context,
        activeMap: JSONObject,
        merchantId: String
    ) {
        val notificationManager = NotificationManagerCompat.from(context)
        val count = activeMap.length()

        try {
            if (count == 0) {
                notificationManager.cancel(SUMMARY_NOTIFICATION_ID)
                return
            }

            if (count == 1) {
                // With 1 remaining order, cancel group summary so Android shows "1 Pesanan Baru" cleanly,
                // and silently ensure that single remaining notification reflects "1 Pesanan Baru".
                notificationManager.cancel(SUMMARY_NOTIFICATION_ID)
                val singleId = activeMap.keys().next()
                val item = activeMap.optJSONObject(singleId)
                if (item != null) {
                    val ordNum = item.optString("orderNumber", singleId)
                    val cust = item.optString("customerName", "Pelanggan")
                    val itemsCnt = item.optString("itemCount", "1")
                    val mId = item.optString("merchantId", merchantId)
                    val singleIntent = buildOrderPendingIntent(context, singleId, ordNum, mId)
                    val singleBody = "Ada 1 pesanan baru (#$ordNum • $itemsCnt menu) dari $cust yang perlu diperiksa."

                    val silentSingle = NotificationCompat.Builder(context, CHANNEL_ORDERS_ID)
                        .setSmallIcon(R.mipmap.ic_launcher)
                        .setContentTitle("1 Pesanan Baru")
                        .setContentText(singleBody)
                        .setStyle(NotificationCompat.BigTextStyle().bigText(singleBody))
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                        .setAutoCancel(true)
                        .setOnlyAlertOnce(true)
                        .setSilent(true)
                        .setNumber(1)
                        .setBadgeIconType(NotificationCompat.BADGE_ICON_SMALL)
                        .setContentIntent(singleIntent)
                        .setGroup(GROUP_ORDERS)
                        .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
                        .build()

                    notificationManager.notify(stableOrderNotificationId(singleId), silentSingle)
                }
                return
            }

            // count >= 2 -> Build InboxStyle Group Summary: e.g. "3 Pesanan Baru"
            val summaryTitle = "$count Pesanan Baru"
            val summaryBody = "Ada $count pesanan baru yang perlu diperiksa untuk toko Anda."
            val inboxStyle = NotificationCompat.InboxStyle()
                .setBigContentTitle(summaryTitle)
                .setSummaryText("$count pesanan perlu diperiksa")

            val entries = mutableListOf<JSONObject>()
            val keys = activeMap.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                activeMap.optJSONObject(k)?.let { entries.add(it) }
            }
            entries.sortByDescending { it.optLong("timestamp", 0L) }

            var latestOrderId = ""
            var latestOrderNumber = ""
            for ((idx, entry) in entries.withIndex()) {
                if (idx == 0) {
                    latestOrderId = entry.optString("orderId", "")
                    latestOrderNumber = entry.optString("orderNumber", "")
                }
                if (idx < 5) {
                    val ordNum = entry.optString("orderNumber", "")
                    val cust = entry.optString("customerName", "Pelanggan")
                    val cnt = entry.optString("itemCount", "1")
                    inboxStyle.addLine("#$ordNum • $cust ($cnt menu)")
                }
            }
            if (entries.size > 5) {
                inboxStyle.addLine("+${entries.size - 5} pesanan baru lainnya")
            }

            val summaryIntent = buildOrderPendingIntent(context, latestOrderId, latestOrderNumber, merchantId)
            val summaryNotification = NotificationCompat.Builder(context, CHANNEL_ORDERS_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(summaryTitle)
                .setContentText(summaryBody)
                .setStyle(inboxStyle)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setGroup(GROUP_ORDERS)
                .setGroupSummary(true)
                .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setAutoCancel(true)
                .setNumber(count)
                .setBadgeIconType(NotificationCompat.BADGE_ICON_SMALL)
                .setContentIntent(summaryIntent)
                .build()

            notificationManager.notify(SUMMARY_NOTIFICATION_ID, summaryNotification)
        } catch (se: SecurityException) {
            Log.w(TAG, "SecurityException updating summary notification: ${se.message}")
        } catch (e: Exception) {
            Log.w(TAG, "Error updating group summary: ${e.message}")
        }
    }

    /**
     * Marks a specific order notification as handled/inspected, cancels its banner,
     * and recalculates the remaining summary count ("3 -> 2 -> 1 -> 0") without mutating DB transaction state.
     */
    @Synchronized
    fun cancelOrderNotification(context: Context, orderId: String) {
        if (orderId.isBlank()) return
        try {
            val notificationManager = NotificationManagerCompat.from(context)
            notificationManager.cancel(stableOrderNotificationId(orderId))

            val acknowledged = getAcknowledgedSet(context)
            acknowledged.add(orderId)
            saveAcknowledgedSet(context, acknowledged)

            val activeMap = loadActiveOrdersMap(context)
            val removedItem = activeMap.optJSONObject(orderId)
            val merchantId = removedItem?.optString("merchantId", "") ?: ""
            if (activeMap.has(orderId)) {
                activeMap.remove(orderId)
                saveActiveOrdersMap(context, activeMap)
            }

            postOrUpdateGroupSummary(context, activeMap, merchantId)
        } catch (e: Exception) {
            Log.w(TAG, "Error cancelling notification for $orderId: ${e.message}")
        }
    }

    /**
     * Synchronizes active tray notifications with the authoritative unhandled order IDs fetched by WebView.
     * Any order already accepted/cooked/cancelled/expired on backend is removed from tray & count updated.
     */
    @Synchronized
    fun syncUnhandledOrderIds(context: Context, unhandledOrderIdsJson: String, merchantId: String = "") {
        try {
            val arr = JSONArray(unhandledOrderIdsJson)
            val unhandledSet = HashSet<String>()
            for (i in 0 until arr.length()) {
                val id = arr.optString(i).trim()
                if (id.isNotEmpty()) unhandledSet.add(id)
            }

            val notificationManager = NotificationManagerCompat.from(context)
            val activeMap = loadActiveOrdersMap(context)
            val existingKeys = mutableListOf<String>()
            val iter = activeMap.keys()
            while (iter.hasNext()) existingKeys.add(iter.next())

            var changed = false
            for (existingId in existingKeys) {
                val itemMerchant = normalizeMerchantId(activeMap.optJSONObject(existingId)?.optString("merchantId"))
                val targetMerchant = normalizeMerchantId(merchantId)
                val sameStore = targetMerchant.isEmpty() || itemMerchant.isEmpty() || itemMerchant == targetMerchant

                if (sameStore && !unhandledSet.contains(existingId)) {
                    activeMap.remove(existingId)
                    notificationManager.cancel(stableOrderNotificationId(existingId))
                    changed = true
                }
            }

            if (changed) {
                saveActiveOrdersMap(context, activeMap)
                postOrUpdateGroupSummary(context, activeMap, merchantId)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error syncing unhandled order IDs: ${e.message}")
        }
    }

    /**
     * Clears all active merchant order notifications (invoked on account logout or store switch).
     */
    @Synchronized
    fun clearAllMerchantNotifications(context: Context) {
        try {
            val notificationManager = NotificationManagerCompat.from(context)
            val activeMap = loadActiveOrdersMap(context)
            val keys = activeMap.keys()
            while (keys.hasNext()) {
                val id = keys.next()
                notificationManager.cancel(stableOrderNotificationId(id))
            }
            notificationManager.cancel(SUMMARY_NOTIFICATION_ID)
            notificationManager.cancel(TEST_NOTIFICATION_ID)
            saveActiveOrdersMap(context, JSONObject())
        } catch (e: Exception) {
            Log.w(TAG, "Error clearing merchant notifications: ${e.message}")
        }
    }

    /**
     * Displays an explicit test push notification on the real order channel so merchants can verify
     * OS permission, banner visibility, and custom ringtone end-to-end without affecting order counts.
     */
    fun showTestNotification(context: Context, title: String, body: String, merchantId: String = "") {
        createNotificationChannels(context)
        val pendingIntent = buildOrderPendingIntent(context, "", "", merchantId)
        val soundUri = getOrderSoundUri(context)

        val builder = NotificationCompat.Builder(context, CHANNEL_ORDERS_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setSound(soundUri)
            .setVibrate(VIBRATION_PATTERN)
            .setContentIntent(pendingIntent)

        try {
            NotificationManagerCompat.from(context).notify(TEST_NOTIFICATION_ID, builder.build())
        } catch (se: SecurityException) {
            Log.w(TAG, "POST_NOTIFICATIONS permission missing for test notification: ${se.message}")
        }
    }
}
