import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './EuphoricAudio.types';

type EuphoricAudioModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class EuphoricAudioModule extends NativeModule<EuphoricAudioModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(EuphoricAudioModule, 'EuphoricAudioModule');
