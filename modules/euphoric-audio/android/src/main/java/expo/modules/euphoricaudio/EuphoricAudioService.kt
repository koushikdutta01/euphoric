package expo.modules.euphoricaudio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.media.session.MediaSession

class EuphoricAudioService : Service() {
    private val binder = LocalBinder()
    private val CHANNEL_ID = "euphoric_audio_channel"
    private val NOTIFICATION_ID = 42

    inner class LocalBinder : Binder() {
        fun getService(): EuphoricAudioService = this@EuphoricAudioService
    }

    override fun onBind(intent: Intent): IBinder {
        return binder
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Euphoric Audio"
            val descriptionText = "Playback controls"
            val importance = NotificationManager.IMPORTANCE_LOW
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
                setShowBadge(false)
            }
            val notificationManager: NotificationManager =
                getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    fun startForegroundService(notification: Notification) {
        startForeground(NOTIFICATION_ID, notification)
    }

    fun stopForegroundService() {
        stopForeground(true)
        stopSelf()
    }
}
