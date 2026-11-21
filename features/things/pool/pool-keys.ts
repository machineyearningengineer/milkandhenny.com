export const gamePoolRoomSecretKey = (runId: string, roomId: string) =>
  `things:game-pool:v1:run:${runId}:room:${roomId}:join-token`;

export const gamePoolAssignmentReceiptKey = (runId: string, clientId: string) =>
  `things:game-pool:v1:run:${runId}:assignment:${clientId}`;
