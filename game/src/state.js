// DUSTLINE — state: one central, preallocated game state.
// The sim owns this object; render and HUD only read it. Nothing here
// allocates during a round: agents, arrays and temp objects are created
// once in createState() and reused.

export const PHASE = { MENU: 'menu', BUY: 'buy', LIVE: 'live', END: 'end', MATCH: 'match' };
export const TEAM = { ATK: 0, DEF: 1 };

// ---- aturan ronde & ekonomi (desain Supra, best-of-13) ----
export const ROUND_TIME = 95;      // seconds of live play
export const BUY_TIME = 12;        // seconds of buy phase
export const END_TIME = 4;         // seconds the round banner shows
export const WIN_ROUNDS = 7;       // first to 7 takes the match (best-of-13)
export const PLANT_TIME = 3.5;     // seconds to plant the spike
export const DEFUSE_TIME = 6;      // seconds to defuse the spike
export const DEFUSE_TIME_KIT = 4;  // defuse with a kit
export const SPIKE_TIME = 35;      // seconds from plant to detonation
export const START_MONEY = 1000;
export const MONEY_CAP = 10000;
export const KILL_REWARD = 300;    // fallback; per-weapon reward lives on the weapon def
export const WIN_REWARD = 2800;
export const WIN_REWARD_DET = 3200; // round won by detonation
export const LOSS_REWARD = 1800;
export const LOSS_STREAK_BONUS = 400; // per consecutive loss, loss payout capped at 3000
export const LOSS_REWARD_MAX = 3000;
export const PLANT_REWARD = 300;
export const DEFUSE_REWARD = 300;

export function createAgent(id, name, team, isPlayer, isBot) {
  return {
    id, name, team, isPlayer, isBot,
    x: 0, y: 0, z: 0,           // feet position
    vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: 0,           // view direction
    strafe: 0,                  // -1/0/1, camera lean (must exist before first render)
    hp: 100, armor: 0, helmet: false, kit: false, alive: true,
    blindUntil: 0,              // flashbang: cannot see until this clock time
    crouched: false, onGround: true,
    // combat
    weapon: null,               // weapon instance (see weapons.js)
    weapons: [null, null, null],// slots: 0 primary, 1 secondary, 2 melee none
    slot: 0,
    spread: 0, recoil: 0,       // current bloom / kick
    lastShot: -99, reloading: false, reloadEnd: 0,
    grenades: { blink: 0, haze: 0 },
    // bot brain (unused for the player)
    brain: null,
    // hit feedback
    flash: 0,                   // red damage vignette timer
    // match stats (scoreboard)
    kills: 0, deaths: 0, dmg: 0, hs: 0,
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
    roundHistory: [],           // winner team per finished round (max 13)
    lossStreak: [0, 0],
    swapped: false,             // sides swapped after round 6 (best-of-13)
    intel: { A: -99, B: -99 },  // last clock time a DEFENDER was seen/heard near each site
    money: START_MONEY,
    agents: [],                 // player first, then bots
    player: null,
    spike: {
      state: 'carried',         // carried | planting | planted | defusing | defused | exploded
      carrier: null,            // agent carrying it
      defuser: null,            // agent currently defusing
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
      fwd: 0, strafe: 0, jump: false, crouch: false, sprint: false,
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
