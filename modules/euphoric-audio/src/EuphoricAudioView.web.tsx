import * as React from 'react';

import { EuphoricAudioViewProps } from './EuphoricAudio.types';

export default function EuphoricAudioView(props: EuphoricAudioViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
