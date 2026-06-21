import Phaser from "phaser";
import "./style.css";
import { KidsPlatformerScene } from "./game/KidsPlatformerScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: 960,
  height: 540,
  backgroundColor: "#76c7f2",
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 920 },
      debug: false
    }
  },
  scene: [KidsPlatformerScene]
};

new Phaser.Game(config);
