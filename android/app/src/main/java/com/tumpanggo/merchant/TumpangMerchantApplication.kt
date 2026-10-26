package com.tumpanggo.merchant

import android.app.Application
import android.util.Log

class TumpangMerchantApplication : Application() {
    companion object {
        const val TAG = "TumpangApp"
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Initializing TumpangGo Merchant Application...")
        // Proactively initialize notification channels on cold start
        NotificationHelper.createNotificationChannels(this)
    }
}
