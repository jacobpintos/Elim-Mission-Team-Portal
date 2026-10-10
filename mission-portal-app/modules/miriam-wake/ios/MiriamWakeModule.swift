import AVFoundation
import ExpoModulesCore
// Kept out of this module's interface: the app imports MiriamWake (Expo's
// module list does), and built as a static library, a plain import would
// make it find SherpaOnnxC too — which it cannot, failing the build with
// "no such module 'SherpaOnnxC'". Only this file uses it.
@_implementationOnly import SherpaOnnxC

/// Listens on the phone for "Hey Miriam", and nothing else.
///
/// sherpa-onnx's keyword spotter: a small model (5 MB) that hears whether one
/// phrase was said, rather than writing down everything that is — so nothing
/// heard leaves the phone, and it costs a fraction of what speech recognition
/// would to leave running. The microphone is read with AVAudioEngine, as for a
/// call (the phone's own processing for a voice close by), brought down to the
/// 16 kHz the model takes, and fed to it as it comes.
///
/// When the phrase is heard, `onWake` is sent and listening stops: the request
/// that follows is for speech recognition, which needs the microphone. If the
/// microphone changes under it (headphones, a call), it stops and sends
/// `onEnd`, for the app to start it again.
public class MiriamWakeModule: Module {
  /// Made afresh each time listening starts (`startListening`).
  private var engine: AVAudioEngine?
  private var configObserver: NSObjectProtocol?
  /// Where listening is started and stopped: one at a time, whichever thread asks.
  private let control = DispatchQueue(label: "miriam-wake.control")
  /// Where the model runs.
  private let work = DispatchQueue(label: "miriam-wake")
  private var spotter: OpaquePointer?
  private var stream: OpaquePointer?
  private var listening = false
  /// C strings handed to sherpa-onnx, kept for as long as the spotter is.
  private var cStrings: [UnsafeMutablePointer<CChar>] = []

  public func definition() -> ModuleDefinition {
    Name("MiriamWake")
    Events("onWake", "onEnd")

    Function("isAvailable") { () -> Bool in
      return true
    }

    AsyncFunction("start") { (promise: Promise) in
      self.control.async {
        do {
          try self.startListening()
          promise.resolve(nil)
        } catch {
          self.stopListening()
          promise.reject("ERR_MIRIAM_WAKE", error.localizedDescription)
        }
      }
    }

    // Stopped before this returns: the microphone is free for whoever asked.
    Function("stop") {
      self.control.sync { self.stopListening() }
    }

    OnDestroy {
      self.control.sync { self.stopListening() }
      self.work.sync {
        if let spotter = self.spotter {
          SherpaOnnxDestroyKeywordSpotter(spotter)
          self.spotter = nil
        }
      }
      self.cStrings.forEach { free($0) }
      self.cStrings = []
    }
  }

  private func cString(_ s: String) -> UnsafePointer<CChar> {
    let p = strdup(s)!
    cStrings.append(p)
    return UnsafePointer(p)
  }

  /// The spotter, made once: the model takes a moment to load.
  private func makeSpotter() throws -> OpaquePointer {
    if let spotter = spotter { return spotter }
    guard
      let url = Bundle(for: MiriamWakeModule.self).url(forResource: "MiriamWake", withExtension: "bundle"),
      let bundle = Bundle(url: url),
      let encoder = bundle.path(forResource: "encoder", ofType: "onnx"),
      let decoder = bundle.path(forResource: "decoder", ofType: "onnx"),
      let joiner = bundle.path(forResource: "joiner", ofType: "onnx"),
      let tokens = bundle.path(forResource: "tokens", ofType: "txt"),
      let keywords = bundle.path(forResource: "keywords", ofType: "txt")
    else {
      throw WakeError("The wake word model is missing from the app.")
    }

    var config = SherpaOnnxKeywordSpotterConfig()
    config.feat_config.sample_rate = 16000
    config.feat_config.feature_dim = 80
    config.model_config.transducer.encoder = cString(encoder)
    config.model_config.transducer.decoder = cString(decoder)
    config.model_config.transducer.joiner = cString(joiner)
    config.model_config.tokens = cString(tokens)
    config.model_config.num_threads = 1
    config.model_config.provider = cString("cpu")
    config.model_config.model_type = cString("zipformer2")
    config.max_active_paths = 4
    config.num_trailing_blanks = 1
    config.keywords_score = 2.0
    config.keywords_threshold = 0.25
    config.keywords_file = cString(keywords)

    guard let made = SherpaOnnxCreateKeywordSpotter(&config) else {
      throw WakeError("The wake word model could not be loaded.")
    }
    spotter = made
    return made
  }

  /// On the control queue.
  private func startListening() throws {
    if listening { return }
    let spotter = try work.sync { try makeSpotter() }
    work.sync {
      if let old = stream { SherpaOnnxDestroyOnlineStream(old) }
      stream = SherpaOnnxCreateKeywordStream(spotter)
    }

    let session = AVAudioSession.sharedInstance()
    try session.setCategory(
      .playAndRecord, mode: .voiceChat,
      options: [.mixWithOthers, .defaultToSpeaker, .allowBluetooth])
    try session.setActive(true)
    guard session.isInputAvailable else {
      throw WakeError("The microphone is not available.")
    }

    // A new engine each time. One kept from before still has the microphone
    // as it was then — before speech recognition, or Miriam's voice, changed
    // how the phone's sound is set — and listening to it in that old format
    // brings the whole app down.
    let engine = AVAudioEngine()
    let input = engine.inputNode
    let hardware = input.inputFormat(forBus: 0)
    guard hardware.sampleRate > 0, hardware.channelCount > 0,
      let outFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false)
    else {
      throw WakeError("The microphone is not available.")
    }

    // The microphone's own format, whatever it is now (`nil`), each buffer
    // converted from the format it arrives in.
    let resampler = Resampler(to: outFormat)
    input.installTap(onBus: 0, bufferSize: 2048, format: nil) { [weak self] buffer, _ in
      guard let self = self, let samples = resampler.samples(from: buffer) else { return }
      self.work.async { self.feed(samples) }
    }
    engine.prepare()
    do {
      try engine.start()
    } catch {
      input.removeTap(onBus: 0)
      throw error
    }
    self.engine = engine
    listening = true

    // The microphone changed under it (headphones, a call, another app): the
    // engine has stopped. Let go, and tell the app, which starts it again.
    configObserver = NotificationCenter.default.addObserver(
      forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
    ) { [weak self] _ in
      guard let self = self else { return }
      self.control.async {
        guard self.listening else { return }
        self.stopListening()
        self.sendEvent("onEnd", [:])
      }
    }
  }

  /// On the work queue: hand the model what was heard, and see if it was her name.
  private func feed(_ samples: [Float]) {
    guard let spotter = spotter, let stream = stream else { return }
    samples.withUnsafeBufferPointer { p in
      SherpaOnnxOnlineStreamAcceptWaveform(stream, 16000, p.baseAddress, Int32(samples.count))
    }
    while SherpaOnnxIsKeywordStreamReady(spotter, stream) == 1 {
      SherpaOnnxDecodeKeywordStream(spotter, stream)
      guard let result = SherpaOnnxGetKeywordResult(spotter, stream) else { continue }
      let keyword = result.pointee.keyword.map { String(cString: $0) } ?? ""
      SherpaOnnxDestroyKeywordResult(result)
      if !keyword.isEmpty {
        SherpaOnnxResetKeywordStream(spotter, stream)
        control.async {
          // Stopped meanwhile (the microphone handed to someone else): not heard.
          guard self.listening else { return }
          // Stopped first, so the microphone is free for the request.
          self.stopListening()
          self.sendEvent("onWake", ["keyword": keyword])
        }
        return
      }
    }
  }

  /// On the control queue.
  private func stopListening() {
    if let observer = configObserver {
      NotificationCenter.default.removeObserver(observer)
      configObserver = nil
    }
    if let engine = engine {
      engine.inputNode.removeTap(onBus: 0)
      engine.stop()
      self.engine = nil
    }
    listening = false
    work.async {
      if let stream = self.stream {
        SherpaOnnxDestroyOnlineStream(stream)
        self.stream = nil
      }
    }
  }
}

/// Brings what the microphone hears down to the model's 16 kHz, one buffer at
/// a time — from whatever format each arrives in. Used on the tap's thread only.
private final class Resampler: @unchecked Sendable {
  private let out: AVAudioFormat
  private var converter: AVAudioConverter?

  init(to out: AVAudioFormat) {
    self.out = out
  }

  func samples(from buffer: AVAudioPCMBuffer) -> [Float]? {
    let format = buffer.format
    guard format.sampleRate > 0, format.channelCount > 0, buffer.frameLength > 0 else { return nil }
    if converter == nil || converter?.inputFormat != format {
      converter = AVAudioConverter(from: format, to: out)
    }
    guard let converter = converter else { return nil }
    let ratio = out.sampleRate / format.sampleRate
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 32
    guard let result = AVAudioPCMBuffer(pcmFormat: out, frameCapacity: capacity) else { return nil }
    var given = false
    var error: NSError?
    converter.convert(to: result, error: &error) { _, status in
      if given {
        status.pointee = .noDataNow
        return nil
      }
      given = true
      status.pointee = .haveData
      return buffer
    }
    guard error == nil, let channel = result.floatChannelData?[0], result.frameLength > 0 else {
      return nil
    }
    return Array(UnsafeBufferPointer(start: channel, count: Int(result.frameLength)))
  }
}

private struct WakeError: LocalizedError {
  let message: String
  init(_ message: String) { self.message = message }
  var errorDescription: String? { message }
}
