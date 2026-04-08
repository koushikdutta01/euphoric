import EuphoricAudioModule from './src/EuphoricAudioModule';

// Reexport the native module. On web, it will be resolved to EuphoricAudioModule.web.ts
// and on native platforms to EuphoricAudioModule.ts
export { default } from './src/EuphoricAudioModule';
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

export async function getMetadata(uri: string) {
  return await EuphoricAudioModule.getMetadata(uri);
}

export async function getArtwork(uri: string) {
  return await EuphoricAudioModule.getArtwork(uri);
}

export function updateMetadata(title: string, artist: string, artwork: string | null, duration: number) {
  return EuphoricAudioModule.updateMetadata(title, artist, artwork, duration);
}
