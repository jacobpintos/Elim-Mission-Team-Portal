package expo.modules.miriamwake

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.KeywordSpotter
import com.k2fsa.sherpa.onnx.KeywordSpotterConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineStream
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val SAMPLE_RATE = 16000
private const val MODEL = "miriam-wake"

/**
 * Listens on the phone for "Hey Miriam", and nothing else.
 *
 * sherpa-onnx's keyword spotter: a small model (5 MB) that hears whether one
 * phrase was said, rather than writing down everything that is — so nothing
 * heard leaves the phone, and it costs a fraction of what speech recognition
 * would to leave running. The microphone is read at the 16 kHz the model
 * takes and fed to it as it comes.
 *
 * When the phrase is heard, `onWake` is sent and listening stops: the request
 * that follows is for speech recognition, which needs the microphone.
 */
class MiriamWakeModule : Module() {
  private var spotter: KeywordSpotter? = null
  private var record: AudioRecord? = null
  private var thread: Thread? = null
  @Volatile private var listening = false

  override fun definition() = ModuleDefinition {
    Name("MiriamWake")
    Events("onWake")

    Function("isAvailable") { true }

    AsyncFunction("start") { startListening() }

    Function("stop") { stopListening() }

    OnDestroy {
      stopListening()
      spotter?.release()
      spotter = null
    }
  }

  /** The spotter, made once: the model takes a moment to load. */
  @Synchronized
  private fun makeSpotter(): KeywordSpotter {
    spotter?.let { return it }
    val assets = appContext.reactContext?.assets
      ?: throw WakeException("The app is not ready to listen.")
    val config = KeywordSpotterConfig(
      featConfig = FeatureConfig(sampleRate = SAMPLE_RATE, featureDim = 80),
      modelConfig = OnlineModelConfig(
        transducer = OnlineTransducerModelConfig(
          encoder = "$MODEL/encoder.onnx",
          decoder = "$MODEL/decoder.onnx",
          joiner = "$MODEL/joiner.onnx",
        ),
        tokens = "$MODEL/tokens.txt",
        numThreads = 1,
        modelType = "zipformer2",
      ),
      maxActivePaths = 4,
      keywordsFile = "$MODEL/keywords.txt",
      keywordsScore = 2.0f,
      keywordsThreshold = 0.25f,
      numTrailingBlanks = 1,
    )
    return KeywordSpotter(assets, config).also { spotter = it }
  }

  @SuppressLint("MissingPermission") // asked for in JS before starting
  private fun startListening() {
    if (listening) return
    val spotter = makeSpotter()
    val minBuffer = AudioRecord.getMinBufferSize(
      SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
    )
    val rec = AudioRecord(
      MediaRecorder.AudioSource.VOICE_RECOGNITION,
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      maxOf(minBuffer, SAMPLE_RATE / 5 * 2)
    )
    if (rec.state != AudioRecord.STATE_INITIALIZED) {
      rec.release()
      throw WakeException("The microphone is not available.")
    }
    record = rec
    listening = true
    rec.startRecording()
    val stream = spotter.createStream()
    thread = Thread {
      try {
        listen(rec, spotter, stream)
      } finally {
        stream.release()
      }
    }.apply {
      name = "miriam-wake"
      start()
    }
  }

  /** On its own thread: hand the model what is heard, until it is her name or stopped. */
  private fun listen(rec: AudioRecord, spotter: KeywordSpotter, stream: OnlineStream) {
    val chunk = ShortArray(SAMPLE_RATE / 10)
    while (listening) {
      val n = rec.read(chunk, 0, chunk.size)
      if (n <= 0) continue
      val samples = FloatArray(n) { chunk[it] / 32768.0f }
      stream.acceptWaveform(samples, SAMPLE_RATE)
      while (spotter.isReady(stream)) {
        spotter.decode(stream)
        val keyword = spotter.getResult(stream).keyword
        if (keyword.isNotEmpty()) {
          spotter.reset(stream)
          // Stopped first, so the microphone is free for the request.
          listening = false
          releaseRecord()
          sendEvent("onWake", mapOf("keyword" to keyword))
          return
        }
      }
    }
  }

  @Synchronized
  private fun releaseRecord() {
    record?.let {
      try {
        it.stop()
      } catch (_: IllegalStateException) {
      }
      it.release()
    }
    record = null
  }

  private fun stopListening() {
    listening = false
    val t = thread
    thread = null
    if (t != null && t != Thread.currentThread()) t.join(500)
    releaseRecord()
  }
}

private class WakeException(message: String) : CodedException("ERR_MIRIAM_WAKE", message, null)
