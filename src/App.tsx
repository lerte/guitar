import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hand } from "lucide-react";
import { BootOverlay, LoadingPill, TrackingErrorPanel } from "@/components/boot-overlay";
import { CameraStage } from "@/components/camera-stage";
import { ChordDisplay, type PickPulse, type StrumPulse } from "@/components/hud/chord-display";
import { ControlPanel } from "@/components/hud/control-panel";
import { GestureGuide } from "@/components/hud/gesture-guide";
import { HandReadouts } from "@/components/hud/hand-readouts";
import { CapoControl } from "@/components/hud/capo-control";
import { KeyControl } from "@/components/hud/key-control";
import { PlayModeSwitch } from "@/components/hud/play-mode-switch";
import { TopBar } from "@/components/hud/top-bar";
import { StartScreen } from "@/components/start-screen";
import { useHandTracking } from "@/hooks/use-hand-tracking";
import { ArpeggioPlayer } from "@/lib/guitar/arpeggio";
import { GuitarEngine, type StrumDirection } from "@/lib/guitar/audio-engine";
import type { PlayMode } from "@/lib/hands/gesture-controller";
import {
  CAPO_RANGE,
  EXTENSION_IDS,
  keyScale,
  MODE_IDS,
  type ChordExtension,
  type ChordId,
  type ModeId,
} from "@/lib/guitar/chords";
import {
  assignGesture,
  EMPTY_GESTURE_MAP,
  loadGestureMap,
  saveGestureMap,
  type GestureMap,
} from "@/lib/guitar/gesture-map";
import { DEFAULT_FEEL, loadFeel, saveFeel, type FeelTuning } from "@/lib/hands/feel";

type Phase = "idle" | "starting" | "live" | "error";

type KeyState = { root: number; mode: ModeId; extension: ChordExtension };

const KEY_STORAGE = "air-guitar:key";

/** 调式 + 和弦色彩 survives reloads: they define the whole chord set. */
function loadKey(): KeyState {
  try {
    const raw = localStorage.getItem(KEY_STORAGE);
    if (raw) {
      const [root, mode, extension] = raw.split(":");
      const pc = Number.parseInt(root ?? "", 10);
      if (!Number.isNaN(pc) && MODE_IDS.includes(mode as ModeId)) {
        return {
          root: ((pc % 12) + 12) % 12,
          mode: mode as ModeId,
          extension: EXTENSION_IDS.includes(extension as ChordExtension)
            ? (extension as ChordExtension)
            : "triad",
        };
      }
    }
  } catch {
    /* storage can be blocked */
  }
  return { root: 0, mode: "ionian", extension: "triad" };
}

function saveKey(root: number, mode: ModeId, extension: ChordExtension) {
  try {
    localStorage.setItem(KEY_STORAGE, `${root}:${mode}:${extension}`);
  } catch {
    /* ignore */
  }
}

function describeCameraError(cause: unknown) {
  if (cause instanceof DOMException) {
    switch (cause.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "摄像头权限被拒绝。请在浏览器地址栏的站点设置里允许摄像头，然后重试。";
      case "NotFoundError":
      case "OverconstrainedError":
        return "没有找到可用的摄像头设备。";
      case "NotReadableError":
        return "摄像头被其他程序占用（例如会议软件），请关闭后重试。";
      default:
        return cause.message || "无法访问摄像头。";
    }
  }
  return cause instanceof Error ? cause.message : String(cause);
}

function KeyboardBackdrop() {
  return (
    <div className="absolute inset-0" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(110%_80%_at_50%_0%,#131a2c,#070a11_60%,#04060a)]" />
      <div className="absolute inset-0 opacity-60 [background-image:repeating-linear-gradient(to_bottom,transparent_0px,transparent_59px,rgba(255,255,255,0.05)_60px,transparent_61px)] [mask-image:radial-gradient(70%_70%_at_50%_50%,black,transparent)]" />
    </div>
  );
}

export default function App() {
  const [key, setKey] = useState<KeyState>(() => loadKey());
  const scale = useMemo(
    () => keyScale(key.root, key.mode, key.extension),
    [key.root, key.mode, key.extension],
  );
  const chords = scale.chords;
  const [gestures, setGestures] = useState<GestureMap>(() => loadGestureMap());

  /**
   * Chords the engine should keep warm: the key's seven plus every chord a
   * gesture is pinned to, so the first strum after assigning one is not cold.
   */
  const chordSet = useMemo(() => {
    const custom = Object.values(gestures).filter((value): value is ChordId => value !== null);
    if (custom.length === 0) return chords;
    return [...new Set([...chords, ...custom])];
  }, [chords, gestures]);

  /** Chords pinned by a gesture; a key change must never transpose them. */
  const pinnedChords = useMemo(() => {
    const pinned = new Set<ChordId>();
    for (const value of Object.values(gestures)) if (value) pinned.add(value);
    return pinned;
  }, [gestures]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GuitarEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chordRef = useRef<ChordId>(chords[0]);
  const chordsRef = useRef<ChordId[]>(chords);
  const mutedRef = useRef(false);
  const volumeRef = useRef(0.85);
  const reverbRef = useRef(0.28);
  const pulseIdRef = useRef(0);
  const startingRef = useRef(false);
  const arpeggioRef = useRef<ArpeggioPlayer | null>(null);
  const pickPulseIdRef = useRef(0);
  const capoRef = useRef(0);

  chordsRef.current = chordSet;

  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [chord, setChord] = useState<ChordId>(chords[0]);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [reverb, setReverb] = useState(0.28);
  const [audioReady, setAudioReady] = useState(false);
  const [swapHands, setSwapHands] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showGuide, setShowGuide] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [pulse, setPulse] = useState<StrumPulse | null>(null);
  const [playMode, setPlayMode] = useState<PlayMode>("strum");
  const [pickPulse, setPickPulse] = useState<PickPulse | null>(null);
  const [autoArp, setAutoArp] = useState(false);
  const [arpBpm, setArpBpm] = useState(84);
  const [arpPattern, setArpPattern] = useState(0);
  const [capo, setCapo] = useState(0);
  const [feel, setFeel] = useState<FeelTuning>(() => loadFeel());

  useEffect(() => {
    volumeRef.current = volume;
    engineRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    reverbRef.current = reverb;
    engineRef.current?.setReverb(reverb);
  }, [reverb]);

  useEffect(() => {
    capoRef.current = capo;
    engineRef.current?.setCapo(capo);
  }, [capo]);

  useEffect(() => {
    saveFeel(feel);
  }, [feel]);

  useEffect(() => {
    saveGestureMap(gestures);
  }, [gestures]);

  useEffect(() => {
    saveKey(key.root, key.mode, key.extension);
    engineRef.current?.setChordSet(chordSet);
  }, [key.root, key.mode, key.extension, chordSet]);

  /**
   * Changing key keeps the *degree*: the shape held by the left hand (or the
   * chord chosen with 1–7) is transposed into the new key instead of being
   * dropped. `chords` has no duplicate labels within a key, so the index of the
   * old label is exactly the degree. Chords pinned to a gesture are skipped —
   * they are fixed, the controller keeps sounding them as they are.
   */
  const previousChordsRef = useRef(chords);
  useEffect(() => {
    const previous = previousChordsRef.current;
    previousChordsRef.current = chords;
    if (previous === chords) return;
    if (pinnedChords.has(chordRef.current)) return;
    const degree = previous.indexOf(chordRef.current);
    if (degree < 0) return;
    chordRef.current = chords[degree];
    setChord(chords[degree]);
  }, [chords, pinnedChords]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const unlock = () => void engineRef.current?.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void engineRef.current?.dispose();
    };
  }, []);

  const ensureEngine = useCallback(async () => {
    let engine = engineRef.current;
    if (!engine) {
      engine = new GuitarEngine();
      engineRef.current = engine;
    }
    await engine.init();
    engine.setVolume(volumeRef.current);
    engine.setReverb(reverbRef.current);
    engine.setMuted(mutedRef.current);
    engine.setCapo(capoRef.current);
    engine.setChordSet(chordsRef.current);
    setAudioReady(true);
    return engine;
  }, []);

  const handleChord = useCallback((next: ChordId | null) => {
    if (next === null) {
      mutedRef.current = true;
      setMuted(true);
      engineRef.current?.setMuted(true);
      return;
    }
    chordRef.current = next;
    mutedRef.current = false;
    setChord(next);
    setMuted(false);
    engineRef.current?.setMuted(false);
  }, []);

  const handleStrum = useCallback((event: { direction: StrumDirection; velocity: number }) => {
    engineRef.current?.strum(chordRef.current, event.direction, event.velocity);
    pulseIdRef.current += 1;
    setPulse({
      direction: event.direction,
      velocity: event.velocity,
      at: performance.now(),
      id: pulseIdRef.current,
    });
  }, []);

  const handlePluck = useCallback((event: { stringIndex: number; velocity: number }) => {
    engineRef.current?.pluck(chordRef.current, event.stringIndex, event.velocity);
    pickPulseIdRef.current += 1;
    setPickPulse({
      stringIndex: event.stringIndex,
      at: performance.now(),
      id: pickPulseIdRef.current,
    });
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!autoArp || !engine || phase !== "live") {
      arpeggioRef.current?.stop();
      return;
    }
    let player = arpeggioRef.current;
    if (!player) {
      player = new ArpeggioPlayer(engine, () => (mutedRef.current ? null : chordRef.current));
      arpeggioRef.current = player;
    }
    player.bpm = arpBpm;
    player.patternIndex = arpPattern;
    player.start();
    return () => {
      player?.stop();
    };
  }, [autoArp, arpBpm, arpPattern, phase]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      }
    } catch {
      /* fullscreen is a nice-to-have */
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setError(null);
    setPhase("starting");
    setStage("启动音频引擎");
    try {
      await ensureEngine();
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("当前浏览器环境不支持摄像头（需要 https 或 localhost）。");
      }
      setStage("等待摄像头授权");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("视频元素尚未就绪，请重试。");
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setKeyboardMode(false);
      setPhase("live");
      void toggleFullscreen();
    } catch (cause) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError(describeCameraError(cause));
      setPhase("error");
    } finally {
      startingRef.current = false;
    }
  }, [ensureEngine, toggleFullscreen]);

  const startKeyboard = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setError(null);
    setPhase("starting");
    setStage("启动音频引擎");
    try {
      await ensureEngine();
      setKeyboardMode(true);
      setPhase("live");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase("error");
    } finally {
      startingRef.current = false;
    }
  }, [ensureEngine]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setKeyboardMode(false);
    setPhase("idle");
    arpeggioRef.current?.stop();
    setAutoArp(false);
    mutedRef.current = false;
    setMuted(false);
    engineRef.current?.setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    engineRef.current?.setMuted(next);
    if (!next) setChord(chordRef.current);
    setPulse(null);
  }, []);

  const pickChord = useCallback(
    (next: ChordId, play: boolean) => {
      chordRef.current = next;
      mutedRef.current = false;
      engineRef.current?.setMuted(false);
      setChord(next);
      setMuted(false);
      if (play) {
        engineRef.current?.strum(next, "down", 0.85);
        pulseIdRef.current += 1;
        setPulse({ direction: "down", velocity: 0.85, at: performance.now(), id: pulseIdRef.current });
      }
    },
    [],
  );

  const strumNow = useCallback((direction: StrumDirection) => {
    handleStrum({ direction, velocity: 0.85 });
  }, [handleStrum]);

  const assignGestureChord = useCallback(
    (pattern: string, value: ChordId | null | undefined) => {
      setGestures((current) => assignGesture(current, pattern, value));
    },
    [],
  );

  /** 手势映射的试听：只发声，不改变当前选中的和弦。 */
  const previewChord = useCallback((next: ChordId) => {
    engineRef.current?.playChord(next, 0.8);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (phase !== "live") return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      switch (event.key) {
        case " ":
        case "ArrowDown":
          event.preventDefault();
          strumNow("down");
          break;
        case "ArrowUp":
          event.preventDefault();
          strumNow("up");
          break;
        case "m":
        case "M":
          toggleMute();
          break;
        case "f":
        case "F":
          void toggleFullscreen();
          break;
        case "h":
        case "H":
          setShowGuide((value) => !value);
          break;
        case "s":
        case "S":
          setShowSkeleton((value) => !value);
          break;
        case "v":
        case "V":
          setPlayMode((current) => (current === "strum" ? "pick" : "strum"));
          break;
        case "a":
        case "A":
          setAutoArp((value) => !value);
          break;
        case "[":
          setArpBpm((value) => Math.max(50, value - 4));
          break;
        case "]":
          setArpBpm((value) => Math.min(160, value + 4));
          break;
        case "-":
          setCapo((value) => Math.max(0, value - 1));
          break;
        case "=":
        case "+":
          setCapo((value) => Math.min(CAPO_RANGE, value + 1));
          break;
        default: {
          const index = Number.parseInt(event.key, 10);
          if (!Number.isNaN(index) && index >= 1 && index <= chords.length) {
            pickChord(chords[index - 1], keyboardMode);
          }
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chords, keyboardMode, phase, pickChord, strumNow, toggleFullscreen, toggleMute]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("swap") === "1") setSwapHands(true);
    if (params.get("mode") === "pick") setPlayMode("pick");
    const capoParam = Number.parseInt(params.get("capo") ?? "", 10);
    if (!Number.isNaN(capoParam)) setCapo(Math.max(0, Math.min(CAPO_RANGE, capoParam)));
    if (params.get("arp") === "1") setAutoArp(true);
    const keyParam = Number.parseInt(params.get("key") ?? "", 10);
    const scaleParam = params.get("scale");
    if (!Number.isNaN(keyParam) || (scaleParam && MODE_IDS.includes(scaleParam as ModeId))) {
      setKey((current) => ({
        root: Number.isNaN(keyParam) ? current.root : ((keyParam % 12) + 12) % 12,
        mode: scaleParam && MODE_IDS.includes(scaleParam as ModeId) ? (scaleParam as ModeId) : current.mode,
        extension: current.extension,
      }));
    }
    if (params.get("autostart") === "1") void startCamera();
    if (params.get("keyboard") === "1") void startKeyboard();
  }, [startCamera, startKeyboard]);

  const tracking = useHandTracking({
    videoRef,
    canvasRef,
    active: phase === "live" && !keyboardMode,
    swapHands,
    showSkeleton,
    mode: playMode,
    feel,
    chords,
    gestures,
    onChord: handleChord,
    onStrum: handleStrum,
    onPluck: handlePluck,
  });

  const { snapshot } = tracking;
  const live = phase === "live";
  const cameraVisible = live && !keyboardMode;
  const displayChord = muted ? null : chord;
  const degree = displayChord
    ? (scale.degrees.find((entry) => entry.chord === displayChord)?.roman ?? null)
    : null;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#05070c] text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,#0f1524,#05070c_60%)]" />

      <CameraStage videoRef={videoRef} canvasRef={canvasRef} visible={cameraVisible} />
      {keyboardMode && <KeyboardBackdrop />}

      <div className="stage-vignette pointer-events-none absolute inset-0" />
      <div className="film-grain pointer-events-none absolute inset-0" />

      <TopBar
        live={live}
        keyboardMode={keyboardMode}
        handCount={keyboardMode ? 0 : snapshot.handCount}
        fps={keyboardMode ? 0 : snapshot.fps}
        audioReady={audioReady}
        fullscreen={fullscreen}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((value) => !value)}
        onToggleFullscreen={() => void toggleFullscreen()}
        onStop={stopCamera}
      />

      {(phase === "idle" || phase === "error") && (
        <StartScreen
          error={error}
          busy={false}
          onStartCamera={() => void startCamera()}
          onStartKeyboard={() => void startKeyboard()}
        />
      )}

      {phase === "starting" && <BootOverlay label={stage} />}

      {live && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center px-4">
            {!keyboardMode && tracking.status === "loading" && (
              <LoadingPill label={tracking.stage || "加载手部模型…"} />
            )}
            {!keyboardMode && tracking.status === "running" && snapshot.handCount === 0 && (
              <div className="hud-panel animate-rise flex items-center gap-2 rounded-full px-4 py-2 text-[11px] text-white/65">
                <Hand className="size-3.5 text-primary" />
                举起双手：左手比手型选和弦，右手
                {playMode === "pick" ? "上下移动选弦、捏合拨弦" : "握拳下扫、展开上扫"}
              </div>
            )}
          </div>

          {keyboardMode && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="text-center">
                <div className="text-[10px] tracking-[0.32em] text-white/30">KEYBOARD MODE</div>
                <div className="chord-glyph mt-2 text-6xl font-semibold text-white/15">
                  {muted ? "切音" : chord}
                </div>
                <div className="mt-3 text-[11px] text-white/35">
                  按 1–7 选择音级 · 空格下扫 · ↑ 上扫 · M 切音
                </div>
              </div>
            </div>
          )}

          <HandReadouts
            chord={displayChord}
            muted={muted}
            fingers={snapshot.fingers}
            leftPresent={Boolean(snapshot.left)}
            rightPresent={!keyboardMode && Boolean(snapshot.right)}
            playMode={playMode}
            targetString={snapshot.targetString}
            engaging={snapshot.engaging}
            grabbing={snapshot.grabbing}
            capo={capo}
            keyboardMode={keyboardMode}
          />

          {tracking.status === "error" && tracking.error && (
            <TrackingErrorPanel message={tracking.error} onRetry={tracking.retry} />
          )}

          <ControlPanel
            open={settingsOpen}
            live={live}
            muted={muted}
            volume={volume}
            reverb={reverb}
            swapHands={swapHands}
            showSkeleton={showSkeleton}
            showGuide={showGuide}
            onVolume={setVolume}
            onReverb={setReverb}
            onSwapHands={setSwapHands}
            onShowSkeleton={setShowSkeleton}
            onShowGuide={setShowGuide}
            onToggleMute={toggleMute}
            onStop={stopCamera}
            autoArp={autoArp}
            arpBpm={arpBpm}
            arpPattern={arpPattern}
            feel={feel}
            chords={chords}
            degrees={scale.degrees}
            gestures={gestures}
            onAssignGesture={assignGestureChord}
            onResetGestures={() => setGestures(EMPTY_GESTURE_MAP)}
            onPreviewChord={previewChord}
            onFeelChange={setFeel}
            onResetFeel={() => setFeel(DEFAULT_FEEL)}
            onAutoArp={setAutoArp}
            onArpBpm={setArpBpm}
            onArpPattern={setArpPattern}
          />

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-4 p-4 sm:p-6">
            {showGuide && (
              <GestureGuide
                activeChord={displayChord}
                chords={chords}
                degrees={scale.degrees}
                keyName={scale.label}
                gestures={gestures}
                playMode={playMode}
                className="hidden max-w-[26rem] lg:block"
              />
            )}
            <div className="ml-auto flex flex-col items-end gap-2">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <KeyControl
                  tonicPc={key.root}
                  modeId={key.mode}
                  extension={key.extension}
                  onChange={(root, mode, extension) => setKey({ root, mode, extension })}
                />
                <CapoControl value={capo} onChange={setCapo} />
                <PlayModeSwitch value={playMode} onChange={setPlayMode} />
              </div>
              <ChordDisplay
                chord={displayChord}
                muted={muted}
                fingers={snapshot.fingers}
                grabbing={snapshot.grabbing}
                engaging={snapshot.engaging}
                hands={keyboardMode ? 0 : snapshot.handCount}
                pulse={pulse}
                playMode={playMode}
                targetString={snapshot.targetString}
                pluck={pickPulse}
                capo={capo}
                degree={degree}
                mode={keyboardMode ? "keyboard" : "camera"}
              />
            </div>
          </div>
        </>
      )}
    </main>
  );
}
