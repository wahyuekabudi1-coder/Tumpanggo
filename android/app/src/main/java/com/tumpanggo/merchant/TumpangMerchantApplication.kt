package com.tumpanggo.merchant

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Bundle
import android.util.Log
import com.google.firebase.FirebaseApp

class TumpangMerchantApplication : Application(), Application.ActivityLifecycleCallbacks {

    companion object {
        const val TAG = "TumpangApp"

        @Volatile
        private var startedActivityCount: Int = 0

        val isAppInForeground: Boolean
            get() = startedActivityCount > 0

        fun isFirebaseInitialized(context: Context): Boolean {
            return try {
                FirebaseApp.getApps(context).isNotEmpty()
            } catch (e: Exception) {
                false
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        registerActivityLifecycleCallbacks(this)
        Log.i(TAG, "Initializing TumpangGo Merchant Application...")

        // Ensure Android notification channels exist even when cold-started in background by FCM
        NotificationHelper.createNotificationChannels(this)
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

    override fun onActivityStarted(activity: Activity) {
        startedActivityCount++
    }

    override fun onActivityResumed(activity: Activity) {}

    override fun onActivityPaused(activity: Activity) {}

    override fun onActivityStopped(activity: Activity) {
        startedActivityCount = (startedActivityCount - 1).coerceAtLeast(0)
    }

    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

    override fun onActivityDestroyed(activity: Activity) {}
}
