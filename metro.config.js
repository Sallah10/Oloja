// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite ships an in-memory SQLite (wa-sqlite) for the web. Its .wasm
// module is imported as an asset, so Metro must be told *.wasm is an asset.
// Without this, `expo export --platform web` fails to resolve the file.
config.resolver.assetExts.push('wasm');

module.exports = config;