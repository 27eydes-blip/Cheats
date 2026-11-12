import type { SceneId } from '../../script/types';
import { SCENES } from './scenes';
import { SCENES2 } from './scenes2';
import { SCENES3 } from './scenes3';
import type { SceneDef } from './types';

/** Every shot type, by the name used in scenes.json. */
export const ALL_SCENES = { ...SCENES, ...SCENES2, ...SCENES3 } as Record<SceneId, SceneDef>;
