import { NativeModule, requireNativeModule } from 'expo';

import { EuphoricAudioModuleEvents } from './EuphoricAudio.types';

declare class EuphoricAudioModule extends NativeModule<EuphoricAudioModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
  startAudio(): void;
  stopAudio(): void;
  loadAudio(uri: String): boolean;
  seekTo(seconds: number): void;
  getStatus(): { position: number, duration: number, sampleRate: number };
  getArtwork(uri: string): Promise<string | null>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<EuphoricAudioModule>('EuphoricAudio');
