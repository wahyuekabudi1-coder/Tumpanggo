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
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object NotificationHelper {
    private const val TAG = "NotificationHelper"
    const val CHANNEL_ORDERS_ID = "tumpanggo_merchant_orders"
    const val CHANNEL_GENERAL_ID = "tumpanggo_merchant_general"
    const val GROUP_ORDERS = "com.tumpanggo.merchant.ORDERS"
    const val SUMMARY_NOTIFICATION_ID = 1001

    /**
     * Initializes Android Notification Channels with high priority and custom ringtone sound.
     */
    fun createNotificationChannels(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // 1. Channel for Incoming Orders (Highest priority, custom telephone cadence sound)
            val ordersChannelName = "Pesanan Baru TumpangGo Merchant"
            val ordersChannelDesc = "Peringatan suara dering telepon saat ada pesanan baru masuk ke dapur"
            val importance = NotificationManager.IMPORTANCE_HIGH

            val soundUri = Uri.parse(
                "${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/${R.raw.order_ringtone}"
            )

            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .build()

            val ordersChannel = NotificationChannel(CHANNEL_ORDERS_ID, ordersChannelName, importance).apply {
                description = ordersChannelDesc
                enableLights(true)
                lightColor = Color.parseColor("#15803D")
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 200, 500, 200, 800)
                setSound(soundUri, audioAttributes)
                lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
                setShowBadge(true)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    setAllowBubbles(true)
                }
            }

            // 2. Channel for General Alerts & Testing
            val generalChannel = NotificationChannel(
                CHANNEL_GENERAL_ID,
                "Informasi & Tes TumpangGo",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Pembaruan akun toko dan tes notifikasi"
                enableLights(true)
                lightColor = Color.parseColor("#15803D")
            }

            notificationManager.createNotificationChannel(ordersChannel)
            notificationManager.createNotificationChannel(generalChannel)
            Log.i(TAG, "Notification channels successfully created with custom ringtone: $soundUri")
        }
    }

    /**
     * Shows a high-priority system notification for a new incoming order.
     */
    fun showOrderNotification(
        context: Context,
        orderId: String,
        orderNumber: String,
        customerName: String,
        itemCount: String,
        subtotal: String,
        pendingCount: Int = 1,
        merchantId: String = ""
    ) {
        // Ensure channels are present
        createNotificationChannels(context)

        // PendingIntent to launch MainActivity and navigate to the order
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(MainActivity.EXTRA_ORDER_ID, orderId)
            putExtra(MainActivity.EXTRA_ORDER_NUMBER, orderNumber)
            putExtra(MainActivity.EXTRA_MERCHANT_ID, merchantId)
            putExtra(MainActivity.EXTRA_TARGET_URL, "/merchant?id=${Uri.encode(merchantId)}&orderId=${Uri.encode(orderId)}")
        }

        val requestCode = orderId.hashCode()
        val pendingIntent = PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val soundUri = Uri.parse(
            "${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/${R.raw.order_ringtone}"
        )

        val title = if (pendingCount > 1) {
            "🔔 $pendingCount Pesanan Baru Menunggu! (#$orderNumber)"
        } else {
            "🔔 Pesanan Baru Masuk! #$orderNumber"
        }

        val body = "$itemCount item siap dimasak dari $customerName. Buka dapur TumpangGo sekarang!"

        val notificationBuilder = NotificationCompat.Builder(context, CHANNEL_ORDERS_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText("$body\nTotal: Rp $subtotal\nTekan untuk membuka rincian pesanan."))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL) // High priority call-like alert
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 500, 200, 500, 200, 800))
            .setContentIntent(pendingIntent)
            .setGroup(GROUP_ORDERS)

        val notificationManager = NotificationManagerCompat.from(context)
        try {
            val notificationId = (orderId.hashCode() and 0x7FFFFFFF)
            notificationManager.notify(notificationId, notificationBuilder.build())

            // If there are multiple pending orders, display a summary notification to group them cleanly
            if (pendingCount > 1) {
                val summaryNotification = NotificationCompat.Builder(context, CHANNEL_ORDERS_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setStyle(
                        NotificationCompat.InboxStyle()
                            .setSummaryText("$pendingCount pesanan baru menunggu di dapur")
                            .setBigContentTitle("Pesanan Baru TumpangGo")
                    )
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setGroup(GROUP_ORDERS)
                    .setGroupSummary(true)
                    .setAutoCancel(true)
                    .setContentIntent(pendingIntent)
                    .build()

                notificationManager.notify(SUMMARY_NOTIFICATION_ID, summaryNotification)
            }
            Log.i(TAG, "Posted order notification #$orderNumber (ID: $orderId, PendingCount: $pendingCount)")
        } catch (e: SecurityException) {
            Log.w(TAG, "Notification permission missing on Android 13+: ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show order notification: ${e.message}", e)
        }
    }

    /**
     * Cancels an order notification when handled/completed
     */
    fun cancelOrderNotification(context: Context, orderId: String) {
        try {
            val notificationManager = NotificationManagerCompat.from(context)
            val notificationId = (orderId.hashCode() and 0x7FFFFFFF)
            notificationManager.cancel(notificationId)
        } catch (e: Exception) {
            Log.w(TAG, "Error cancelling notification for $orderId: ${e.message}")
        }
    }
}
