// DUSTLINE — input: keyboard + mouse (pointer lock) into state.input.
// Edge-triggered actions (reload, buy, grenade, interact, slot) are set on
// keydown and cleared by the sim after it consumes them. Look deltas are
// accumulated and consumed by the sim each fixed step.

export function createInput(canvas, state) {
  const input = state.input;
  let locked = false;
  let anyClick = false;

  function keyDown(e) {
    if (e.code === 'Tab') { e.preventDefault(); input.score = true; return; }
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': input.fwd = 1; break;
      case 'KeyS': case 'ArrowDown': input.fwd = -1; break;
      case 'KeyA': case 'ArrowLeft': input.strafe = -1; break;
      case 'KeyD': case 'ArrowRight': input.strafe = 1; break;
      case 'ShiftLeft': case 'ShiftRight': input.sprint = true; break;
      case 'ControlLeft': case 'KeyC': input.crouch = true; break;
      case 'Space': input.jump = true; e.preventDefault(); break;
      case 'KeyR': if (!e.repeat) input.reload = true; break;
      case 'KeyB': if (!e.repeat) input.buy = true; break;
      case 'KeyG': if (!e.repeat) input.grenade = true; break;
      case 'KeyE': input.interact = true; break;
      case 'Digit1': input.slot = 0; break;
      case 'Digit2': input.slot = 1; break;
      case 'Digit3': input.slot = 2; break;
    }
  }
  function keyUp(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': if (input.fwd === 1) input.fwd = 0; break;
      case 'KeyS': case 'ArrowDown': if (input.fwd === -1) input.fwd = 0; break;
      case 'KeyA': case 'ArrowLeft': if (input.strafe === -1) input.strafe = 0; break;
      case 'KeyD': case 'ArrowRight': if (input.strafe === 1) input.strafe = 0; break;
      case 'ShiftLeft': case 'ShiftRight': input.sprint = false; break;
      case 'ControlLeft': case 'KeyC': input.crouch = false; break;
      case 'Space': input.jump = false; break;
      case 'KeyE': input.interact = false; break;
      case 'Tab': input.score = false; break;
    }
  }
  function mouseMove(e) {
    if (!locked) return;
    input.lookDX += e.movementX;
    input.lookDY += e.movementY;
  }
  function mouseDown(e) {
    anyClick = true;
    if (e.button === 0) input.fire = true;
    if (e.button === 2) input.aim = true;
    if (!locked && state.phase !== 'menu') canvas.requestPointerLock();
  }
  function mouseUp(e) {
    if (e.button === 0) input.fire = false;
    if (e.button === 2) input.aim = false;
  }
  function lockChange() {
    locked = document.pointerLockElement === canvas;
    if (!locked) input.fire = false;
  }
  function blur() {
    input.fwd = 0; input.strafe = 0; input.fire = false; input.aim = false; input.jump = false;
    input.sprint = false; input.crouch = false; input.interact = false;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('mousemove', mouseMove);
  window.addEventListener('mouseup', mouseUp);
  window.addEventListener('blur', blur);
  canvas.addEventListener('mousedown', mouseDown);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', lockChange);

  return {
    get locked() { return locked; },
    lock() { canvas.requestPointerLock(); },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    consumeClick() { const c = anyClick; anyClick = false; return c; },
    clearEdges() {
      input.reload = false; input.buy = false; input.grenade = false;
      input.slot = -1; input.fireEdge = false;
    },
  };
}
