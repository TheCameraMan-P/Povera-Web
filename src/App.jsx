import { useRef, useState, useEffect } from "react";

const WIDTH = 1280;
const HEIGHT = 720;

export default function App() {
  const canvasRef = useRef(null);
  const layerCanvasesRef = useRef([]);
  const undoRef = useRef([[], []]);
  const redoRef = useRef([[], []]);
  const MAX_HISTORY = 12;

  const [activeLayer, setActiveLayer] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [saved, setSaved] = useState(true);

  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(4);
  const [tool, setTool] = useState("brush");
  const [layerVisible, setLayerVisible] = useState([true, true]);
  const [cursor, setCursor] = useState({
    x: 0,
    y: 0,
    visible: false,
  });

  const saveProject = () => {
    const data = layerCanvasesRef.current.map((c) =>
      c.toDataURL()
    );

    const blob = new Blob([JSON.stringify({ layers: data })], {
      type: "application/json",
    });

    const link = document.createElement("a");
    link.download = "project.povera";
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  const loadProject = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      const json = JSON.parse(reader.result);

      json.layers.forEach((dataUrl, i) => {
        const img = new Image();
        img.onload = () => {
          const ctx = layerCanvasesRef.current[i].getContext("2d");
          ctx.clearRect(0, 0, WIDTH, HEIGHT);
          ctx.drawImage(img, 0, 0);
          redraw();
        };
        img.src = dataUrl;
      });
    };

    reader.readAsText(file);
  };
  
  const saveToBrowser = () => {
    const data = layerCanvasesRef.current.map((c) => c.toDataURL());
    localStorage.setItem("povera-autosave", JSON.stringify({ layers: data }));

    setSaved(true);
  };

  const loadFromBrowser = () => {
    const saved = localStorage.getItem("povera-autosave");
    if (!saved) return;

    const json = JSON.parse(saved);

    json.layers.forEach((dataUrl, i) => {
      const img = new Image();

      img.onload = () => {
        const ctx = layerCanvasesRef.current[i].getContext("2d");
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        ctx.drawImage(img, 0, 0);
        redraw();
      };

      img.src = dataUrl;
    });
  };

  const resetBrowserSave = () => {
    localStorage.removeItem("povera-autosave");
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const getTouchDistance = (t1, t2) => {
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return Math.hypot(dx, dy);
  };

  const getTouchAngle = (t1, t2) => {
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  };

  const getTouchCenter = (t1, t2) => ({
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  });

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
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
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && gestureRef.current) {
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
    }
  };

  const handleTouchEnd = () => {
    gestureRef.current = null;
  };

  const [view, setView] = useState({
    scale: 1,
    rotation: 0,
    x: 0,
    y: 0,
  });

  const gestureRef = useRef(null);

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
    const ctx = canvasRef.current.getContext("2d");

    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

   layerCanvasesRef.current.forEach((c, i) => {
      if (layerVisible[i]) {
        ctx.drawImage(c, 0, 0);
      }
    });
  };

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

  // TOOL SYSTEM
  const tools = {
    brush: {
      down(ctx, x, y) {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(x, y);
      },
      move(ctx, x, y) {
        ctx.lineTo(x, y);
        ctx.stroke();
      },
      up(ctx) {
        ctx.closePath();
      },
    },

    eraser: {
      down(ctx, x, y) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = size;
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
  };

  const clearLayer = () => {
    snapshotLayer();

    const ctx = layerCanvasesRef.current[activeLayer].getContext("2d");
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

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

  const startDraw = (e) => {
    snapshotLayer();
    setIsDrawing(true);
    

    const { x, y } = getPoint(e);
    const ctx = layerCanvasesRef.current[activeLayer].getContext("2d");

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    tools[tool].down(ctx, x, y);
  };

  const draw = (e) => {
    if (!isDrawing) return;

    const { x, y } = getPoint(e);
    const ctx = layerCanvasesRef.current[activeLayer].getContext("2d");

    tools[tool].move(ctx, x, y);
    redraw();
  };

  const endDraw = () => {
    if (!isDrawing) return;

    setIsDrawing(false);

    const ctx = layerCanvasesRef.current[activeLayer].getContext("2d");
    tools[tool].up(ctx);

    redraw();
    saveToBrowser();
  };

  const exportPNG = () => {
    redraw();

    canvasRef.current.toBlob((blob) => {
      const link = document.createElement("a");
      link.download = "povera.png";
      link.href = URL.createObjectURL(blob);
      link.click();
    });
  };

  return (
    <div className="app">

      <div className="toolbar">
        <span className="title">Povera Illustrator</span>

        <span className="save-status">
          {saved ? "Saved" : "Unsaved"}
        </span>

        <button onClick={saveToBrowser}>Browser Save</button>
        <button onClick={loadFromBrowser}>Browser Load</button>
        <button onClick={resetBrowserSave}>Forget Save</button>

        <button onClick={saveProject}>Save</button>

        <label className="file-load">
          Load
          <input type="file" accept=".povera,application/json" onChange={loadProject} />
        </label>

        <button onClick={exportPNG}>Export</button>
        <button onClick={toggleFullscreen}>Fullscreen</button>
      </div>

      {/* TOOLS PANEL */}
      {showTools && (
        <div className="panel left">
          <div className="panel-header" onClick={() => setShowTools(!showTools)}>
            Tools
          </div>

          <button className={tool==="brush"?"active":""} onClick={()=>setTool("brush")}>Brush</button>
          <button className={tool==="eraser"?"active":""} onClick={()=>setTool("eraser")}>Eraser</button>

          <div className="panel-divider" />

          <button onClick={undo}>Undo</button>
          <button onClick={redo}>Redo</button>

        </div>
      )}

      {/* SETTINGS PANEL */}
      {showSettings && (
        <div className="panel right">
          <div className="panel-header" onClick={() => setShowSettings(!showSettings)}>
            Settings
          </div>

          <label>Color</label>
          <div
            className="color-preview"
            style={{ background: color }}
          />
          <input type="color" value={color} onChange={(e)=>setColor(e.target.value)} />

          <label>Size</label>
          <input type="range" min="1" max="100" value={size} onChange={(e)=>setSize(e.target.value)} />
        </div>
      )}

      {/* LAYERS PANEL */}
      {showLayers && (
        <div className="panel bottom">
          <div className="panel-header" onClick={() => setShowLayers(!showLayers)}>
            Layers
          </div>

          <button className={activeLayer===0?"active":""} onClick={()=>setActiveLayer(0)}>Layer 1</button>
          <button className={activeLayer===1?"active":""} onClick={()=>setActiveLayer(1)}>Layer 2</button>
          <button onClick={clearLayer}>Clear</button>
        </div>
      )}

      {/* CANVAS */}
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
            onMouseDown={startDraw}
            onMouseMove={(e) => {
              updateCursor(e);
              draw(e);
            }}
            onMouseUp={endDraw}
            onMouseLeave={() => {
              setCursor((c) => ({ ...c, visible: false }));
              endDraw();
            }}
          />

          {cursor.visible && (
            <div
              className="brush-cursor"
              style={{
                left: cursor.x,
                top: cursor.y,
                width: size / 2,
                height: size / 2,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}