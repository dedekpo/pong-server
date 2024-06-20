import RAPIER from "@dimforge/rapier3d-compat";

function createWorld(): RAPIER.World {
  return new RAPIER.World({ x: 0.0, y: -40, z: 0.0 });
}

function createPlayerTable(world: RAPIER.World) {
  // Create a fixed rigid body with a collider for the player table
  let playerTableRigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    0,
    -2,
    15
  );

  let playerTableRigidBody = world.createRigidBody(playerTableRigidBodyDesc);

  let playerTableColliderDesc = RAPIER.ColliderDesc.cuboid(20, 0.5, 15)
    .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
    .setContactForceEventThreshold(10)
    .setRestitution(0.7)
    .setFriction(0.9);

  world.createCollider(playerTableColliderDesc, playerTableRigidBody);

  return playerTableRigidBody;
}

function createOpponentTable(world: RAPIER.World) {
  // Create a fixed rigid body with a collider for the opponent table
  let opponentTableRigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    0,
    -2,
    -15
  );

  let opponentTableRigidBody = world.createRigidBody(
    opponentTableRigidBodyDesc
  );

  let opponentTableColliderDesc = RAPIER.ColliderDesc.cuboid(20, 0.5, 15)
    .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
    .setContactForceEventThreshold(10)
    .setRestitution(0.7)
    .setFriction(0.9);

  world.createCollider(opponentTableColliderDesc, opponentTableRigidBody);

  return opponentTableRigidBody;
}

function createBall(world: RAPIER.World) {
  // Create a dynamic rigid body with a collider for the ball
  let ballRigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setCcdEnabled(true)
    .setTranslation(0, 10, 30) // 0, 10, 30
    .setCanSleep(false);

  const ballRigidBody = world.createRigidBody(ballRigidBodyDesc);

  let ballColliderDesc = RAPIER.ColliderDesc.ball(0.2)
    .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
    .setContactForceEventThreshold(10)
    .setRestitution(1)
    .setMass(0.1);

  world.createCollider(ballColliderDesc, ballRigidBody);

  return ballRigidBody;
}

function createRacket(world: RAPIER.World) {
  // Create a fixed rigid body for the player's racket
  let racketRigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    0,
    5,
    30
  );
  const racketRigidBody = world.createRigidBody(racketRigidBodyDesc);

  // Create a cuboid collider for the player's racket
  let racketColliderDesc = RAPIER.ColliderDesc.cuboid(
    2.4,
    2.4,
    0.3
  ).setTranslation(0.05, 0, -0.2);

  world.createCollider(racketColliderDesc, racketRigidBody);

  return racketRigidBody;
}

function createOpponentRacket(world: RAPIER.World) {
  // Create a fixed rigid body for the opponent's racket
  let opponentRacketRigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    0,
    5,
    -30
  );
  const opponentRacketRigidBody = world.createRigidBody(
    opponentRacketRigidBodyDesc
  );

  // Create a cuboid collider for the opponent's racket
  let opponentRacketColliderDesc = RAPIER.ColliderDesc.cuboid(
    2.4,
    2.4,
    0.3
  ).setTranslation(0.05, 0, -0.2);

  world.createCollider(opponentRacketColliderDesc, opponentRacketRigidBody);

  return opponentRacketRigidBody;
}

function createBallOutSensor(world: RAPIER.World) {
  // Create a cuboid collider
  const colliderDesc = RAPIER.ColliderDesc.cuboid(400, 3, 400)
    .setSensor(true)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
    .setTranslation(0, -15, 0);

  const collider = world.createCollider(colliderDesc);

  return collider;
}

export function initPhysics() {
  const world = createWorld();

  const playerTable = createPlayerTable(world);
  const opponentTable = createOpponentTable(world);
  const ball = createBall(world);
  const racket = createRacket(world);

  const opponentRacket = createOpponentRacket(world);

  const ballOutSensor = createBallOutSensor(world);

  return {
    world,
    ball,
    racket,
    opponentRacket,
    playerTable,
    opponentTable,
    ballOutSensor,
  };
}
