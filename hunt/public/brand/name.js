// The game's player-facing names in one place. Internal ids, storage keys, routes and the Worker
// name stay "hunt" (renaming those would break saves and the live link); only what players read
// comes from here.
export const GAME_NAME = 'Oblivion GP';
export const PASS_NAME = 'GP Pass';
export const COIN_NAME = 'GP Coins';
// what COPY INVITE / Share puts on the clipboard: the link already carries the room code
export const inviteText = (link) => `Race me in ${GAME_NAME}: ${link}`;
