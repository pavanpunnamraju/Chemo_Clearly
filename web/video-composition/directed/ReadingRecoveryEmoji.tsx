import React from 'react';
import library from '../../public/studies/reading-recovery/twemoji/library.json';
import type {ReadingRecoveryIcon as IconName} from '../../lib/video/reading-recovery-motion';

/** Original library paths/colors, placed inside the existing bubble coordinate
 * system. No font-dependent emoji rendering or network requests during capture. */
export const readingRecoveryEmojiMarkup = Object.fromEntries(Object.entries(library.icons).map(([name,asset]) => [name,
  `<svg x="48" y="44" width="40" height="40" viewBox="${asset.viewBox}" data-emoji-library="Twemoji">${asset.body}</svg>`,
])) as Record<IconName,string>;

export const ReadingRecoveryEmoji: React.FC<{name:IconName;size?:number;color?:string}> = ({name,size=96}) =>
  <svg viewBox='38 38 60 60' width={size} height={size} aria-label={name} dangerouslySetInnerHTML={{__html:readingRecoveryEmojiMarkup[name]}}/>;
