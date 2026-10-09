require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

# sherpa-onnx, the keyword spotter: k2-fsa's own signed build for iOS, as
# published with their Flutter package. Fetched when the pods are installed
# rather than kept in git, being 80 MB.
SHERPA_ONNX_VERSION = '1.13.8'
frameworks = File.join(__dir__, 'Frameworks')
xcframework = File.join(frameworks, 'SherpaOnnxC.xcframework')
unless File.exist?(File.join(xcframework, 'Info.plist'))
  archive = "https://pub.dev/api/archives/sherpa_onnx_ios-#{SHERPA_ONNX_VERSION}.tar.gz"
  ok = system('bash', '-c', <<~SH)
    set -euo pipefail
    tmp="$(mktemp -d)"
    curl -fsSL --retry 3 "#{archive}" -o "$tmp/sherpa.tar.gz"
    tar -xzf "$tmp/sherpa.tar.gz" -C "$tmp" ios/sherpa_onnx_ios/SherpaOnnxC.xcframework
    mkdir -p "#{frameworks}"
    rm -rf "#{xcframework}"
    mv "$tmp/ios/sherpa_onnx_ios/SherpaOnnxC.xcframework" "#{xcframework}"
    rm -rf "$tmp"
  SH
  abort("[MiriamWake] Could not download sherpa-onnx #{SHERPA_ONNX_VERSION} from #{archive}") unless ok
end

Pod::Spec.new do |s|
  s.name           = 'MiriamWake'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = 'Elim Mission Team Portal'
  s.homepage       = 'https://github.com/jacobpintos/Elim-Mission-Team-Portal'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.4'
  s.source         = { git: 'https://github.com/jacobpintos/Elim-Mission-Team-Portal' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation'
  s.vendored_frameworks = 'Frameworks/SherpaOnnxC.xcframework'
  # The keyword-spotting model (sherpa-onnx-kws-zipformer-gigaspeech-3.3M,
  # Apache 2.0) and the phrase it listens for.
  s.resource_bundles = { 'MiriamWake' => ['model/miriam-wake/*.onnx', 'model/miriam-wake/*.txt'] }

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
  s.exclude_files = "Frameworks/**/*"
end
