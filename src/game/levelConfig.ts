export type StageKey = "surface-start" | "underground" | "surface-final";

export type StageTheme = "surface" | "underground";

export type StageConfig = {
  key: StageKey;
  label: string;
  targetSeconds: number;
  theme: StageTheme;
  worldWidth: number;
  hasPipe: boolean;
  pipeLabel: string;
};

const RUN_SPEED = 170;
const START_PADDING = 360;
const END_PADDING = 760;

const widthForSeconds = (seconds: number) => Math.round(RUN_SPEED * seconds + START_PADDING + END_PADDING);

export const STAGES: StageConfig[] = [
  {
    key: "surface-start",
    label: "1층 모험",
    targetSeconds: 180,
    theme: "surface",
    worldWidth: widthForSeconds(180),
    hasPipe: true,
    pipeLabel: "지하로 내려가기"
  },
  {
    key: "underground",
    label: "지하 모험",
    targetSeconds: 180,
    theme: "underground",
    worldWidth: widthForSeconds(180),
    hasPipe: true,
    pipeLabel: "1층으로 올라가기"
  },
  {
    key: "surface-final",
    label: "깃발까지",
    targetSeconds: 60,
    theme: "surface",
    worldWidth: widthForSeconds(60),
    hasPipe: false,
    pipeLabel: ""
  }
];

export const GAME_SIZE = {
  width: 960,
  height: 540,
  groundY: 472,
  playerStartX: 120,
  playerStartY: 360
};
