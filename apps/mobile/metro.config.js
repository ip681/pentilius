// The app is not an npm workspace (it has its own React version), so Metro is
// told where the shared types and texts live (packages/shared).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../../packages/shared')];

module.exports = config;
