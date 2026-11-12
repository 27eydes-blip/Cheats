import type { SceneId } from '../../script/types';
import { SCENES } from './scenes';
import { SCENES2 } from './scenes2';
import { SCENES3 } from './scenes3';
import { SCENES_S2 } from './scenesS2';
import { SCENES_S2B } from './scenesS2b';
import type { SceneDef } from './types';

/** Every shot type, by the name used in scenes.json. */
export const ALL_SCENES = { ...SCENES, ...SCENES2, ...SCENES3, ...SCENES_S2, ...SCENES_S2B } as Record<SceneId, SceneDef>;
