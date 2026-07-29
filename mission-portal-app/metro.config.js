const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Force a single copy of @tamagui/portal on native.
//
// npm installs EIGHT separate (identical, 2.0.0) copies of @tamagui/portal,
// nested under each Tamagui component that depends on it (sheet, dialog,
// popover, toast, adapt, alert-dialog, create-menu, plus tamagui itself).
// Each copy defines its OWN PortalDispatchContext React context object. The
// PortalProvider that TamaguiProvider mounts comes from one copy, so a portal
// item rendered by a component resolving a DIFFERENT copy sees a null context
// and throws "'PortalDispatchContext' cannot be null, please add
// 'PortalProvider' to the root component." — a hard render crash on device
// (web is unaffected because it uses a DOM-based portal path).
//
// Redirect every @tamagui/portal request to one canonical copy so the
// provider, the context, the host registration and all portal items share a
// single module instance. Computed via require.resolve so it adapts to
// whatever layout npm produces on EAS at build time.
const tamaguiDir = path.dirname(require.resolve('tamagui/package.json'))
// Metro starts node_modules resolution from path.dirname(originModulePath);
// pointing it inside the tamagui package makes '@tamagui/portal' resolve to
// tamagui's own nested copy (the same one PortalProvider is mounted from).
const canonicalPortalOrigin = path.join(tamaguiDir, 'index.js')

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
  // Native-only: the duplicate-context crash is specific to the gorhom-based
  // native portal. Leave web resolution untouched (it already works).
  if (
    platform !== 'web' &&
    (moduleName === '@tamagui/portal' || moduleName.startsWith('@tamagui/portal/'))
  ) {
    const redirected = { ...context, originModulePath: canonicalPortalOrigin }
    const inner = resolveRequest ?? context.resolveRequest
    return inner(redirected, moduleName, platform)
  }
  if (resolveRequest) {
    return resolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
