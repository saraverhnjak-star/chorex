const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
// Shared UI must use the same style registry as this app's CSS entry point.
// pnpm can install separate peer-dependent copies of these runtime packages.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === 'nativewind' ||
    moduleName.startsWith('nativewind/') ||
    moduleName === 'react-native-css-interop' ||
    moduleName.startsWith('react-native-css-interop/')
  ) {
    return context.resolveRequest(
      context,
      require.resolve(moduleName, { paths: [__dirname] }),
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, {
  input: './global.css',
});
