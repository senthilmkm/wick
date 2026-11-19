Pod::Spec.new do |s|
  s.name           = 'WickNative'
  s.version        = '1.0.0'
  s.summary        = 'Native WidgetKit App Group and CloudKit Shared DB bridge for Wick'
  s.description    = 'Native Swift module bridging App Group UserDefaults, WidgetKit, and CloudKit CKShare.'
  s.author         = 'Wick'
  s.homepage       = 'https://github.com/senthilmkm/wick'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.source_files   = '**/*.swift'
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'CloudKit', 'WidgetKit'
end
