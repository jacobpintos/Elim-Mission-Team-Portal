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
/// that follows is for speech recognition, which needs the microphone.
public class MiriamWakeModule: Module {
  private let engine = AVAudioEngine()
  private let work = DispatchQueue(label: "miriam-wake")
  private var spotter: OpaquePointer?
  private var stream: OpaquePointer?
  private var converter: AVAudioConverter?
  private var listening = false
  /// C strings handed to sherpa-onnx, kept for as long as the spotter is.
  private var cStrings: [UnsafeMutablePointer<CChar>] = []

  public func definition() -> ModuleDefinition {
    Name("MiriamWake")
    Events("onWake")

    Function("isAvailable") { () -> Bool in
      return true
    }

    AsyncFunction("start") { (promise: Promise) in
      DispatchQueue.main.async {
        do {
          try self.startListening()
          promise.resolve(nil)
        } catch {
          self.stopListening()
          promise.reject("ERR_MIRIAM_WAKE", error.localizedDescription)
        }
      }
    }

    Function("stop") {
      self.stopListening()
    }

    OnDestroy {
      self.stopListening()
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

    let input = engine.inputNode
    let inFormat = input.outputFormat(forBus: 0)
    guard inFormat.sampleRate > 0,
      let outFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false),
      let converter = AVAudioConverter(from: inFormat, to: outFormat)
    else {
      throw WakeError("The microphone is not available.")
    }
    self.converter = converter

    input.installTap(onBus: 0, bufferSize: 2048, format: inFormat) { [weak self] buffer, _ in
      guard let self = self, let samples = self.resample(buffer, to: outFormat) else { return }
      self.work.async { self.feed(samples) }
    }
    engine.prepare()
    try engine.start()
    listening = true
  }

  private func resample(_ buffer: AVAudioPCMBuffer, to format: AVAudioFormat) -> [Float]? {
    guard let converter = converter else { return nil }
    let ratio = format.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 32
    guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return nil }
    var given = false
    var error: NSError?
    converter.convert(to: out, error: &error) { _, status in
      if given {
        status.pointee = .noDataNow
        return nil
      }
      given = true
      status.pointee = .haveData
      return buffer
    }
    guard error == nil, let channel = out.floatChannelData?[0], out.frameLength > 0 else { return nil }
    return Array(UnsafeBufferPointer(start: channel, count: Int(out.frameLength)))
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
        DispatchQueue.main.async {
          // Stopped first, so the microphone is free for the request.
          self.stopListening()
          self.sendEvent("onWake", ["keyword": keyword])
        }
        return
      }
    }
  }

  private func stopListening() {
    if listening {
      engine.inputNode.removeTap(onBus: 0)
      engine.stop()
      listening = false
    }
    converter = nil
    work.async {
      if let stream = self.stream {
        SherpaOnnxDestroyOnlineStream(stream)
        self.stream = nil
      }
    }
  }
}

private struct WakeError: LocalizedError {
  let message: String
  init(_ message: String) { self.message = message }
  var errorDescription: String? { message }
}
