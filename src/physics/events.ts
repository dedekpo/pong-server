import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { getHitPrecision } from "./utils";
import { MyRoom } from "../rooms/MyRoom";

export function racketHitBall(
  ball: RAPIER.RigidBody,
  racket: RAPIER.RigidBody
) {
  const racketWorldPosition = racket.translation();
  const racketVector = new THREE.Vector3(
    racketWorldPosition.x,
    racketWorldPosition.y,
    racketWorldPosition.z
  );

  const playeModifier = racketWorldPosition.z > 0 ? -1 : 1;

  const ballWorldPosition = ball.translation();

  const racketBallDistance = racketVector.distanceTo(ballWorldPosition);

  const precision = getHitPrecision(racketBallDistance);

  const targetPosition = {
    x: precision.x,
    y: precision.y,
    z: 15 * playeModifier,
  };

  //Get direction from ball position to target position
  const direction = {
    x: targetPosition.x - ballWorldPosition.x,
    y: targetPosition.y - ballWorldPosition.y,
    z: targetPosition.z - ballWorldPosition.z,
  };

  const directionLength = Math.sqrt(
    direction.x * direction.x +
      direction.y * direction.y +
      direction.z * direction.z
  );

  const normalizedAndScaledDirection = {
    x: (direction.x / directionLength) * precision.scalarMultiplier,
    y: (direction.y / directionLength) * precision.scalarMultiplier,
    z: (direction.z / directionLength) * precision.scalarMultiplier,
  };

  const variationBasedOnPrecision = (Math.random() - 0.5) * precision.modifier;

  const xVariation = variationBasedOnPrecision * 3.33;
  const yVariation = variationBasedOnPrecision * 0.5;

  ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
  ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
  ball.applyImpulse(
    {
      x: normalizedAndScaledDirection.x + xVariation,
      y: normalizedAndScaledDirection.y + yVariation,
      z: normalizedAndScaledDirection.z,
    },
    true
  );
}

export function ballHitPlayerTable(room: MyRoom) {
  if (
    room.touchedLastBy === room.hostId ||
    room.playerLastTableHit === room.hostId
  ) {
    room.handleScore(room.opponentId);
  }
  room.playerLastTableHit = room.hostId;
}

export function ballHitOpponentTable(room: MyRoom) {
  if (
    room.touchedLastBy === room.opponentId ||
    room.playerLastTableHit === room.opponentId
  ) {
    room.handleScore(room.hostId);
  }

  room.playerLastTableHit = room.opponentId;
}

export function handleBallOut(room: MyRoom) {
  if (room.touchedLastBy === room.hostId) {
    if (room.playerLastTableHit === room.opponentId) {
      room.handleScore(room.hostId);
      return;
    }
    room.handleScore(room.opponentId);
    return;
  }

  if (room.playerLastTableHit === room.hostId) {
    room.handleScore(room.opponentId);
    return;
  }
  room.handleScore(room.hostId);
}
