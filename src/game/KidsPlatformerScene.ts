import Phaser from "phaser";
import { EightBitAudio } from "./audio/EightBitAudio";
import { GAME_SIZE, STAGES, StageConfig } from "./levelConfig";

type PlayerForm = "kid" | "dad" | "mom";
type KidCharacter = "seojun" | "seojin";
type PlayerMotion = "idle" | "walk" | "jump";
type BlockKind = "coin" | "broccoli" | "flower";
type EnemyKind = "turtle" | "chestnut";

type TouchState = {
  left: boolean;
  right: boolean;
  down: boolean;
  jump: boolean;
};

const COLORS = {
  sky: 0x76c7f2,
  hill: 0x77c96a,
  grass: 0x5fb85f,
  dirt: 0x9a6a3a,
  caveBack: 0x21213f,
  caveFloor: 0x4c5268,
  caveTrim: 0x737b9a,
  coin: 0xffd84d,
  question: 0xf3b63a,
  brick: 0xb86a45,
  used: 0x8a8d92,
  pipe: 0x3dbb62,
  pipeDark: 0x198a44,
  flag: 0xfff4a3
};

const CHARACTER_PROFILES = ["kid-seojun", "kid-seojin", "dad", "mom"] as const;
const WALK_FRAMES = ["walk-0", "walk-1", "walk-2", "walk-3", "walk-4"] as const;
const PLAYER_SCALE: Record<PlayerForm, number> = {
  kid: 1,
  dad: 2,
  mom: 2
};

const publicAsset = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

export class KidsPlatformerScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private oneKey!: Phaser.Input.Keyboard.Key;
  private twoKey!: Phaser.Input.Keyboard.Key;
  private audio = new EightBitAudio();
  private stageIndex = 0;
  private stage!: StageConfig;
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerForm: PlayerForm = "kid";
  private activeKid: KidCharacter = "seojun";
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private blocks!: Phaser.Physics.Arcade.StaticGroup;
  private coins!: Phaser.Physics.Arcade.StaticGroup;
  private items!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private scenery: Phaser.GameObjects.GameObject[] = [];
  private pipeZone?: Phaser.GameObjects.Zone;
  private flagZone?: Phaser.GameObjects.Zone;
  private hudText!: Phaser.GameObjects.Text;
  private helperText!: Phaser.GameObjects.Text;
  private startOverlay!: Phaser.GameObjects.Container;
  private startChoiceCards = new Map<KidCharacter, Phaser.GameObjects.Rectangle>();
  private startChoiceLabels = new Map<KidCharacter, Phaser.GameObjects.Text>();
  private stageStartTime = 0;
  private coinCount = 0;
  private gameStarted = false;
  private transitioning = false;
  private cleared = false;
  private invulnerableUntil = 0;
  private touch: TouchState = { left: false, right: false, down: false, jump: false };

  constructor() {
    super("KidsPlatformerScene");
  }

  preload(): void {
    CHARACTER_PROFILES.forEach((profile) => {
      this.load.image(`${profile}-idle`, publicAsset(`assets/characters/${profile}/idle.png`));
      this.load.image(`${profile}-jump`, publicAsset(`assets/characters/${profile}/jump.png`));
      WALK_FRAMES.forEach((frame) => {
        this.load.image(`${profile}-${frame}`, publicAsset(`assets/characters/${profile}/${frame}.png`));
      });
    });
  }

  create(): void {
    this.createTextures();
    this.createCharacterAnimations();
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.oneKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.twoKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.stage = STAGES[this.stageIndex];
    this.buildStage();
    this.createHud();
    this.createTouchControls();
    this.createStartOverlay();

    this.input.keyboard!.on("keydown-SPACE", () => this.startGame());
    this.input.keyboard!.on("keydown-ENTER", () => this.startGame());
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.handleStartOverlayPointer(pointer));
  }

  update(time: number): void {
    this.updateKidSelection();

    if (!this.gameStarted || this.transitioning || this.cleared) {
      return;
    }

    this.updatePlayer(time);
    this.updateEnemies();
    this.updateHud(time);
    this.checkPipeInput();
  }

  private startGame(): void {
    if (this.gameStarted) {
      return;
    }

    this.gameStarted = true;
    this.stageStartTime = this.time.now;
    this.startOverlay.setVisible(false);
    void this.audio.start(this.stage.theme);
    this.publishDebugState();
  }

  private requestFullscreen(): void {
    const target = this.game.canvas as HTMLCanvasElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    };
    const documentElement = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    };

    if (document.fullscreenElement) {
      return;
    }

    const request =
      target.requestFullscreen?.bind(target) ??
      target.webkitRequestFullscreen?.bind(target) ??
      target.msRequestFullscreen?.bind(target) ??
      documentElement.requestFullscreen?.bind(documentElement) ??
      documentElement.webkitRequestFullscreen?.bind(documentElement) ??
      documentElement.msRequestFullscreen?.bind(documentElement);

    void request?.();
  }

  private buildStage(): void {
    this.clearStageObjects();
    this.stage = STAGES[this.stageIndex];
    this.physics.world.setBounds(0, 0, this.stage.worldWidth, GAME_SIZE.height);
    this.cameras.main.setBounds(0, 0, this.stage.worldWidth, GAME_SIZE.height);
    this.cameras.main.setBackgroundColor(this.stage.theme === "surface" ? COLORS.sky : COLORS.caveBack);

    this.platforms = this.physics.add.staticGroup();
    this.blocks = this.physics.add.staticGroup();
    this.coins = this.physics.add.staticGroup();
    this.items = this.physics.add.group({ allowGravity: true });
    this.enemies = this.physics.add.group({ allowGravity: true });

    this.createBackground();
    this.createGround();
    this.createBlocksAndCoins();
    this.createEnemies();

    if (this.stage.hasPipe) {
      this.createPipe();
    } else {
      this.createFlag();
    }

    this.player = this.physics.add.sprite(GAME_SIZE.playerStartX, GAME_SIZE.playerStartY, this.characterFrameKey("idle"));
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0.02);
    this.player.setDepth(10);
    this.playerForm = "kid";
    this.refreshPlayerBody();
    this.applyPlayerScale();
    this.playPlayerAnimation("idle", true);

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.player, this.blocks, this.onBlockHit, undefined, this);
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.collider(this.items, this.platforms);
    this.physics.add.overlap(this.player, this.coins, this.collectCoin, undefined, this);
    this.physics.add.overlap(this.player, this.items, this.collectItem, undefined, this);
    this.physics.add.overlap(this.player, this.enemies, this.touchEnemy, undefined, this);

    if (this.flagZone) {
      this.physics.add.overlap(this.player, this.flagZone, () => this.clearGame(), undefined, this);
    }

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.stageStartTime = this.time.now;
    this.publishDebugState();
  }

  private clearStageObjects(): void {
    this.scenery.forEach((object) => object.destroy());
    this.scenery = [];

    [
      this.platforms,
      this.blocks,
      this.coins,
      this.items,
      this.enemies
    ].forEach((group) => group?.destroy(true));

    this.pipeZone?.destroy();
    this.flagZone?.destroy();
    this.player?.destroy();
    this.pipeZone = undefined;
    this.flagZone = undefined;
  }

  private createBackground(): void {
    if (this.stage.theme === "surface") {
      for (let x = 240; x < this.stage.worldWidth; x += 980) {
        this.addScenery(this.add.image(x, 96, "cloud").setScrollFactor(0.42).setDepth(-20));
      }

      for (let x = 120; x < this.stage.worldWidth; x += 760) {
        this.addScenery(this.add.image(x, GAME_SIZE.groundY - 38, "hill").setOrigin(0.5, 1).setDepth(-10));
      }
    } else {
      for (let x = 160; x < this.stage.worldWidth; x += 520) {
        this.addScenery(this.add.image(x, 120 + (x % 3) * 36, "cave-gem").setDepth(-10));
      }
    }
  }

  private createGround(): void {
    const segmentWidth = 1024;
    for (let x = 0; x < this.stage.worldWidth; x += segmentWidth) {
      const width = Math.min(segmentWidth, this.stage.worldWidth - x);
      const fill = this.stage.theme === "surface" ? COLORS.dirt : COLORS.caveFloor;
      const ground = this.add.rectangle(x + width / 2, GAME_SIZE.groundY, width, 68, fill).setOrigin(0.5, 0);
      this.physics.add.existing(ground, true);
      this.platforms.add(ground);

      const top = this.add.rectangle(
        x + width / 2,
        GAME_SIZE.groundY,
        width,
        10,
        this.stage.theme === "surface" ? COLORS.grass : COLORS.caveTrim
      ).setOrigin(0.5, 0);
      this.addScenery(top);
    }

    for (let x = 900; x < this.stage.worldWidth - 1200; x += 1700) {
      this.createPlatform(x, 355, 210);
      this.createPlatform(x + 680, 295, 150);
    }
  }

  private createPlatform(x: number, y: number, width: number): void {
    const platform = this.add.rectangle(x, y, width, 18, this.stage.theme === "surface" ? 0x7bc96f : 0x6c7391);
    this.physics.add.existing(platform, true);
    this.platforms.add(platform);
  }

  private createBlocksAndCoins(): void {
    const blockCycle: BlockKind[] = ["coin", "coin", "broccoli", "coin", "flower"];

    for (let x = 620; x < this.stage.worldWidth - 1100; x += 760) {
      const y = x % 2 === 0 ? 318 : 336;
      const kind = blockCycle[Math.floor(x / 760) % blockCycle.length];
      const block = this.blocks.create(x, y, kind === "coin" ? "coin-brick" : "question-block") as Phaser.Physics.Arcade.Sprite;
      block.setData("kind", kind);
      block.setData("used", false);
      block.refreshBody();

      for (let i = 0; i < 3; i += 1) {
        const coin = this.coins.create(x + 170 + i * 54, y - 8, "coin") as Phaser.Physics.Arcade.Sprite;
        coin.refreshBody();
      }
    }
  }

  private createEnemies(): void {
    const kinds: EnemyKind[] = ["turtle", "chestnut"];

    for (let x = 1350; x < this.stage.worldWidth - 1400; x += 1450) {
      const kind = kinds[Math.floor(x / 1450) % kinds.length];
      const enemy = this.enemies.create(x, GAME_SIZE.groundY - 34, kind === "turtle" ? "enemy-turtle" : "enemy-chestnut") as Phaser.Physics.Arcade.Sprite;
      enemy.setData("startX", x);
      enemy.setData("range", kind === "turtle" ? 180 : 120);
      enemy.setData("kind", kind);
      enemy.setVelocityX(kind === "turtle" ? -45 : -35);
      enemy.setBounce(0);
      enemy.setCollideWorldBounds(false);
      enemy.setDepth(8);
    }
  }

  private createPipe(): void {
    const pipeX = this.stage.worldWidth - 430;
    const pipeBaseY = GAME_SIZE.groundY - 42;
    const pipe = this.add.image(pipeX, pipeBaseY, "pipe").setOrigin(0.5, 1).setDepth(6);
    this.addScenery(pipe);

    const pipeCollider = this.add.rectangle(pipeX, GAME_SIZE.groundY - 26, 88, 52, 0x000000, 0);
    this.physics.add.existing(pipeCollider, true);
    this.platforms.add(pipeCollider);

    this.pipeZone = this.add.zone(pipeX, GAME_SIZE.groundY - 74, 120, 116);
    this.physics.add.existing(this.pipeZone, true);

    const label = this.add.text(pipeX, GAME_SIZE.groundY - 145, "↓", {
      fontFamily: "Arial",
      fontSize: "30px",
      color: "#ffffff",
      stroke: "#144326",
      strokeThickness: 5
    }).setOrigin(0.5).setDepth(20);
    this.addScenery(label);
  }

  private createFlag(): void {
    const poleX = this.stage.worldWidth - 420;
    const pole = this.add.rectangle(poleX, GAME_SIZE.groundY - 112, 8, 220, 0xfafafa).setDepth(6);
    const flag = this.add.triangle(poleX + 34, GAME_SIZE.groundY - 192, 0, 0, 74, 24, 0, 48, COLORS.flag).setDepth(7);
    const base = this.add.rectangle(poleX, GAME_SIZE.groundY - 8, 66, 16, 0xd6d6d6).setDepth(6);
    this.addScenery(pole);
    this.addScenery(flag);
    this.addScenery(base);

    this.flagZone = this.add.zone(poleX, GAME_SIZE.groundY - 110, 100, 230);
    this.physics.add.existing(this.flagZone, true);
  }

  private updatePlayer(time: number): void {
    const left = this.cursors.left.isDown || this.touch.left;
    const right = this.cursors.right.isDown || this.touch.right;
    const jump = Phaser.Input.Keyboard.JustDown(this.spaceKey) || Phaser.Input.Keyboard.JustDown(this.cursors.up) || this.touch.jump;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const speed = this.playerForm === "dad" ? 184 : 170;

    if (left) {
      this.player.setVelocityX(-speed);
      this.player.setFlipX(true);
    } else if (right) {
      this.player.setVelocityX(speed);
      this.player.setFlipX(false);
    } else {
      this.player.setVelocityX(0);
    }

    if (jump && body.blocked.down) {
      this.player.setVelocityY(this.playerForm === "mom" ? -660 : -610);
      this.audio.playJump();
      this.touch.jump = false;
    }

    if (!body.blocked.down) {
      this.playPlayerAnimation("jump");
    } else if (left || right) {
      this.playPlayerAnimation("walk");
    } else {
      this.playPlayerAnimation("idle");
    }

    if (time < this.invulnerableUntil) {
      this.player.setAlpha(time % 180 < 90 ? 0.45 : 1);
    } else {
      this.player.setAlpha(1);
    }
  }

  private updateKidSelection(): void {
    if (Phaser.Input.Keyboard.JustDown(this.oneKey)) {
      this.setActiveKid("seojun");
    }

    if (Phaser.Input.Keyboard.JustDown(this.twoKey)) {
      this.setActiveKid("seojin");
    }
  }

  private updateEnemies(): void {
    this.enemies.children.iterate((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) {
        return true;
      }

      const body = enemy.body as Phaser.Physics.Arcade.Body;
      const startX = enemy.getData("startX") as number;
      const range = enemy.getData("range") as number;

      if (enemy.x < startX - range || enemy.x > startX + range || body.blocked.left || body.blocked.right) {
        enemy.setVelocityX(-body.velocity.x || -40);
        enemy.setFlipX(body.velocity.x > 0);
      }

      return true;
    });
  }

  private checkPipeInput(): void {
    if (!this.pipeZone || this.transitioning) {
      return;
    }

    const wantsDown = this.cursors.down.isDown || this.touch.down;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const closeToPipe = Phaser.Geom.Intersects.RectangleToRectangle(
      this.player.getBounds(),
      this.pipeZone.getBounds()
    );

    if (wantsDown && closeToPipe && body.blocked.down) {
      this.enterPipe();
    }
  }

  private enterPipe(): void {
    if (this.stageIndex >= STAGES.length - 1) {
      return;
    }

    this.transitioning = true;
    this.audio.playPipe();
    this.player.setVelocity(0, 0);
    this.player.body!.enable = false;

    this.tweens.add({
      targets: this.player,
      y: this.player.y + 86,
      alpha: 0,
      duration: 620,
      ease: "Sine.easeIn",
      onComplete: () => {
        this.cameras.main.fadeOut(280, 0, 0, 0);
        this.time.delayedCall(320, () => {
          this.stageIndex += 1;
          this.buildStage();
          this.audio.startMusic(this.stage.theme);
          this.cameras.main.fadeIn(300, 0, 0, 0);
          this.transitioning = false;
          this.publishDebugState();
        });
      }
    });
  }

  private onBlockHit(
    playerObject: unknown,
    blockObject: unknown
  ): void {
    const player = playerObject as Phaser.Physics.Arcade.Sprite;
    const block = blockObject as Phaser.Physics.Arcade.Sprite;
    const body = player.body as Phaser.Physics.Arcade.Body;
    const blockBody = block.body as Phaser.Physics.Arcade.StaticBody;

    if (!body.touching.up || !blockBody.touching.down || player.y <= block.y || block.getData("used")) {
      return;
    }

    block.setData("used", true);
    block.setTexture("used-block");
    this.tweens.add({
      targets: block,
      y: block.y - 8,
      yoyo: true,
      duration: 80
    });

    const kind = block.getData("kind") as BlockKind;
    if (kind === "coin") {
      this.coinCount += 1;
      this.audio.playCoin();
      this.floatText("+1", block.x, block.y - 44, "#ffe484");
      this.publishDebugState();
      return;
    }

    const texture = kind === "broccoli" ? "item-broccoli" : "item-flower";
    const item = this.items.create(block.x, block.y - 48, texture) as Phaser.Physics.Arcade.Sprite;
    item.setData("kind", kind);
    item.setDepth(12);
    item.setBounce(0.05);
    item.setDragX(160);
    item.setVelocityY(-120);
    this.audio.playPower();
  }

  private collectCoin(
    _playerObject: unknown,
    coinObject: unknown
  ): void {
    const coin = coinObject as Phaser.Physics.Arcade.Sprite;
    coin.disableBody(true, true);
    this.coinCount += 1;
    this.audio.playCoin();
    this.publishDebugState();
  }

  private collectItem(
    _playerObject: unknown,
    itemObject: unknown
  ): void {
    const item = itemObject as Phaser.Physics.Arcade.Sprite;
    const kind = item.getData("kind") as BlockKind;
    item.disableBody(true, true);

    if (kind === "broccoli") {
      this.setPlayerForm("dad");
      this.floatText("아빠!", this.player.x, this.player.y - 62, "#bfffbf");
    } else {
      this.setPlayerForm("mom");
      this.floatText("엄마!", this.player.x, this.player.y - 62, "#ffd1ef");
    }

    this.audio.playPower();
    this.publishDebugState();
  }

  private touchEnemy(
    playerObject: unknown,
    enemyObject: unknown
  ): void {
    const player = playerObject as Phaser.Physics.Arcade.Sprite;
    const enemy = enemyObject as Phaser.Physics.Arcade.Sprite;
    const body = player.body as Phaser.Physics.Arcade.Body;

    if (body.velocity.y > 80 && player.y < enemy.y - 10) {
      enemy.disableBody(true, true);
      player.setVelocityY(-360);
      this.audio.playCoin();
      return;
    }

    if (this.time.now < this.invulnerableUntil) {
      return;
    }

    this.invulnerableUntil = this.time.now + 1600;
    this.setPlayerForm("kid");
    player.setVelocityX(player.x < enemy.x ? -280 : 280);
    player.setVelocityY(-250);
    this.audio.playHit();
  }

  private setPlayerForm(form: PlayerForm): void {
    this.playerForm = form;
    this.player.setTexture(this.characterFrameKey("idle"));
    this.applyPlayerScale();
    this.refreshPlayerBody();
    this.playPlayerAnimation("idle", true);
    this.publishDebugState();
  }

  private refreshPlayerBody(): void {
    this.player.setSize(34, 58);
    this.player.setOffset(19, 24);
  }

  private applyPlayerScale(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
    const bottomBefore = this.player.getBottomCenter().y;
    this.player.setScale(PLAYER_SCALE[this.playerForm]);
    const bottomAfter = this.player.getBottomCenter().y;

    if (body?.blocked.down) {
      this.player.y -= bottomAfter - bottomBefore;
    }
  }

  private clearGame(): void {
    if (this.cleared) {
      return;
    }

    this.cleared = true;
    this.player.setVelocity(0, -420);
    this.audio.playClear();

    const panel = this.add.rectangle(480, 190, 560, 180, 0xffffff, 0.94)
      .setScrollFactor(0)
      .setDepth(100);
    const title = this.add.text(480, 158, "클리어!", {
      fontFamily: "Arial",
      fontSize: "44px",
      color: "#1b4332",
      fontStyle: "bold"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    const detail = this.add.text(480, 220, `코인 ${this.coinCount}개를 모았어요`, {
      fontFamily: "Arial",
      fontSize: "24px",
      color: "#2f3a4a"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    this.addScenery(panel);
    this.addScenery(title);
    this.addScenery(detail);
    this.publishDebugState();
  }

  private createHud(): void {
    this.hudText = this.add.text(18, 16, "", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#ffffff",
      stroke: "#1f2937",
      strokeThickness: 4
    }).setScrollFactor(0).setDepth(80);

    this.helperText = this.add.text(480, 506, "이동: ← →   점프: ↑ 또는 Space   파이프: ↓", {
      fontFamily: "Arial",
      fontSize: "17px",
      color: "#ffffff",
      stroke: "#1f2937",
      strokeThickness: 4
    }).setOrigin(0.5).setScrollFactor(0).setDepth(80);
  }

  private updateHud(time: number): void {
    const elapsed = Math.floor((time - this.stageStartTime) / 1000);
    const target = this.formatTime(this.stage.targetSeconds);
    const current = this.formatTime(elapsed);
    const progress = Math.min(100, Math.round((this.player.x / Math.max(1, this.stage.worldWidth - 500)) * 100));
    this.hudText.setText(`${this.stage.label}  ${current}/${target}  진행 ${progress}%  코인 ${this.coinCount}`);
    this.publishDebugState();
  }

  private createStartOverlay(): void {
    this.startChoiceCards.clear();
    this.startChoiceLabels.clear();

    const panel = this.add.rectangle(480, 270, 760, 470, 0xffffff, 0.96).setScrollFactor(0);
    const title = this.add.text(480, 70, "SJ Kids Adventure", {
      fontFamily: "Arial",
      fontSize: "40px",
      color: "#12343b",
      fontStyle: "bold"
    }).setOrigin(0.5).setScrollFactor(0);

    const body = this.add.text(480, 118, "캐릭터를 고르고 시작하세요", {
      fontFamily: "Arial",
      fontSize: "24px",
      color: "#2b4450"
    }).setOrigin(0.5).setScrollFactor(0);

    const seojunChoice = this.createKidChoice("seojun", 350, 275, "서준");
    const seojinChoice = this.createKidChoice("seojin", 610, 275, "서진");

    const startButton = this.add.rectangle(390, 462, 210, 54, 0x2563eb, 1)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    const startLabel = this.add.text(390, 462, "게임 시작", {
      fontFamily: "Arial",
      fontSize: "24px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

    const fullscreenButton = this.add.rectangle(610, 462, 190, 54, 0x0f766e, 1)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    const fullscreenLabel = this.add.text(610, 462, "전체화면", {
      fontFamily: "Arial",
      fontSize: "24px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

    const startAction = (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData
    ) => {
      event.stopPropagation();
      this.startGame();
    };
    startButton.on("pointerdown", startAction);
    startLabel.on("pointerdown", startAction);

    const fullscreenAction = (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData
    ) => {
      event.stopPropagation();
      this.requestFullscreen();
    };
    fullscreenButton.on("pointerdown", fullscreenAction);
    fullscreenLabel.on("pointerdown", fullscreenAction);

    const note = this.add.text(480, 508, "1: 서준 / 2: 서진 선택 · Space/Enter 시작 · 파이프 위에서는 ↓", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#4b6470"
    }).setOrigin(0.5).setScrollFactor(0);

    this.startOverlay = this.add.container(0, 0, [
      panel,
      title,
      body,
      ...seojunChoice,
      ...seojinChoice,
      startButton,
      startLabel,
      fullscreenButton,
      fullscreenLabel,
      note
    ]).setDepth(120);
    this.updateStartChoiceState();
  }

  private createKidChoice(
    kid: KidCharacter,
    x: number,
    y: number,
    label: string
  ): Phaser.GameObjects.GameObject[] {
    const card = this.add.rectangle(x, y, 190, 250, 0xf8fafc, 1)
      .setScrollFactor(0)
      .setStrokeStyle(4, 0xcbd5e1)
      .setInteractive({ useHandCursor: true });
    const character = this.add.image(x, y - 18, `kid-${kid}-idle`)
      .setScrollFactor(0)
      .setScale(1.85)
      .setInteractive({ useHandCursor: true });
    const name = this.add.text(x, y + 100, label, {
      fontFamily: "Arial",
      fontSize: "28px",
      color: "#12343b",
      fontStyle: "bold"
    }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

    const choose = (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData
    ) => {
      event.stopPropagation();
      this.setActiveKid(kid);
    };

    card.on("pointerdown", choose);
    character.on("pointerdown", choose);
    name.on("pointerdown", choose);

    this.startChoiceCards.set(kid, card);
    this.startChoiceLabels.set(kid, name);
    return [card, character, name];
  }

  private handleStartOverlayPointer(pointer: Phaser.Input.Pointer): void {
    if (this.gameStarted || !this.startOverlay?.visible) {
      return;
    }

    const seojunCard = new Phaser.Geom.Rectangle(255, 150, 190, 250);
    const seojinCard = new Phaser.Geom.Rectangle(515, 150, 190, 250);
    const startButton = new Phaser.Geom.Rectangle(285, 435, 210, 54);
    const fullscreenButton = new Phaser.Geom.Rectangle(515, 435, 190, 54);

    if (Phaser.Geom.Rectangle.Contains(seojunCard, pointer.x, pointer.y)) {
      this.setActiveKid("seojun");
      return;
    }

    if (Phaser.Geom.Rectangle.Contains(seojinCard, pointer.x, pointer.y)) {
      this.setActiveKid("seojin");
      return;
    }

    if (Phaser.Geom.Rectangle.Contains(startButton, pointer.x, pointer.y)) {
      this.startGame();
      return;
    }

    if (Phaser.Geom.Rectangle.Contains(fullscreenButton, pointer.x, pointer.y)) {
      this.requestFullscreen();
    }
  }

  private createTouchControls(): void {
    const controls = [
      { key: "left" as const, x: 68, y: 456, label: "←" },
      { key: "right" as const, x: 148, y: 456, label: "→" },
      { key: "down" as const, x: 108, y: 505, label: "↓" },
      { key: "jump" as const, x: 878, y: 474, label: "↑" }
    ];

    controls.forEach((control) => {
      const button = this.add.circle(control.x, control.y, 31, 0xffffff, 0.22)
        .setScrollFactor(0)
        .setDepth(90)
        .setInteractive({ useHandCursor: true });
      const label = this.add.text(control.x, control.y - 2, control.label, {
        fontFamily: "Arial",
        fontSize: "28px",
        color: "#ffffff",
        stroke: "#1f2937",
        strokeThickness: 4
      }).setOrigin(0.5).setScrollFactor(0).setDepth(91);

      button.on("pointerdown", () => {
        this.touch[control.key] = true;
        button.setFillStyle(0xffffff, 0.42);
      });
      button.on("pointerup", () => {
        this.touch[control.key] = false;
        button.setFillStyle(0xffffff, 0.22);
      });
      button.on("pointerout", () => {
        this.touch[control.key] = false;
        button.setFillStyle(0xffffff, 0.22);
      });

    });
  }

  private publishDebugState(): void {
    const state = {
      stageKey: this.stage.key,
      stageLabel: this.stage.label,
      stageIndex: this.stageIndex,
      targetSeconds: this.stage.targetSeconds,
      worldWidth: this.stage.worldWidth,
      gameStarted: this.gameStarted,
      transitioning: this.transitioning,
      cleared: this.cleared,
      coinCount: this.coinCount,
      playerForm: this.playerForm,
      activeKid: this.activeKid,
      playerScale: PLAYER_SCALE[this.playerForm],
      playerX: Math.round(this.player?.x ?? 0),
      hasPipe: this.stage.hasPipe
    };

    window.__SJ_GAME_STATE__ = state;

    const app = document.querySelector<HTMLElement>("#app");
    if (app) {
      app.dataset.gameState = JSON.stringify(state);
    }
  }

  private formatTime(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  private floatText(text: string, x: number, y: number, color: string): void {
    const label = this.add.text(x, y, text, {
      fontFamily: "Arial",
      fontSize: "20px",
      color,
      stroke: "#1f2937",
      strokeThickness: 4,
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(40);

    this.tweens.add({
      targets: label,
      y: y - 34,
      alpha: 0,
      duration: 700,
      onComplete: () => label.destroy()
    });
  }

  private addScenery<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.scenery.push(object);
    return object;
  }

  private createCharacterAnimations(): void {
    CHARACTER_PROFILES.forEach((profile) => {
      const idleKey = `${profile}-idle-anim`;
      const walkKey = `${profile}-walk-anim`;
      const jumpKey = `${profile}-jump-anim`;

      if (!this.anims.exists(idleKey)) {
        this.anims.create({
          key: idleKey,
          frames: [{ key: `${profile}-idle` }],
          frameRate: 1,
          repeat: -1
        });
      }

      if (!this.anims.exists(walkKey)) {
        this.anims.create({
          key: walkKey,
          frames: WALK_FRAMES.map((frame) => ({ key: `${profile}-${frame}` })),
          frameRate: 9,
          repeat: -1
        });
      }

      if (!this.anims.exists(jumpKey)) {
        this.anims.create({
          key: jumpKey,
          frames: [{ key: `${profile}-jump` }],
          frameRate: 1,
          repeat: -1
        });
      }
    });
  }

  private setActiveKid(kid: KidCharacter): void {
    this.activeKid = kid;
    this.updateStartChoiceState();

    if (this.playerForm === "kid" && this.player) {
      this.player.setTexture(this.characterFrameKey("idle"));
      this.playPlayerAnimation("idle", true);
      this.publishDebugState();
    }
  }

  private updateStartChoiceState(): void {
    this.startChoiceCards.forEach((card, kid) => {
      const selected = kid === this.activeKid;
      card.setFillStyle(selected ? 0xe0f2fe : 0xf8fafc, 1);
      card.setStrokeStyle(selected ? 6 : 4, selected ? 0x2563eb : 0xcbd5e1);
    });

    this.startChoiceLabels.forEach((label, kid) => {
      label.setColor(kid === this.activeKid ? "#1d4ed8" : "#12343b");
    });
  }

  private playPlayerAnimation(motion: PlayerMotion, force = false): void {
    const key = this.characterAnimationKey(motion);

    if (force || this.player.anims.currentAnim?.key !== key) {
      this.player.play(key, true);
    }
  }

  private characterProfile(): string {
    if (this.playerForm === "kid") {
      return `kid-${this.activeKid}`;
    }

    return this.playerForm;
  }

  private characterFrameKey(motion: PlayerMotion): string {
    return `${this.characterProfile()}-${motion}`;
  }

  private characterAnimationKey(motion: PlayerMotion): string {
    return `${this.characterProfile()}-${motion}-anim`;
  }

  private createTextures(): void {
    if (this.textures.exists("player-kid")) {
      return;
    }

    this.drawTexture("player-kid", 32, 44, (g) => {
      g.fillStyle(0xffd2aa).fillRect(8, 2, 16, 14);
      g.fillStyle(0x3b82f6).fillRect(6, 16, 20, 18);
      g.fillStyle(0x20304a).fillRect(7, 34, 7, 8).fillRect(19, 34, 7, 8);
      g.fillStyle(0x111827).fillRect(12, 7, 3, 3).fillRect(20, 7, 3, 3);
      g.fillStyle(0xff7a59).fillRect(14, 11, 6, 2);
    });

    this.drawTexture("player-dad", 32, 44, (g) => {
      g.fillStyle(0xf2c08b).fillRect(7, 2, 18, 14);
      g.fillStyle(0x1f2937).fillRect(7, 1, 18, 4).fillRect(10, 10, 12, 3);
      g.fillStyle(0x22c55e).fillRect(5, 16, 22, 18);
      g.fillStyle(0x334155).fillRect(7, 34, 7, 8).fillRect(19, 34, 7, 8);
      g.fillStyle(0x111827).fillRect(11, 7, 3, 3).fillRect(20, 7, 3, 3);
    });

    this.drawTexture("player-mom", 32, 44, (g) => {
      g.fillStyle(0xf4b5a4).fillRect(8, 3, 16, 14);
      g.fillStyle(0x704214).fillRect(6, 0, 20, 7).fillRect(5, 7, 4, 13).fillRect(23, 7, 4, 13);
      g.fillStyle(0xec4899).fillRect(5, 17, 22, 18);
      g.fillStyle(0x334155).fillRect(7, 35, 7, 7).fillRect(19, 35, 7, 7);
      g.fillStyle(0x111827).fillRect(11, 8, 3, 3).fillRect(20, 8, 3, 3);
    });

    this.drawTexture("coin", 22, 22, (g) => {
      g.fillStyle(COLORS.coin).fillCircle(11, 11, 10);
      g.fillStyle(0xfff3a3).fillRect(9, 4, 4, 14);
      g.lineStyle(2, 0xc8901c).strokeCircle(11, 11, 9);
    });

    this.drawTexture("question-block", 36, 36, (g) => {
      g.fillStyle(COLORS.question).fillRect(0, 0, 36, 36);
      g.fillStyle(0xffdf70).fillRect(4, 4, 28, 5);
      g.fillStyle(0x7c4a12).fillRect(6, 6, 4, 4).fillRect(26, 6, 4, 4).fillRect(6, 26, 4, 4).fillRect(26, 26, 4, 4);
      g.fillStyle(0xffffff).fillRect(16, 8, 5, 5).fillRect(21, 13, 5, 5).fillRect(16, 18, 5, 4).fillRect(16, 27, 5, 4);
    });

    this.drawTexture("coin-brick", 36, 36, (g) => {
      g.fillStyle(COLORS.brick).fillRect(0, 0, 36, 36);
      g.lineStyle(2, 0x6f3828);
      g.strokeRect(0, 0, 36, 36);
      g.lineBetween(0, 18, 36, 18).lineBetween(18, 0, 18, 18).lineBetween(9, 18, 9, 36).lineBetween(27, 18, 27, 36);
      g.fillStyle(COLORS.coin).fillCircle(18, 18, 7);
    });

    this.drawTexture("used-block", 36, 36, (g) => {
      g.fillStyle(COLORS.used).fillRect(0, 0, 36, 36);
      g.fillStyle(0xb8bdc7).fillRect(5, 5, 26, 4);
      g.lineStyle(2, 0x626873).strokeRect(0, 0, 36, 36);
    });

    this.drawTexture("item-broccoli", 28, 28, (g) => {
      g.fillStyle(0x318a45).fillCircle(10, 9, 7).fillCircle(17, 8, 8).fillCircle(20, 14, 6);
      g.fillStyle(0x78b159).fillRect(12, 14, 6, 12);
      g.fillStyle(0x246b35).fillRect(10, 22, 10, 4);
    });

    this.drawTexture("item-flower", 30, 30, (g) => {
      g.fillStyle(0xf472b6).fillCircle(15, 7, 6).fillCircle(8, 15, 6).fillCircle(22, 15, 6).fillCircle(15, 22, 6);
      g.fillStyle(0xfff6a3).fillCircle(15, 15, 6);
      g.fillStyle(0x34a853).fillRect(14, 22, 3, 7);
    });

    this.drawTexture("enemy-turtle", 36, 30, (g) => {
      g.fillStyle(0x2faa4a).fillEllipse(18, 16, 28, 20);
      g.fillStyle(0xf7d08a).fillRect(25, 12, 8, 8).fillRect(8, 24, 6, 5).fillRect(23, 24, 6, 5);
      g.fillStyle(0x14532d).fillRect(10, 10, 16, 4).fillRect(12, 15, 12, 3);
      g.fillStyle(0x111827).fillRect(29, 14, 2, 2);
    });

    this.drawTexture("enemy-chestnut", 34, 32, (g) => {
      g.fillStyle(0x8b5e34).fillTriangle(17, 0, 3, 25, 31, 25);
      g.fillStyle(0xb87945).fillEllipse(17, 21, 28, 17);
      g.fillStyle(0x111827).fillRect(11, 18, 3, 3).fillRect(21, 18, 3, 3);
      g.fillStyle(0xf8d8b0).fillRect(13, 25, 8, 3);
    });

    this.drawTexture("pipe", 96, 92, (g) => {
      g.fillStyle(COLORS.pipeDark).fillRect(16, 28, 64, 64);
      g.fillStyle(COLORS.pipe).fillRect(22, 28, 46, 64);
      g.fillStyle(0x61d981).fillRect(8, 0, 80, 32);
      g.fillStyle(0x9cf0b2).fillRect(16, 6, 54, 8);
      g.lineStyle(4, COLORS.pipeDark).strokeRect(8, 0, 80, 32).strokeRect(16, 28, 64, 64);
    });

    this.drawTexture("cloud", 150, 58, (g) => {
      g.fillStyle(0xffffff, 0.86).fillCircle(34, 34, 22).fillCircle(66, 22, 26).fillCircle(100, 34, 22).fillRoundedRect(28, 28, 88, 24, 10);
    });

    this.drawTexture("hill", 210, 92, (g) => {
      g.fillStyle(COLORS.hill, 0.7).fillEllipse(105, 92, 210, 150);
      g.fillStyle(0x9ee493, 0.7).fillCircle(74, 42, 8).fillCircle(132, 52, 7);
    });

    this.drawTexture("cave-gem", 28, 42, (g) => {
      g.fillStyle(0x7dd3fc, 0.72).fillTriangle(14, 0, 28, 18, 14, 42).fillTriangle(14, 0, 0, 18, 14, 42);
      g.fillStyle(0xe0f2fe, 0.75).fillTriangle(14, 4, 21, 18, 14, 34);
    });
  }

  private drawTexture(
    key: string,
    width: number,
    height: number,
    draw: (graphics: Phaser.GameObjects.Graphics) => void
  ): void {
    const graphics = this.add.graphics();
    draw(graphics);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }
}

declare global {
  interface Window {
    __SJ_GAME_STATE__?: {
      stageKey: string;
      stageLabel: string;
      stageIndex: number;
      targetSeconds: number;
      worldWidth: number;
      gameStarted: boolean;
      transitioning: boolean;
      cleared: boolean;
      coinCount: number;
      playerForm: string;
      activeKid: string;
      playerScale: number;
      playerX: number;
      hasPipe: boolean;
    };
  }
}
