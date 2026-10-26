# Keep JavascriptInterface methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-keepclassmembers class com.tumpanggo.merchant.MerchantWebBridge {
    <methods>;
}

# Keep Firebase Messaging
-keep class com.google.firebase.messaging.** { *; }
-dontwarn com.google.firebase.messaging.**

# Keep OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
