package expo.modules.euphoricaudio

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.URL
import android.media.MediaMetadataRetriever
import android.util.Base64

class EuphoricAudioModule : Module() {
  companion object {
    init {
      System.loadLibrary("euphoric-audio")
    }
  }

  private external fun nativeStartAudio()
  private external fun nativeStopAudio()
  private external fun nativeLoadAudio(filePath: String): Boolean
  private external fun nativeSeekTo(seconds: Double)
  private external fun nativeGetPosition(): Double
  private external fun nativeGetDuration(): Double
  private external fun nativeGetSampleRate(): Int

  override fun definition() = ModuleDefinition {
    Name("EuphoricAudio")

    AsyncFunction("getArtwork") { uri: String ->
      val path = if (uri.startsWith("file://")) uri.substring(7) else uri
      android.util.Log.i("EuphoricAudio", "Extracting artwork from: $path")
      try {
        val retriever = MediaMetadataRetriever()
        retriever.setDataSource(path)
        val art = retriever.embeddedPicture
        retriever.release()
        if (art != null) {
          android.util.Log.i("EuphoricAudio", "Artwork found, size: ${art.size}")
          "data:image/jpeg;base64," + Base64.encodeToString(art, Base64.NO_WRAP)
        } else {
          android.util.Log.i("EuphoricAudio", "No embedded artwork found")
          null
        }
      } catch (e: Exception) {
        android.util.Log.e("EuphoricAudio", "Artwork error: ${e.message}")
        null
      }
    }

    Function("startAudio") {
      nativeStartAudio()
    }

    Function("stopAudio") {
      nativeStopAudio()
    }

    Function("seekTo") { seconds: Double ->
      nativeSeekTo(seconds)
    }

    Function("getStatus") {
      mapOf(
        "position" to nativeGetPosition(),
        "duration" to nativeGetDuration(),
        "sampleRate" to nativeGetSampleRate()
      )
    }

    Function("loadAudio") { uri: String ->
      // Strip file:// prefix if present
      val path = if (uri.startsWith("file://")) {
        uri.substring(7)
      } else {
        uri
      }
      nativeLoadAudio(path)
    }

    // Defines constant property on the module.
    Constant("PI") {
      Math.PI
    }

    // Defines event names that the module can send to JavaScript.
    Events("onChange")

    // Defines a JavaScript synchronous function that runs the native code on the JavaScript thread.
    Function("hello") {
      "Hello world! 👋"
    }

    // Defines a JavaScript function that always returns a Promise and whose native code
    // is by default dispatched on the different thread than the JavaScript runtime runs on.
    AsyncFunction("setValueAsync") { value: String ->
      // Send an event to JavaScript.
      sendEvent("onChange", mapOf(
        "value" to value
      ))
    }

    // Enables the module to be used as a native view. Definition components that are accepted as part of
    // the view definition: Prop, Events.
    View(EuphoricAudioView::class) {
      // Defines a setter for the `url` prop.
      Prop("url") { view: EuphoricAudioView, url: URL ->
        view.webView.loadUrl(url.toString())
      }
      // Defines an event that the view can send to JavaScript.
      Events("onLoad")
    }
  }
}
