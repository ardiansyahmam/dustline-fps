// DUSTLINE — state: one central, preallocated game state.
// The sim owns this object; render and HUD only read it. Nothing here
// allocates during a round: agents, arrays and temp objects are created
// once in createState() and reused.

export const PHASE = { MENU: 'menu', BUY: 'buy', LIVE: 'live', END: 'end', MATCH: 'match' };
export const TEAM = { ATK: 0, DEF: 1 };

export const ROUND_TIME = 100;      // seconds of live play
export const BUY_TIME = 15;         // seconds of buy phase
export const END_TIME = 4;          // seconds the round banner shows
export const WIN_ROUNDS = 5;        // first to 5 takes the match
export const PLANT_TIME = 3.5;      // seconds to plant the spike
export const DEFUSE_TIME = 5;       // seconds to defuse the spike
export const SPIKE_TIME = 45;       // seconds from plant to detonation
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const LOSS_STREAK_BONUS = 500; // per consecutive loss, max 3
export const PLANT_REWARD = 300;

export function createAgent(id, name, team, isPlayer, isBot) {
  return {
    id, name, team, isPlayer, isBot,
    x: 0, y: 0, z: 0,           // feet position
    vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: 0,           // view direction
    strafe: 0,                  // -1/0/1, camera lean (must exist before first render)
    hp: 100, armor: 0, alive: true,
    crouched: false, onGround: true,
    // combat
    weapon: null,               // weapon instance (see weapons.js)
    weapons: [null, null, null],// slots: 0 primary, 1 secondary, 2 melee none
    slot: 0,
    spread: 0, recoil: 0,       // current bloom / kick
    lastShot: -99, reloading: false, reloadEnd: 0,
    grenades: { frag: 0, smoke: 0 },
    // bot brain (unused for the player)
    brain: null,
    // hit feedback
    flash: 0,                   // red damage vignette timer
    // per-agent scratch (no allocation in hot loop)
    tx: 0, tz: 0,               // intended move target (bots)
    aimErr: 0, reactAt: 0, burstLeft: 0, burstAt: 0,
  };
}

export function createState(seed) {
  const s = {
    seed,
    time: 0,                    // total match clock
    phase: PHASE.MENU,
    phaseT: 0,                  // time left in this phase
    round: 1,
    score: [0, 0],              // [ATK, DEF]
    lossStreak: [0, 0],
    money: START_MONEY,
    agents: [],                 // player first, then bots
    player: null,
    spike: {
      state: 'carried',         // carried | planting | planted | defusing | defused | exploded
      carrier: null,            // agent carrying it
      site: null,               // 'A' | 'B'
      x: 0, y: 0, z: 0,         // planted position
      progress: 0,              // plant/defuse channel 0..1
      timer: 0,                 // detonation countdown once planted
      beepAt: 0,
    },
    tracers: [],                // {x0,y0,z0,x1,y1,z1,life,maxLife} pooled
    smokes: [],                 // {x,y,z,life,maxLife}
    frags: [],                  // live grenade projectiles
    feed: [],                   // kill feed strings, newest last (max 5)
    banner: '', bannerSub: '', bannerT: 0,
    hitmark: 0, hitmarkKill: false,
    roundWinner: -1, roundReason: '',
    matchWinner: -1,
    shotsFired: 0, shotsHit: 0,
    // input intent, written by input.js, read by sim
    input: {
      fwd: 0, strafe: 0, jump: false, crouch: false, slow: false,
      fire: false, fireEdge: false, reload: false, buy: false,
      grenade: false, interact: false, slot: -1, score: false,
      lookDX: 0, lookDY: 0,
    },
    // render hints
    cameraShake: 0,
    flashT: 0,                  // muzzle-flash timer (render reads it)
    slowmo: 0,
  };
  return s;
}

export function addFeed(state, text) {
  state.feed.push(text);
  if (state.feed.length > 5) state.feed.shift();
}

export function setBanner(state, text, sub, dur) {
  state.banner = text; state.bannerSub = sub; state.bannerT = dur;
}
