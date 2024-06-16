import { Room, Client } from "@colyseus/core";
import { MyRoomState } from "./schema/MyRoomState";

type PlayerType = {
  id: string;
  isHost: boolean;
  isHandlingBall: boolean;
  score: number;
  position: {
    x: number;
    y: number;
  };
  playerName?: string;
  playerColor?: string;
};

export class MyRoom extends Room<MyRoomState> {
  maxClients = 2;

  playersMap = new Map<string, PlayerType>();
  ball = {
    ballTranslation: { x: 0, y: 10, z: 30 },
    ballLinvel: { x: 0, y: 0, z: 0 },
  };
  hostId: string;
  opponentId: string;

  playerHandlingBall: string;
  playerLastTableHit: string;

  onCreate(options: any) {
    if (options.private) {
      this.setPrivate(true);
      this.roomId = generateRandomString();
    }
    this.setState(new MyRoomState());

    // Fixed rate update loop
    this.setSimulationInterval(
      () =>
        this.broadcast("update", { players: this.playersMap, ball: this.ball }),
      1000 / 30 // 30fps
    );

    this.onMessage("update", (client, { positionX, positionY }) => {
      const player = this.playersMap.get(client.sessionId);
      if (!player) return;
      player.position = {
        x: positionX,
        y: positionY,
      };
    });

    this.onMessage("update-ball", (client, { ballTranslation, ballLinvel }) => {
      const isHost = client.sessionId === this.hostId;

      if (isHost) {
        this.ball.ballTranslation = ballTranslation;
        this.ball.ballLinvel = ballLinvel;
      } else {
        this.ball.ballTranslation = {
          x: ballTranslation.x,
          y: ballTranslation.y,
          z: ballTranslation.z * -1,
        };
        this.ball.ballLinvel = {
          x: ballLinvel.x,
          y: ballLinvel.y,
          z: ballLinvel.z * -1,
        };
      }
    });

    this.onMessage("balls-out", (_) => {
      const currentPlayerHandlingBall = this.playerHandlingBall;

      this.playersMap.forEach((player) => {
        if (player.id !== currentPlayerHandlingBall) {
          this.handleScore(player.id);
        }
      });
    });

    this.onMessage("hit-ball", (client) => {
      this.playersMap.forEach((player) => {
        if (player.id !== client.sessionId) {
          player.isHandlingBall = true;
          this.playerHandlingBall = player.id;
        } else {
          player.isHandlingBall = false;
        }
      });
    });

    this.onMessage("hit-my-table", (client) => {
      if (client.sessionId !== this.playerHandlingBall) return;
      const opponentPlayer =
        client.sessionId === this.hostId ? this.opponentId : this.hostId;

      if (this.playerLastTableHit === client.sessionId) {
        this.handleScore(opponentPlayer);
        return;
      }
      this.playerLastTableHit = client.sessionId;
    });

    this.onMessage("hit-opponent-table", (client) => {
      if (client.sessionId !== this.playerHandlingBall) return;
      this.handleScore(client.sessionId);
    });
  }

  onJoin(client: Client, options: any) {
    console.log(client.sessionId, "joined!", options);

    if (this.playersMap.size === 0) {
      this.playersMap.set(client.sessionId, {
        id: client.sessionId,
        isHost: true,
        isHandlingBall: true,
        score: 0,
        position: { x: 0, y: 0 },
        playerName: options.playerName,
        playerColor: options.playerColor,
      });
      this.hostId = client.sessionId;
      this.playerHandlingBall = client.sessionId;
      return;
    }

    this.playersMap.set(client.sessionId, {
      id: client.sessionId,
      isHost: false,
      isHandlingBall: false,
      score: 0,
      position: { x: 0, y: 0 },
      playerName: options.playerName,
      playerColor: options.playerColor,
    });

    const listOfPlayers = Array.from(this.playersMap.values());

    this.broadcast("found-match", {
      hostId: this.hostId,
      players: listOfPlayers,
    });

    setTimeout(() => {
      this.broadcast("match-started");
    }, 3000);
  }

  handleScore(playerId: string) {
    this.broadcast("scored", playerId);
    this.playerLastTableHit = undefined;

    setTimeout(() => {
      this.playersMap.forEach((player) => {
        if (player.id === playerId) {
          player.score += 1;
          player.isHandlingBall = true;
          this.playerHandlingBall = player.id;
        } else {
          player.isHandlingBall = false;
        }
      });

      const winner = this.checkForWinner();

      if (winner) {
        this.broadcast("winner", winner);
        return;
      }

      this.broadcast("serve", { playerId });
    }, 1000);
  }

  checkForWinner() {
    for (const player of this.playersMap.values()) {
      if (player.score >= 5) return player.id;
    }
    return false;
  }

  onLeave(client: Client, consented: boolean) {
    console.log(client.sessionId, "left!");
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");

    this.playersMap = new Map<string, PlayerType>();
    this.ball = {
      ballTranslation: { x: 0, y: 10, z: 30 },
      ballLinvel: { x: 0, y: 0, z: 0 },
    };
    this.hostId = undefined;
    this.opponentId = undefined;

    this.playerHandlingBall = undefined;
    this.playerLastTableHit = undefined;
  }
}

function generateRandomString(length: number = 5): string {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const charactersLength = characters.length;

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charactersLength);
    result += characters[randomIndex];
  }

  return result;
}
