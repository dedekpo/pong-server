import { Room, Client } from "@colyseus/core";
import { MyRoomState } from "./schema/MyRoomState";
import * as RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../physics/physics";
import {
  ballHitOpponentTable,
  ballHitPlayerTable,
  handleBallHitBlocker,
  handleBallOut,
  racketHitBall,
} from "../physics/events";
import { BROADCAST_STEP, PHYSICS_STEP, PLAYER_SPEED } from "../config";
import { generateRandomString } from "../utils";

type PowerUpsType =
  | "super-hit"
  | "super-curve"
  | "increase-size"
  | "slow-motion"
  | "camera-shake";

export type PlayerType = {
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
  powerUp?: PowerUpsType;
  powerUpActive: boolean;
};

export class MyRoom extends Room<MyRoomState> {
  world: RAPIER.World;
  ballRigidBody: RAPIER.RigidBody;
  racketRigidBody: RAPIER.RigidBody;
  opponentRacketRigidBody: RAPIER.RigidBody;
  playerTableBody: RAPIER.RigidBody;
  opponentTableBody: RAPIER.RigidBody;
  ballOutSensor: RAPIER.Collider;
  blockerCollider: RAPIER.Collider;

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
  canScore: boolean = true;
  slowMotion = {
    active: false,
    time: 0,
  };

  onCreate(options: any) {
    if (options.private) {
      this.setPrivate(true);
      this.roomId = generateRandomString();
    }

    this.onMessage("update", this.handleUpdateMessage.bind(this));

    this.onMessage("spawn-power-up", (client, positionToSpawn) => {
      this.broadcast("spawn-power-up", {
        player: client.sessionId,
        position: positionToSpawn,
      });
    });

    this.onMessage("remove-power-up", (client) => {
      this.broadcast("remove-power-up", {
        player: client.sessionId,
      });
    });

    this.onMessage("grabbed-power-up", (client, powerUp: PowerUpsType) => {
      const player = this.playersMap.get(client.sessionId);
      this.broadcast("grabbed-power-up", {
        player: client.sessionId,
        powerUp,
      });
      player.powerUp = powerUp;
    });

    this.onMessage("power-up-ready", (client) => {
      const player = this.playersMap.get(client.sessionId);

      this.broadcast("power-up-ready", {
        player: client.sessionId,
      });

      player.powerUpActive = true;

      if (player.powerUp === "slow-motion" && !this.slowMotion.active) {
        this.slowMotion.active = true;
        setTimeout(() => {
          this.slowMotion.active = false;
          player.powerUpActive = false;
        }, 6000);
      }

      if (player.powerUp === "increase-size") {
        player.racketRigidBody
          .collider(0)
          .setHalfExtents({ x: 4.5, y: 5, z: 0.3 });

        setTimeout(() => {
          player.racketRigidBody
            .collider(0)
            .setHalfExtents({ x: 2.2, y: 2.4, z: 0.3 });
          player.powerUpActive = false;
        }, 8 * 1000);

        this.broadcast("increase-size", {
          player: client.sessionId,
        });
      }
    });

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
      blocker,
    } = initPhysics();
    this.world = world;
    this.ballRigidBody = ball;
    this.racketRigidBody = racket;
    this.opponentRacketRigidBody = opponentRacket;
    this.playerTableBody = playerTable;
    this.opponentTableBody = opponentTable;
    this.ballOutSensor = ballOutSensor;
    this.blockerCollider = blocker;

    this.playersMap.forEach((player) => {
      player.racketRigidBody = player.isHost
        ? this.racketRigidBody
        : this.opponentRacketRigidBody;
    });
  }

  updatePlayerPosition(player: PlayerType) {
    if (this.matchState === "serving") {
      const isIncreased =
        player.powerUp === "increase-size" && player.powerUpActive;
      player.racketRigidBody.setTranslation(
        { x: 0, y: isIncreased ? 3 : 5, z: player.isHost ? 30 : -30 },
        true
      );
      return;
    }

    const currentPosition = player.racketRigidBody?.translation();
    const targetPosition = player.mousePosition;
    const interpolatedPosition = {
      x:
        currentPosition.x +
        PLAYER_SPEED * (targetPosition.x - currentPosition.x),
      y:
        currentPosition.y +
        PLAYER_SPEED * (targetPosition.y - currentPosition.y),
      z: currentPosition.z,
    };

    player.racketRigidBody.setTranslation(interpolatedPosition, true);
  }

  update(deltaTime: number) {
    if (this.matchState === "waiting" || this.matchState === "ended") return;

    if (this.slowMotion.active && this.slowMotion.time > 0) {
      this.slowMotion.time = 0;
      return;
    }

    this.slowMotion.time++;

    let eventQueue = new RAPIER.EventQueue(true);
    this.world.step(eventQueue);

    this.playersMap.forEach((player) => {
      this.updatePlayerPosition(player);
    });

    this.handleCollisionEvents(eventQueue);
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
      if (
        handle1 === this.blockerCollider.handle &&
        handle2 === this.ballRigidBody.handle &&
        started
      ) {
        handleBallHitBlocker(this.ballRigidBody);
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
        const player = this.playersMap.get(this.hostId);
        racketHitBall(this, this.ballRigidBody, this.racketRigidBody, player);
        this.touchedLastBy = this.hostId;
      } else if (
        handle1 === this.ballRigidBody.handle &&
        handle2 === this.opponentRacketRigidBody.handle
      ) {
        this.matchState = "playing";
        const player = this.playersMap.get(this.opponentId);
        racketHitBall(
          this,
          this.ballRigidBody,
          this.opponentRacketRigidBody,
          player
        );
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
        powerUpActive: false,
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
      powerUpActive: false,
    });

    this.opponentId = client.sessionId;

    this.foundMatch();

    setTimeout(() => {
      this.matchState = "serving";
      this.broadcast("match-started");
    }, 3000);
  }

  handleScore(playerId: string) {
    if (!this.canScore) return;

    this.broadcast("scored", playerId);

    this.canScore = false;

    setTimeout(() => {
      this.playersMap.forEach((player) => {
        if (player.id === playerId) {
          player.score += 1;
          this.resetBallPosition(player.isHost);
        }
      });

      this.canScore = true;

      // const winner = this.checkForWinner(); // todo - remove

      // if (winner) {
      //   this.matchState = "ended";
      //   this.broadcast("winner", winner);
      //   return;
      // }
    }, 1000);
  }

  resetBallPosition(isHost: boolean) {
    this.broadcast("ball-changed-trail", "none");
    this.broadcast("set-show-trail", false);

    this.playerLastTableHit = undefined;
    this.touchedLastBy = undefined;
    this.matchState = "serving";

    this.ballRigidBody.resetForces(true);
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
    // let winner; // TODO
    // for (let [key, value] of this.playersMap.entries()) {
    //   if (client.sessionId !== key) {
    //     winner = key;
    //   }
    // }
    // this.playersMap.delete(client.sessionId);

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
