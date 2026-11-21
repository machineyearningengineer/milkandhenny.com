import { gameBrowserKey, gameRoomNamespace } from "../shared/multiplayer-keys";

export function centreRoomRedisKeys(roomId: string) {
  const base = gameRoomNamespace("centre", 1, roomId);
  return {
    state: `${base}:state`,
    lock: `${base}:lock`,
    replay: (gameNumber: number, playerId: string) =>
      `${base}:game:${gameNumber}:replay:${playerId}`,
  };
}

export const centreBrowserKeys = {
  invite: (roomId: string) => gameBrowserKey("centre", 1, "room", roomId, "invite"),
  playerSession: (roomId: string) => gameBrowserKey("centre", 1, "room", roomId, "player-session"),
  soloReplays: gameBrowserKey("centre", 1, "solo-replays"),
} as const;
