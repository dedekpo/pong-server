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

  onCreate(options: any) {
    if (options.private) {
      this.setPrivate(true);
      this.roomId = generateRandomString();
    }

    this.onMessage("update", (client, { x, y }) => {
      const player = this.playersMap.get(client.sessionId);
      if (!player) return;
      player.mousePosition = {
        x,
        y,
      };
    });
  }

  foundMatch() {
    RAPIER.init().then(() => {
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

      for (const player of this.playersMap.values()) {
        if (player.isHost) {
          player.racketRigidBody = this.racketRigidBody;
        } else {
          player.racketRigidBody = this.opponentRacketRigidBody;
        }
      }

      this.setSimulationInterval(
        (deltaTime) => this.update(deltaTime),
        PHYSICS_STEP
      );

      this.clock.setInterval(() => {
        this.broadcastPositions();
      }, BROADCAST_STEP);
    });
  }

  update(deltaTime: number) {
    // Event queue for detecting collisions
    let eventQueue = new RAPIER.EventQueue(true);
    // Step the physics world
    this.world.step(eventQueue);

    for (const player of this.playersMap.values()) {
      // // Determine the interpolation speed factor
      const lerpFactor = 0.1; // Adjust this value to change the smoothness
      const currentPosition = player.racketRigidBody?.translation();
      const targetPosition = player.mousePosition;

      // // Calculate the interpolated position
      const interpolatedPosition = {
        x:
          currentPosition.x +
          lerpFactor * (targetPosition.x - currentPosition.x),
        y:
          currentPosition.y +
          lerpFactor * (targetPosition.y - currentPosition.y),
        z: currentPosition.z,
      };

      // // Set the new interpolated position
      if (player.isHost) {
        player.racketRigidBody.setTranslation(
          {
            x: 0,
            y: 5,
            z: 30,
          },
          true
        );
      } else {
        player.racketRigidBody.setTranslation(interpolatedPosition, true);
      }
    }

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
      let handle1 = event.collider1(); // Handle of the first collider involved in the event.
      let handle2 = event.collider2(); // Handle of the second collider involved in the event.
      /* Handle the contact force event. */

      if (
        handle1 === this.ballRigidBody.handle &&
        handle2 === this.racketRigidBody.handle
      ) {
        racketHitBall(this.ballRigidBody, this.racketRigidBody);
        this.touchedLastBy = this.hostId;
      }
      if (
        handle1 === this.ballRigidBody.handle &&
        handle2 === this.opponentRacketRigidBody.handle
      ) {
        racketHitBall(this.ballRigidBody, this.opponentRacketRigidBody);
        this.touchedLastBy = this.opponentId;
      }
      if (
        handle1 === this.playerTableBody.handle &&
        handle2 === this.ballRigidBody.handle
      ) {
        ballHitPlayerTable(this);
      }
      if (
        handle1 === this.opponentTableBody.handle &&
        handle2 === this.ballRigidBody.handle
      ) {
        ballHitOpponentTable(this);
      }
    });

    // this.broadcastPositions();
  }

  broadcastPositions() {
    // Get the positions of the ball and rackets
    const ballPosition = this.ballRigidBody.translation();
    const playerRacketPosition = this.racketRigidBody.translation();
    const opponentRacketPosition = this.opponentRacketRigidBody.translation();

    if (!ballPosition || !playerRacketPosition || !opponentRacketPosition)
      return;

    // Broadcast the positions to all connected clients
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

    const listOfPlayers = Array.from(this.playersMap.values());

    this.foundMatch();

    this.broadcast("found-match", {
      hostId: this.hostId,
      players: listOfPlayers,
    });

    this.broadcast("match-started"); // temporary

    // setTimeout(() => {
    //   this.broadcast("match-started");
    // }, 3000);
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
        this.broadcast("winner", winner);
        return;
      }
    }, 1000);
  }

  resetBallPosition(isHost: boolean) {
    this.playerLastTableHit = undefined;
    this.touchedLastBy = undefined;

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
