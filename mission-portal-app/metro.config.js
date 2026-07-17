const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// mapbox-gl is a web-only dependency (used only from map.web.tsx). Its dist
// bundle contains webpack-specific dynamic-import syntax that Hermes can't
// parse, so it must never end up in the native bundle. Platform-specific
// file extensions (map.web.tsx vs map.tsx) don't prevent Metro from resolving
// this direct package import for native platforms, so strip it explicitly.
const { resolveRequest } = config.resolver

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'mapbox-gl' && platform !== 'web') {
    return { type: 'empty' }
  }
  if (resolveRequest) {
    return resolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
