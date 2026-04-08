import EuphoricAudioModule from './src/EuphoricAudioModule';

// Reexport the native module. On web, it will be resolved to EuphoricAudioModule.web.ts
// and on native platforms to EuphoricAudioModule.ts
export { default } from './src/EuphoricAudioModule';
export { default as EuphoricAudioView } from './src/EuphoricAudioView';
export * from './src/EuphoricAudio.types';

export function startAudio() {
  return EuphoricAudioModule.startAudio();
}

export function stopAudio() {
  return EuphoricAudioModule.stopAudio();
}

export function loadAudio(uri: string) {
  return EuphoricAudioModule.loadAudio(uri);
}

export function seekTo(seconds: number) {
  return EuphoricAudioModule.seekTo(seconds);
}

export function getStatus() {
  return EuphoricAudioModule.getStatus();
}

export async function getArtwork(uri: string) {
  return await EuphoricAudioModule.getArtwork(uri);
}
