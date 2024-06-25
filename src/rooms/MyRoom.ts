import { Room, Client } from "@colyseus/core";
import { MyRoomState } from "./schema/MyRoomState";
import * as RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../physics/physics";
import {
  ballHitOpponentTable,
  ballHitPlayerTable,
  handleBallOut,
  racketHitBall,
} from "../physics/events";
import { BROADCAST_STEP, PHYSICS_STEP } from "../config";
import { generateRandomString } from "../utils";

type PlayerType = {
  id: string;
  isHost: boolean;
  score: number;
  mousePosition: {
    x: number;
    y: number;
  };
  playerName?: string;
  playerColor?: string;
  racketRigidBody?: RAPIER.RigidBody;
};

export class MyRoom extends Room<MyRoomState> {
  world: RAPIER.World;
  ballRigidBody: RAPIER.RigidBody;
  racketRigidBody: RAPIER.RigidBody;
  opponentRacketRigidBody: RAPIER.RigidBody;
  playerTableBody: RAPIER.RigidBody;
  opponentTableBody: RAPIER.RigidBody;
  ballOutSensor: RAPIER.Collider;

  maxClients = 2;

  playersMap = new Map<string, PlayerType>();
  ball = {
    ballTranslation: { x: 0, y: 10, z: 30 },
    ballLinvel: { x: 0, y: 0, z: 0 },
  };
  hostId: string;
  opponentId: string;

  playerLastTableHit: string;
  touchedLastBy: string;

  rematchVotes = 0;

  matchState: "waiting" | "playing" | "serving" | "ended" = "waiting";

  onCreate(options: any) {
    if (options.private) {
      this.setPrivate(true);
      this.roomId = generateRandomString();
    }

    this.onMessage("update", this.handleUpdateMessage.bind(this));

    this.onMessage("rematch-vote", (client, { vote }) => {
      if (vote === "DECLINE") {
        this.broadcast("declined-rematch");
        this.disconnect(); // Dispose room
        return;
      }

      this.rematchVotes++;

      // If 2 votes are received, start a new game
      if (this.rematchVotes >= 2) {
        this.broadcast("rematch");

        this.playersMap.forEach((player) => {
          player.score = 0;
        });
        this.rematchVotes = 0;

        setTimeout(() => {
          this.matchState = "serving";
        }, 3000);

        return;
      }

      this.broadcast("voted-rematch", client.sessionId);
    });
  }

  handleUpdateMessage(client: Client, { x, y }: { x: number; y: number }) {
    const player = this.playersMap.get(client.sessionId);
    if (!player) return;
    player.mousePosition = { x, y };
  }

  foundMatch() {
    this.broadcast("found-match", {
      hostId: this.hostId,
      players: Array.from(this.playersMap.values()),
    });

    RAPIER.init().then(() => {
      this.initializePhysics();
      this.setSimulationInterval(this.update.bind(this), PHYSICS_STEP);
      this.clock.setInterval(
        this.broadcastPositions.bind(this),
        BROADCAST_STEP
      );
    });
  }

  initializePhysics() {
    const {
      world,
      ball,
      racket,
      opponentRacket,
      opponentTable,
      playerTable,
      ballOutSensor,
    } = initPhysics();
    this.world = world;
    this.ballRigidBody = ball;
    this.racketRigidBody = racket;
    this.opponentRacketRigidBody = opponentRacket;
    this.playerTableBody = playerTable;
    this.opponentTableBody = opponentTable;
    this.ballOutSensor = ballOutSensor;

    this.playersMap.forEach((player) => {
      player.racketRigidBody = player.isHost
        ? this.racketRigidBody
        : this.opponentRacketRigidBody;
    });
  }
  update(deltaTime: number) {
    if (this.matchState === "waiting" || this.matchState === "ended") return;

    let eventQueue = new RAPIER.EventQueue(true);
    this.world.step(eventQueue);

    this.playersMap.forEach((player) => {
      this.updatePlayerPosition(player);
    });

    this.handleCollisionEvents(eventQueue);
  }

  updatePlayerPosition(player: PlayerType) {
    if (this.matchState === "serving") {
      player.racketRigidBody.setTranslation(
        { x: 0, y: 5, z: player.isHost ? 30 : -30 },
        true
      );
      return;
    }

    const lerpFactor = 0.1;
    const currentPosition = player.racketRigidBody?.translation();
    const targetPosition = player.mousePosition;
    const interpolatedPosition = {
      x:
        currentPosition.x + lerpFactor * (targetPosition.x - currentPosition.x),
      y:
        currentPosition.y + lerpFactor * (targetPosition.y - currentPosition.y),
      z: currentPosition.z,
    };

    player.racketRigidBody.setTranslation(interpolatedPosition, true);
  }

  handleCollisionEvents(eventQueue: RAPIER.EventQueue) {
    eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      if (
        handle1 === this.ballRigidBody.handle &&
        handle2 === this.ballOutSensor.handle &&
        started
      ) {
        handleBallOut(this);
      }
    });

    eventQueue.drainContactForceEvents((event) => {
      const handle1 = event.collider1();
      const handle2 = event.collider2();

      if (
        handle1 === this.ballRigidBody.handle &&
        handle2 === this.racketRigidBody.handle
      ) {
        this.matchState = "playing";
        racketHitBall(this.ballRigidBody, this.racketRigidBody);
        this.touchedLastBy = this.hostId;
      } else if (
        handle1 === this.ballRigidBody.handle &&
        handle2 === this.opponentRacketRigidBody.handle
      ) {
        this.matchState = "playing";
        racketHitBall(this.ballRigidBody, this.opponentRacketRigidBody);
        this.touchedLastBy = this.opponentId;
      } else if (
        handle1 === this.playerTableBody.handle &&
        handle2 === this.ballRigidBody.handle
      ) {
        ballHitPlayerTable(this);
      } else if (
        handle1 === this.opponentTableBody.handle &&
        handle2 === this.ballRigidBody.handle
      ) {
        ballHitOpponentTable(this);
      }
    });
  }
  broadcastPositions() {
    const ballPosition = this.ballRigidBody.translation();
    const playerRacketPosition = this.racketRigidBody.translation();
    const opponentRacketPosition = this.opponentRacketRigidBody.translation();

    if (!ballPosition || !playerRacketPosition || !opponentRacketPosition)
      return;

    this.broadcast("update-positions", {
      ball: { x: ballPosition.x, y: ballPosition.y, z: ballPosition.z },
      playerRacket: {
        x: playerRacketPosition.x,
        y: playerRacketPosition.y,
        z: playerRacketPosition.z,
      },
      opponentRacket: {
        x: opponentRacketPosition.x,
        y: opponentRacketPosition.y,
        z: opponentRacketPosition.z,
      },
    });
  }

  onJoin(client: Client, options: any) {
    console.log(client.sessionId, "joined!", options);

    if (this.playersMap.size === 0) {
      this.playersMap.set(client.sessionId, {
        id: client.sessionId,
        isHost: true,
        score: 0,
        mousePosition: { x: 0, y: 0 },
        playerName: options.playerName,
        playerColor: options.playerColor,
      });
      this.hostId = client.sessionId;
      return;
    }

    this.playersMap.set(client.sessionId, {
      id: client.sessionId,
      isHost: false,
      score: 0,
      mousePosition: { x: 0, y: 0 },
      playerName: options.playerName,
      playerColor: options.playerColor,
    });

    this.opponentId = client.sessionId;

    this.foundMatch();

    setTimeout(() => {
      this.matchState = "serving";
      this.broadcast("match-started");
    }, 3000);
  }

  handleScore(playerId: string) {
    this.broadcast("scored", playerId);

    setTimeout(() => {
      this.playersMap.forEach((player) => {
        if (player.id === playerId) {
          player.score += 1;
          this.resetBallPosition(player.isHost);
        }
      });

      const winner = this.checkForWinner();

      if (winner) {
        this.matchState = "ended";
        this.broadcast("winner", winner);
        return;
      }
    }, 1000);
  }

  resetBallPosition(isHost: boolean) {
    this.playerLastTableHit = undefined;
    this.touchedLastBy = undefined;
    this.matchState = "serving";

    this.ballRigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballRigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.ballRigidBody.setTranslation(
      {
        x: 0,
        y: 10,
        z: isHost ? 30 : -30,
      },
      true
    );
  }

  checkForWinner() {
    for (const player of this.playersMap.values()) {
      if (player.score >= 5) return player.id;
    }
    return false;
  }

  onLeave(client: Client, consented: boolean) {
    console.log(client.sessionId, "left!");
    // this.state.players.delete(client.sessionId);
    // let winner;
    // for (let [key, value] of this.state.players.entries()) {
    //   if (client.sessionId !== key) {
    //     winner = key;
    //   }
    // }

    // this.terminateRoom(winner);
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

    this.playerLastTableHit = undefined;
    this.clock.clear();
  }
}
