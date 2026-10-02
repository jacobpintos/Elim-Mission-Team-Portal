require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ShazamMatch'
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
  # Linked weakly: the matching it is used for needs iOS 17, and is skipped
  # on anything older.
  s.weak_frameworks = 'ShazamKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
