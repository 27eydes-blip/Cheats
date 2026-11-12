import React from 'react';
import { Composition } from 'remotion';
import { EPISODES } from './episodes';
import { FPS, H, W } from './config';
import { EpisodeVideo } from './Episode';
import { getTimeline } from './timeline/load';
import { compositionId } from './episodeKey';

export const episodeId = (n: number) => `EP${String(n).padStart(2, '0')}`;

export const Root: React.FC = () => (
  <>
    {EPISODES.map((ep) => (
      <Composition
        key={compositionId(ep)}
        id={compositionId(ep)}
        component={EpisodeVideo}
        defaultProps={{ ep }}
        width={W}
        height={H}
        fps={FPS}
        durationInFrames={Math.ceil(getTimeline(ep).duration * FPS)}
      />
    ))}
  </>
);
