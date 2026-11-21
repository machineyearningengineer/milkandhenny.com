import { MULTIPLAYER_GAME_REGISTRY, type MultiplayerGame } from "./multiplayer-telemetry";

const PREFIX = "things";

export function gameNamespace(game: string, version: number) {
  return `${PREFIX}:${game}:v${version}`;
}

export function gameRoomNamespace(game: string, version: number, roomId: string) {
  return `${gameNamespace(game, version)}:room:${roomId}`;
}

export function gameRealtimeChannel(game: MultiplayerGame, roomId: string) {
  const { channelVersion } = MULTIPLAYER_GAME_REGISTRY[game];
  return `${PREFIX}:${game}:${channelVersion}:room:${roomId}:events`;
}

export function gameBrowserKey(game: string, version: number, ...segments: string[]) {
  return [gameNamespace(game, version), ...segments].join(":");
}
