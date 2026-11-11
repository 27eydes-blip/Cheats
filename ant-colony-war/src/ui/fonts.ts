import { loadFont as loadAnton } from '@remotion/google-fonts/Anton';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';

export const { fontFamily: TITLE_FONT } = loadAnton('normal', { weights: ['400'], subsets: ['latin'] });
export const { fontFamily: CAPTION_FONT } = loadMontserrat('normal', { weights: ['800', '900'], subsets: ['latin'] });
