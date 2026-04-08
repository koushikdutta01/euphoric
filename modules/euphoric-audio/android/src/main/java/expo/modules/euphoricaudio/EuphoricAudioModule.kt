package expo.modules.euphoricaudio

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.URL
import android.media.MediaMetadataRetriever
import android.util.Base64
import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Build
import android.graphics.Bitmap
import android.net.Uri

class EuphoricAudioModule : Module() {
  private var mediaSession: MediaSession? = null
  private val NOTIFICATION_ID = 42
  private val CHANNEL_ID = "euphoric_audio_channel"
  
  private var currentTitle: String = "Euphoric Track"
  private var currentArtist: String = "Bit-Perfect Audio"
  private var currentArtwork: Bitmap? = null
  private var currentDurationMs: Long = 0

  companion object {
    init {
      System.loadLibrary("euphoric-audio")
    }
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exception("React context is not available")

  private external fun nativeStartAudio()
  private external fun nativeStopAudio()
  private external fun nativeLoadAudio(filePath: String): Boolean
  private external fun nativeSeekTo(seconds: Double)
  private external fun nativeGetPosition(): Double
  private external fun nativeGetDuration(): Double
  private external fun nativeGetSampleRate(): Int

  private fun initMediaSession() {
    if (mediaSession != null) return

    mediaSession = MediaSession(context, "EuphoricAudio").apply {
      setCallback(object : MediaSession.Callback() {
        override fun onPlay() {
          nativeStartAudio()
          updatePlaybackState(true)
        }
        override fun onPause() {
          nativeStopAudio()
          updatePlaybackState(false)
        }
        override fun onStop() {
          nativeStopAudio()
          updatePlaybackState(false)
        }
        override fun onSeekTo(pos: Long) {
          nativeSeekTo(pos / 1000.0)
          updatePlaybackState(true)
        }
      })
      isActive = true
    }
    createNotificationChannel()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (notificationManager.getNotificationChannel(CHANNEL_ID) == null) {
        val channel = NotificationChannel(CHANNEL_ID, "Euphoric Audio", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Playback controls"
          setShowBadge(false)
        }
        notificationManager.createNotificationChannel(channel)
      }
    }
  }

  private fun updatePlaybackState(isPlaying: Boolean) {
    val state = if (isPlaying) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED
    val position = (nativeGetPosition() * 1000).toLong()
    
    val playbackState = PlaybackState.Builder()
      .setActions(
        PlaybackState.ACTION_PLAY or 
        PlaybackState.ACTION_PAUSE or 
        PlaybackState.ACTION_STOP or
        PlaybackState.ACTION_PLAY_PAUSE or
        PlaybackState.ACTION_SEEK_TO
      )
      .setState(state, position, 1.0f)
      .build()
      
    mediaSession?.setPlaybackState(playbackState)
    showNotification(isPlaying)
  }

  private fun updateMetadata(title: String, artist: String, artworkBase64: String?, duration: Double) {
    currentTitle = if (title.isNullOrEmpty() || title == "Unknown") "Euphoric Track" else title
    currentArtist = if (artist.isNullOrEmpty() || artist == "Unknown Artist") "Bit-Perfect Audio" else artist
    currentDurationMs = (duration * 1000).toLong()
    
    if (currentDurationMs <= 0) {
      currentDurationMs = (nativeGetDuration() * 1000).toLong()
    }

    val builder = MediaMetadata.Builder()
      .putString(MediaMetadata.METADATA_KEY_TITLE, currentTitle)
      .putString(MediaMetadata.METADATA_KEY_ARTIST, currentArtist)
      .putLong(MediaMetadata.METADATA_KEY_DURATION, currentDurationMs)

    if (!artworkBase64.isNullOrEmpty()) {
      try {
        val pureBase64 = if (artworkBase64.contains(",")) artworkBase64.split(",")[1] else artworkBase64
        val decodedString = Base64.decode(pureBase64, Base64.DEFAULT)
        val bitmap = BitmapFactory.decodeByteArray(decodedString, 0, decodedString.size)
        if (bitmap != null) {
          currentArtwork = Bitmap.createScaledBitmap(bitmap, 512, 512, true)
          builder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, currentArtwork)
        }
      } catch (e: Exception) {
        currentArtwork = null
      }
    } else {
      currentArtwork = null
    }

    mediaSession?.setMetadata(builder.build())
  }

  private fun showNotification(isPlaying: Boolean) {
    try {
      val playPauseIcon = if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play
      val playPauseTitle = if (isPlaying) "Pause" else "Play"

      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      val pendingIntent = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE)

      val notificationBuilder = android.app.Notification.Builder(context, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_media_play)
        .setContentTitle(currentTitle)
        .setContentText(currentArtist)
        .setLargeIcon(currentArtwork)
        .setContentIntent(pendingIntent)
        .setOngoing(isPlaying)
        .setOnlyAlertOnce(true)
        .setVisibility(android.app.Notification.VISIBILITY_PUBLIC)
        .setStyle(android.app.Notification.MediaStyle()
          .setMediaSession(mediaSession?.sessionToken)
          .setShowActionsInCompactView(0)
        )
        .addAction(android.app.Notification.Action.Builder(playPauseIcon, playPauseTitle, null).build())

      val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      notificationManager.notify(NOTIFICATION_ID, notificationBuilder.build())
    } catch (e: Exception) {
      android.util.Log.e("EuphoricAudio", "showNotification error: ${e.message}")
    }
  }

  override fun definition() = ModuleDefinition {
    Name("EuphoricAudio")

    AsyncFunction("getMetadata") { uri: String ->
      val retriever = MediaMetadataRetriever()
      try {
        if (uri.startsWith("content://")) {
          retriever.setDataSource(context, Uri.parse(uri))
        } else {
          val path = if (uri.startsWith("file://")) uri.substring(7) else uri
          retriever.setDataSource(path)
        }
        
        val title = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE)
        val artist = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST)
        
        mapOf(
          "title" to (title ?: ""),
          "artist" to (artist ?: "")
        )
      } catch (e: Exception) {
        null
      } finally {
        retriever.release()
      }
    }

    AsyncFunction("getArtwork") { uri: String ->
      val retriever = MediaMetadataRetriever()
      try {
        if (uri.startsWith("content://")) {
          retriever.setDataSource(context, Uri.parse(uri))
        } else {
          val path = if (uri.startsWith("file://")) uri.substring(7) else uri
          retriever.setDataSource(path)
        }
        val art = retriever.embeddedPicture
        if (art != null) {
          "data:image/jpeg;base64," + Base64.encodeToString(art, Base64.NO_WRAP)
        } else {
          null
        }
      } catch (e: Exception) {
        null
      } finally {
        retriever.release()
      }
    }

    Function("startAudio") {
      initMediaSession()
      nativeStartAudio()
      updatePlaybackState(true)
    }

    Function("stopAudio") {
      nativeStopAudio()
      updatePlaybackState(false)
    }

    Function("seekTo") { seconds: Double ->
      nativeSeekTo(seconds)
      updatePlaybackState(isPlaying = true)
    }

    Function("updateMetadata") { title: String, artist: String, artwork: String?, duration: Double ->
      initMediaSession()
      updateMetadata(title, artist, artwork, duration)
      showNotification(true)
    }

    Function("getStatus") {
      mapOf(
        "position" to nativeGetPosition(),
        "duration" to nativeGetDuration(),
        "sampleRate" to nativeGetSampleRate()
      )
    }

    Function("loadAudio") { uri: String ->
      val path = if (uri.startsWith("file://")) uri.substring(7) else uri
      nativeLoadAudio(path)
    }
  }
}
