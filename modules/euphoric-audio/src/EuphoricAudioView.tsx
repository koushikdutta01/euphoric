import { requireNativeView } from 'expo';
import * as React from 'react';

import { EuphoricAudioViewProps } from './EuphoricAudio.types';

const NativeView: React.ComponentType<EuphoricAudioViewProps> =
  requireNativeView('EuphoricAudio');

export default function EuphoricAudioView(props: EuphoricAudioViewProps) {
  return <NativeView {...props} />;
}
