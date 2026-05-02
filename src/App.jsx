import { useRef, useState, useEffect } from "react";

const WIDTH = 1280;
const HEIGHT = 720;
const MAX_HISTORY = 12;

export default function App() {
  const canvasRef = useRef(null);
  const layerCanvasesRef = useRef([]);
  const undoRef = useRef([[], []]);
  const redoRef = useRef([[], []]);
  const gestureRef = useRef(null);
  const gestureActiveRef = useRef(false);
  const lastPointRef = useRef(null);

  const [activeLayer, setActiveLayer] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [saved, setSaved] = useState(true);

  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(4);
  const [tool, setTool] = useState("brush");
  const [layerVisible, setLayerVisible] = useState([true, true]);

  const [cursor, setCursor] = useState({ x: 0, y: 0, visible: false });

  const [view, setView] = useState({
    scale: 1,
    rotation: 0,
    x: 0,
    y: 0,
  });

  const [showTools, setShowTools] = useState(true);
  const [showSettings, setShowSettings] = useState(true);
  const [showLayers, setShowLayers] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    layerCanvasesRef.current = [0, 1].map(() => {
      const c = document.createElement("canvas");
      c.width = WIDTH;
      c.height = HEIGHT;
      return c;
    });

    redraw();
    setTimeout(loadFromBrowser, 50);
  }, []);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    layerCanvasesRef.current.forEach((c, i) => {
      if (layerVisible[i]) ctx.drawImage(c, 0, 0);
    });
  };

  useEffect(() => {
    redraw();
  }, [layerVisible]);

  const getPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();

    return {
      x: ((e.clientX - rect.left) / rect.width) * WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * HEIGHT,
    };
  };

  const updateCursor = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();

    setCursor({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      visible: true,
    });
  };

  const saveToBrowser = () => {
    const data = layerCanvasesRef.current.map((c) => c.toDataURL());

    localStorage.setItem(
      "povera-autosave",
      JSON.stringify({
        width: WIDTH,
        height: HEIGHT,
        layers: data,
      })
    );

    setSaved(true);
  };

  const loadFromBrowser = () => {
    const savedData = localStorage.getItem("povera-autosave");
    if (!savedData || layerCanvasesRef.current.length === 0) return;

    const json = JSON.parse(savedData);

    json.layers.forEach((dataUrl, i) => {
      if (!layerCanvasesRef.current[i]) return;

      const img = new Image();
      img.onload = () => {
        const ctx = layerCanvasesRef.current[i].getContext("2d");
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        ctx.drawImage(img, 0, 0, WIDTH, HEIGHT);
        redraw();
      };
      img.src = dataUrl;
    });

    setSaved(true);
  };

  const resetBrowserSave = () => {
    localStorage.removeItem("povera-autosave");
  };

  const saveProject = () => {
    const data = layerCanvasesRef.current.map((c) => c.toDataURL());

    const blob = new Blob(
      [
        JSON.stringify({
          width: WIDTH,
          height: HEIGHT,
          layers: data,
        }),
      ],
      { type: "application/json" }
    );

    const link = document.createElement("a");
    link.download = "project.povera";
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const loadProject = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      const json = JSON.parse(reader.result);

      json.layers.forEach((dataUrl, i) => {
        if (!layerCanvasesRef.current[i]) return;

        const img = new Image();
        img.onload = () => {
          const ctx = layerCanvasesRef.current[i].getContext("2d");
          ctx.clearRect(0, 0, WIDTH, HEIGHT);
          ctx.drawImage(img, 0, 0, WIDTH, HEIGHT);
          redraw();
          saveToBrowser();
        };
        img.src = dataUrl;
      });

      setSaved(true);
    };

    reader.readAsText(file);
    e.target.value = "";
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  const snapshotLayer = () => {
    const layerCanvas = layerCanvasesRef.current[activeLayer];
    if (!layerCanvas) return;

    const ctx = layerCanvas.getContext("2d");
    const image = ctx.getImageData(0, 0, WIDTH, HEIGHT);

    undoRef.current[activeLayer].push(image);

    if (undoRef.current[activeLayer].length > MAX_HISTORY) {
      undoRef.current[activeLayer].shift();
    }

    redoRef.current[activeLayer] = [];
  };

  const restoreLayer = (imageData) => {
    const layerCanvas = layerCanvasesRef.current[activeLayer];
    if (!layerCanvas || !imageData) return;

    const ctx = layerCanvas.getContext("2d");
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.putImageData(imageData, 0, 0);

    redraw();
    saveToBrowser();
  };

  const undo = () => {
    const layerCanvas = layerCanvasesRef.current[activeLayer];
    const undoStack = undoRef.current[activeLayer];
    if (!layerCanvas || undoStack.length === 0) return;

    const ctx = layerCanvas.getContext("2d");
    const current = ctx.getImageData(0, 0, WIDTH, HEIGHT);

    redoRef.current[activeLayer].push(current);

    const previous = undoStack.pop();
    restoreLayer(previous);
  };

  const redo = () => {
    const layerCanvas = layerCanvasesRef.current[activeLayer];
    const redoStack = redoRef.current[activeLayer];
    if (!layerCanvas || redoStack.length === 0) return;

    const ctx = layerCanvas.getContext("2d");
    const current = ctx.getImageData(0, 0, WIDTH, HEIGHT);

    undoRef.current[activeLayer].push(current);

    const next = redoStack.pop();
    restoreLayer(next);
  };

  const clearLayer = () => {
    snapshotLayer();

    const ctx = layerCanvasesRef.current[activeLayer].getContext("2d");
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    redraw();
    saveToBrowser();
  };

  const newCanvas = () => {
    layerCanvasesRef.current.forEach((c) => {
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
    });

    undoRef.current = [[], []];
    redoRef.current = [[], []];

    redraw();
    saveToBrowser();
  };

  const tools = {
    brush: {
      down(ctx, x, y) {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = color;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        lastPointRef.current = { x, y };

        ctx.beginPath();
        ctx.moveTo(x, y);
      },

      move(ctx, x, y) {
        const last = lastPointRef.current;
        if (!last) return;

        const midX = (last.x + x) / 2;
        const midY = (last.y + y) / 2;

        ctx.quadraticCurveTo(last.x, last.y, midX, midY);
        ctx.stroke();

        lastPointRef.current = { x, y };
      },

      up(ctx) {
        ctx.closePath();
        lastPointRef.current = null;
      },
    },

    eraser: {
      down(ctx, x, y) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.moveTo(x, y);
      },
      move(ctx, x, y) {
        ctx.lineTo(x, y);
        ctx.stroke();
      },
      up(ctx) {
        ctx.closePath();
        ctx.globalCompositeOperation = "source-over";
      },
    },
  };

  const handlePointerDown = (e) => {
    if (gestureActiveRef.current) return;
    if (e.pointerType === "touch" && !e.isPrimary) return;

    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);

    snapshotLayer();
    setSaved(false);
    setIsDrawing(true);

    const { x, y } = getPoint(e);
    const ctx = layerCanvasesRef.current[activeLayer].getContext("2d");

    const pressure = e.pointerType === "pen" ? Math.max(e.pressure, 0.2) : 1;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = size * pressure;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    tools[tool].down(ctx, x, y);
  };

  const handlePointerMove = (e) => {
    updateCursor(e);
    if (gestureActiveRef.current) return;
    if (!isDrawing) return;

    e.preventDefault();

    const { x, y } = getPoint(e);
    const ctx = layerCanvasesRef.current[activeLayer].getContext("2d");

    const pressure = e.pointerType === "pen" ? Math.max(e.pressure, 0.2) : 1;
    ctx.lineWidth = size * pressure;

    tools[tool].move(ctx, x, y);
    redraw();
  };

  const handlePointerUp = (e) => {
    if (!isDrawing) return;

    setIsDrawing(false);

    const ctx = layerCanvasesRef.current[activeLayer].getContext("2d");
    tools[tool].up(ctx);

    redraw();
    saveToBrowser();

    canvasRef.current.releasePointerCapture?.(e.pointerId);
  };

  const getTouchAngle = (t1, t2) => {
    return Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180 / Math.PI;
  };

  const handleTouchStart = (e) => {
    if (e.touches.length !== 2) return;

    gestureActiveRef.current = true;
    setIsDrawing(false);
    e.preventDefault();

    const [t1, t2] = e.touches;

    gestureRef.current = {
      startDistance: getTouchDistance(t1, t2),
      startAngle: getTouchAngle(t1, t2),
      startCenter: getTouchCenter(t1, t2),
      startScale: view.scale,
      startRotation: view.rotation,
      startX: view.x,
      startY: view.y,
    };
  };

  const handleTouchMove = (e) => {
    if (e.touches.length !== 2 || !gestureRef.current) return;

    gestureActiveRef.current = true;
    e.preventDefault();

    const [t1, t2] = e.touches;
    const g = gestureRef.current;

    const newDistance = getTouchDistance(t1, t2);
    const newAngle = getTouchAngle(t1, t2);
    const newCenter = getTouchCenter(t1, t2);

    const scaleChange = newDistance / g.startDistance;
    const angleChange = newAngle - g.startAngle;

    setView({
      scale: Math.min(Math.max(g.startScale * scaleChange, 0.5), 4),
      rotation: g.startRotation + angleChange,
      x: g.startX + (newCenter.x - g.startCenter.x),
      y: g.startY + (newCenter.y - g.startCenter.y),
    });
  };

  const handleTouchEnd = () => {
    gestureRef.current = null;

    setTimeout(() => {
      gestureActiveRef.current = false;
    }, 100);
  };

  const getTouchDistance = (t1, t2) => {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  };

  const getTouchCenter = (t1, t2) => ({
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  });

  const exportPNG = () => {
    redraw();

    canvasRef.current.toBlob((blob) => {
      const link = document.createElement("a");
      link.download = "povera.png";
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    });
  };

  return (
    <div className="app">
      <div className="toolbar">
        <span className="title">Povera Illustrator</span>

        <span className="save-status">{saved ? "Saved" : "Unsaved"}</span>

        <button onClick={newCanvas}>New</button>
        <button onClick={saveToBrowser}>Browser Save</button>
        <button onClick={loadFromBrowser}>Browser Load</button>
        <button onClick={resetBrowserSave}>Forget Save</button>

        <button onClick={saveProject}>Save</button>

        <label className="file-load">
          Load
          <input
            type="file"
            accept=".povera,application/json"
            onChange={loadProject}
          />
        </label>

        <button onClick={exportPNG}>Export</button>
        <button onClick={toggleFullscreen}>Fullscreen</button>
      </div>

      {showTools && (
        <div className="panel left">
          <div className="panel-header" onClick={() => setShowTools(false)}>
            Tools
          </div>

          <button
            className={tool === "brush" ? "active" : ""}
            onClick={() => setTool("brush")}
          >
            Brush
          </button>

          <button
            className={tool === "eraser" ? "active" : ""}
            onClick={() => setTool("eraser")}
          >
            Eraser
          </button>

          <div className="panel-divider" />

          <button onClick={undo}>Undo</button>
          <button onClick={redo}>Redo</button>
        </div>
      )}

      {!showTools && (
        <button className="panel-tab left-tab" onClick={() => setShowTools(true)}>
          Tools
        </button>
      )}

      {showSettings && (
        <div className="panel right">
          <div className="panel-header" onClick={() => setShowSettings(false)}>
            Settings
          </div>

          <label>Color</label>
          <div className="color-preview" style={{ background: color }} />

          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />

          <label>Size: {size}</label>
          <input
            type="range"
            min="1"
            max="100"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </div>
      )}

      {!showSettings && (
        <button
          className="panel-tab right-tab"
          onClick={() => setShowSettings(true)}
        >
          Settings
        </button>
      )}

      {showLayers && (
        <div className="panel bottom">
          <div className="panel-header" onClick={() => setShowLayers(false)}>
            Layers
          </div>

          <button
            className={activeLayer === 0 ? "active" : ""}
            onClick={() => setActiveLayer(0)}
          >
            Layer 1
          </button>

          <button
            className={activeLayer === 1 ? "active" : ""}
            onClick={() => setActiveLayer(1)}
          >
            Layer 2
          </button>

          <button
            onClick={() =>
              setLayerVisible((v) => {
                const copy = [...v];
                copy[0] = !copy[0];
                return copy;
              })
            }
          >
            {layerVisible[0] ? "Hide L1" : "Show L1"}
          </button>

          <button
            onClick={() =>
              setLayerVisible((v) => {
                const copy = [...v];
                copy[1] = !copy[1];
                return copy;
              })
            }
          >
            {layerVisible[1] ? "Hide L2" : "Show L2"}
          </button>

          <button onClick={clearLayer}>Clear</button>
        </div>
      )}

      {!showLayers && (
        <button
          className="panel-tab bottom-tab"
          onClick={() => setShowLayers(true)}
        >
          Layers
        </button>
      )}

      <div
        className="canvas-container"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="canvas-wrap"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale}) rotate(${view.rotation}deg)`,
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={(e) => {
              setCursor((c) => ({ ...c, visible: false }));
              handlePointerUp(e);
            }}
          />

          {cursor.visible && (
            <div
              className="brush-cursor"
              style={{
                left: cursor.x,
                top: cursor.y,
                width: Math.max((size * view.scale) / 2, 4),
                height: Math.max((size * view.scale) / 2, 4),
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}