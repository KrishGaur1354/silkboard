import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Rect, Circle, Line, Text, Image, Group, Transformer } from 'react-konva';
import useImage from 'use-image';
import io from 'socket.io-client';
import { Button } from './components/ui/button';

import { 
  MousePointer2, 
  Pencil, 
  Square, 
  Circle as CircleIcon, 
  Diamond, 
  Type, 
  Link2, 
  Trash2, 
  Palette, 
  Eraser, 
  Upload, 
  Sun, 
  Moon 
} from 'lucide-react';

const socket = io('http://localhost:3001');

// Helper function to generate a random passcode (6 alphanumeric characters)
const generatePasscode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

const App = () => {
  // ===== Authentication / Session state =====
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [passcode, setPasscode] = useState('');
  const [isCreatingSession, setIsCreatingSession] = useState(true);

  // ===== Whiteboard state =====
  const [mode, setMode] = useState('select'); // 'select', 'pencil', 'connector'
  const [shapes, setShapes] = useState([]);
  const [color, setColor] = useState('#000000');
  const [selectedId, setSelectedId] = useState(null);
  const [connectorStartId, setConnectorStartId] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const stageRef = useRef(null);
  const fileInputRef = useRef(null);

  // ===== Presence state (cursor positions) =====
  const [userCursors, setUserCursors] = useState({});

  // ===== Dark Mode =====
  const [darkMode, setDarkMode] = useState(false);
  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  // ===== Chat state =====
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  // ===== Konva Transformer reference =====
  const transformerRef = useRef(null);

  // ===== Join session =====
  useEffect(() => {
    if (isLoggedIn) {
      socket.emit('join-session', { username, passcode });
    }
  }, [isLoggedIn, username, passcode]);

  // ===== Socket Listeners =====
  useEffect(() => {
    // Receive shapes updates
    socket.on('canvas-data', (data) => {
      if (data.userId !== socket.id) {
        setShapes(data.shapes);
      }
    });

    // Receive presence (cursor) updates
    socket.on('user-update', (data) => {
      setUserCursors((prev) => ({
        ...prev,
        [data.userId]: {
          username: data.username,
          x: data.x,
          y: data.y,
          isDrawing: data.isDrawing,
        },
      }));
    });

    // Remove disconnected users
    socket.on('user-disconnect', (userId) => {
      setUserCursors((prev) => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });
    });

    // Receive chat messages
    socket.on('chat-message', (msg) => {
      console.log(msg);
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.off('canvas-data');
      socket.off('user-update');
      socket.off('user-disconnect');
      socket.off('chat-message');
    };
  }, []);

  const emitCanvasData = (newShapes) => {
    socket.emit('canvas-data', { userId: socket.id, shapes: newShapes });
  };

  // Emit pointer updates on every mouse move
  const emitCursorUpdate = (pos, drawing) => {
    socket.emit('cursor-update', {
      userId: socket.id,
      username,
      x: pos.x,
      y: pos.y,
      isDrawing: drawing,
    });
  };

  // Send a chat message
  const sendChatMessage = () => {
    if (!chatInput.trim()) return;
    const msgData = {
      userId: socket.id,
      username,
      text: chatInput.trim(),
    };
    // Send to server
    socket.emit('chat-message', msgData);
    // Also add it to our own local messages
    setMessages((prev) => [...prev, msgData]);
    setChatInput('');
  };

  // ===== Pencil (free-drawing) handlers =====
  const handleMouseDown = () => {
    if (mode === 'pencil') {
      setIsDrawing(true);
      const pos = stageRef.current.getPointerPosition();
      const id = 'line-' + Date.now();
      const newLine = {
        id,
        type: 'line',
        points: [pos.x, pos.y],
        stroke: color,
        strokeWidth: 2,
      };
      const updated = [...shapes, newLine];
      setShapes(updated);
      emitCanvasData(updated);
      setSelectedId(id);
    }
  };

  const handleMouseMove = () => {
    if (!stageRef.current) return;
    const pos = stageRef.current.getPointerPosition();
    // Always emit the current cursor position
    emitCursorUpdate(pos, mode === 'pencil' && isDrawing);

    if (mode === 'pencil' && isDrawing && selectedId) {
      setShapes((prevShapes) =>
        prevShapes.map((shape) => {
          if (shape.id === selectedId && shape.type === 'line') {
            return {
              ...shape,
              points: [...shape.points, pos.x, pos.y],
            };
          }
          return shape;
        })
      );
    }
  };

  const handleMouseUp = () => {
    if (mode === 'pencil' && isDrawing) {
      setIsDrawing(false);
      emitCanvasData(shapes);
    }
  };

  // ===== Connector Mode =====
  const handleShapeClick = (shape) => {
    if (mode === 'connector') {
      if (!connectorStartId) {
        setConnectorStartId(shape.id);
      } else if (connectorStartId !== shape.id) {
        // Connect the two shapes by their center
        const startShape = shapes.find((s) => s.id === connectorStartId);
        if (startShape) {
          const startCenter = getCenterOfShape(startShape);
          const endCenter = getCenterOfShape(shape);
          const id = 'line-' + Date.now();
          const connectorLine = {
            id,
            type: 'line',
            points: [startCenter.x, startCenter.y, endCenter.x, endCenter.y],
            stroke: color,
            strokeWidth: 2,
            dash: [4, 4],
          };
          const updated = [...shapes, connectorLine];
          setShapes(updated);
          emitCanvasData(updated);
        }
        setConnectorStartId(null);
      }
    } else if (mode === 'select') {
      setSelectedId(shape.id);
    }
  };

  // Calculate the center of a shape
  const getCenterOfShape = (s) => {
    // If the shape has a bounding box (rect, diamond, text, image)
    // we can compute center as x + width/2, y + height/2
    if (s.type === 'rect' || s.type === 'text' || s.type === 'image') {
      return { x: s.x + (s.width || 100) / 2, y: s.y + (s.height || 30) / 2 };
    }
    // For circle
    if (s.type === 'circle') {
      return { x: s.x, y: s.y };
    }
    // For diamond
    if (s.type === 'diamond') {
      return {
        x: s.x + (s.width || 120) / 2,
        y: s.y + (s.height || 80) / 2,
      };
    }
    // For line, just take the start point
    if (s.type === 'line' && s.points.length >= 2) {
      return { x: s.points[0], y: s.points[1] };
    }
    return { x: s.x, y: s.y };
  };

  // ===== Adding Shapes =====
  const addShape = (shapeType) => {
    const id = shapeType + '-' + Date.now();
    let newShape = null;
    if (shapeType === 'rectangle') {
      newShape = {
        id,
        type: 'rect',
        x: 100,
        y: 100,
        width: 100,
        height: 80,
        fill: color,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      };
    } else if (shapeType === 'circle') {
      newShape = {
        id,
        type: 'circle',
        x: 150,
        y: 150,
        radius: 50,
        fill: color,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      };
    }
    if (newShape) {
      const updated = [...shapes, newShape];
      setShapes(updated);
      emitCanvasData(updated);
    }
  };

  // Diamond shape
  const addDiamond = () => {
    const id = 'diamond-' + Date.now();
    const newDiamond = {
      id,
      type: 'diamond',
      x: 200,
      y: 100,
      width: 120,
      height: 80,
      fill: color,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };
    const updated = [...shapes, newDiamond];
    setShapes(updated);
    emitCanvasData(updated);
  };

  // Text element
  const addText = () => {
    const id = 'text-' + Date.now();
    const newText = {
      id,
      type: 'text',
      x: 100,
      y: 100,
      text: 'Type here',
      fontSize: 20,
      fontFamily: 'Arial',
      fill: color,
      width: 100,
      height: 30,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };
    const updated = [...shapes, newText];
    setShapes(updated);
    emitCanvasData(updated);
  };

  // Image Upload
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const id = 'image-' + Date.now();
      const newImage = {
        id,
        type: 'image',
        x: 100,
        y: 100,
        width: 200, // default
        height: 200, // default
        src: dataUrl,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      };
      const updated = [...shapes, newImage];
      setShapes(updated);
      emitCanvasData(updated);
    };
    reader.readAsDataURL(file);
  };

  // Delete shape
  const deleteSelected = () => {
    if (selectedId) {
      const updated = shapes.filter((s) => s.id !== selectedId);
      setShapes(updated);
      setSelectedId(null);
      emitCanvasData(updated);
    }
  };

  // Update shape color
  const updateSelectedColor = () => {
    if (selectedId) {
      const updated = shapes.map((s) =>
        s.id === selectedId
          ? { ...s, fill: color, stroke: color }
          : s
      );
      setShapes(updated);
      emitCanvasData(updated);
    }
  };

  // Clear canvas
  const clearCanvas = () => {
    setShapes([]);
    setSelectedId(null);
    setConnectorStartId(null);
    emitCanvasData([]);
  };

  const handleColorChange = (e) => {
    setColor(e.target.value);
  };

  // ===== Render the shapes =====
  // We also attach transform events to each shape for resizing/rotating
  const onTransformEnd = (node, shape) => {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = node.rotation();

    const updatedShapes = shapes.map((s) => {
      if (s.id !== shape.id) return s;

      if (s.type === 'rect' || s.type === 'text' || s.type === 'image') {
        const newWidth = s.width * scaleX;
        const newHeight = s.height * scaleY;
        return {
          ...s,
          x: node.x(),
          y: node.y(),
          width: newWidth,
          height: newHeight,
          rotation,
          scaleX: 1,
          scaleY: 1,
        };
      }
      if (s.type === 'circle') {
        // For circle, let's approximate radius from scale
        const newRadius = s.radius * (scaleX + scaleY) / 2;
        return {
          ...s,
          x: node.x(),
          y: node.y(),
          radius: newRadius,
          rotation,
          scaleX: 1,
          scaleY: 1,
        };
      }
      if (s.type === 'diamond') {
        const newWidth = s.width * scaleX;
        const newHeight = s.height * scaleY;
        return {
          ...s,
          x: node.x(),
          y: node.y(),
          width: newWidth,
          height: newHeight,
          rotation,
          scaleX: 1,
          scaleY: 1,
        };
      }
      if (s.type === 'line') {
        // We won't handle transform for free lines or connectors in this example
        return s;
      }
      return s;
    });

    setShapes(updatedShapes);
    emitCanvasData(updatedShapes);
  };

  const URLImage = ({ shape }) => {
    const [img] = useImage(shape.src);
    return (
      <Image
        id={shape.id}
        image={img}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rotation={shape.rotation}
        draggable
        onClick={() => setSelectedId(shape.id)}
        onDragEnd={(e) => {
          const pos = e.target.position();
          const updated = shapes.map((s) =>
            s.id === shape.id
              ? { ...s, x: pos.x, y: pos.y }
              : s
          );
          setShapes(updated);
          emitCanvasData(updated);
        }}
        onTransformEnd={(e) => onTransformEnd(e.target, shape)}
      />
    );
  };

  // Renders each shape with transform & drag events
  const renderShape = (shape) => {
    switch (shape.type) {
      case 'rect':
        return (
          <Rect
            key={shape.id}
            id={shape.id}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            fill={shape.fill}
            rotation={shape.rotation || 0}
            draggable
            onClick={() => setSelectedId(shape.id)}
            onDragEnd={(e) => {
              const pos = e.target.position();
              const updated = shapes.map((s) =>
                s.id === shape.id ? { ...s, x: pos.x, y: pos.y } : s
              );
              setShapes(updated);
              emitCanvasData(updated);
            }}
            onTransformEnd={(e) => onTransformEnd(e.target, shape)}
          />
        );
      case 'circle':
        return (
          <Circle
            key={shape.id}
            id={shape.id}
            x={shape.x}
            y={shape.y}
            radius={shape.radius}
            fill={shape.fill}
            rotation={shape.rotation || 0}
            draggable
            onClick={() => setSelectedId(shape.id)}
            onDragEnd={(e) => {
              const pos = e.target.position();
              const updated = shapes.map((s) =>
                s.id === shape.id ? { ...s, x: pos.x, y: pos.y } : s
              );
              setShapes(updated);
              emitCanvasData(updated);
            }}
            onTransformEnd={(e) => onTransformEnd(e.target, shape)}
          />
        );
      case 'diamond':
        // We'll treat diamond as a rotated square. We'll compute points from width/height
        return (
          <Line
            key={shape.id}
            id={shape.id}
            x={shape.x}
            y={shape.y}
            points={[
              shape.width / 2, 0,
              shape.width, shape.height / 2,
              shape.width / 2, shape.height,
              0, shape.height / 2,
            ]}
            fill={shape.fill}
            closed
            rotation={shape.rotation || 0}
            draggable
            onClick={() => setSelectedId(shape.id)}
            onDragEnd={(e) => {
              const pos = e.target.position();
              const updated = shapes.map((s) =>
                s.id === shape.id ? { ...s, x: pos.x, y: pos.y } : s
              );
              setShapes(updated);
              emitCanvasData(updated);
            }}
            onTransformEnd={(e) => onTransformEnd(e.target, shape)}
          />
        );
      case 'text':
        return (
          <Text
            key={shape.id}
            id={shape.id}
            x={shape.x}
            y={shape.y}
            text={shape.text}
            fontSize={shape.fontSize}
            fontFamily={shape.fontFamily}
            fill={shape.fill}
            width={shape.width}
            height={shape.height}
            rotation={shape.rotation || 0}
            draggable
            onClick={() => setSelectedId(shape.id)}
            onDragEnd={(e) => {
              const pos = e.target.position();
              const updated = shapes.map((s) =>
                s.id === shape.id ? { ...s, x: pos.x, y: pos.y } : s
              );
              setShapes(updated);
              emitCanvasData(updated);
            }}
            onTransformEnd={(e) => onTransformEnd(e.target, shape)}
          />
        );
      case 'line':
        // Lines (free-drawn or connectors)
        return (
          <Line
            key={shape.id}
            id={shape.id}
            points={shape.points}
            stroke={shape.stroke || '#000'}
            strokeWidth={shape.strokeWidth || 2}
            dash={shape.dash || []}
          />
        );
      case 'image':
        return <URLImage key={shape.id} shape={shape} />;
      default:
        return null;
    }
  };

  // Attach or detach the Transformer based on selectedId
  useEffect(() => {
    const stage = stageRef.current?.getStage();
    if (!stage) return;
    const tr = transformerRef.current;
    if (!tr) return;

    if (selectedId) {
      const selectedNode = stage.findOne(`#${selectedId}`);
      if (selectedNode) {
        tr.nodes([selectedNode]);
      } else {
        tr.nodes([]);
      }
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedId, shapes]);

  // ===== Login / Session screen =====
  if (!isLoggedIn) {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300 ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-100 text-gray-900'
          }`}
      >
        <div className="absolute top-4 right-4">
          <Button onClick={toggleDarkMode}>
            {darkMode ? 'Light Mode' : 'Dark Mode'}
          </Button>
        </div>
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">
            Join or Create a Session
          </h1>
          <div className="mb-4">
            <label className="block mb-1">Username:</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700"
            />
          </div>
          {isCreatingSession ? (
            <div className="mb-4">
              <label className="block mb-1">Passcode (auto-generated):</label>
              <div className="flex items-center">
                <input
                  type="text"
                  value={passcode}
                  readOnly
                  className="w-full border rounded p-2 mr-2 bg-gray-50 dark:bg-gray-700"
                  placeholder="Click Generate"
                />
                <Button onClick={() => setPasscode(generatePasscode())}>
                  Generate
                </Button>
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <label className="block mb-1">Enter Session Passcode:</label>
              <input
                type="text"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700"
              />
            </div>
          )}
          <div className="mb-4">
            <Button
              onClick={() => {
                if (username && passcode) {
                  setIsLoggedIn(true);
                } else {
                  alert('Please enter a username and passcode');
                }
              }}
              className="w-full"
            >
              {isCreatingSession ? 'Create Session' : 'Join Session'}
            </Button>
          </div>
          <div className="text-center">
            <p className="mb-2">
              {isCreatingSession
                ? 'Want to join an existing session?'
                : 'Want to create a new session?'}
            </p>
            <Button
              onClick={() => {
                setIsCreatingSession(!isCreatingSession);
                setPasscode('');
              }}
            >
              {isCreatingSession
                ? 'Switch to Join Session'
                : 'Switch to Create Session'}
            </Button>
          </div>
        </div>
      </div>
    );
  }


// Define components first
const ToolButton = ({ icon: Icon, label, onClick, active, className = '' }) => (
  <div className="relative group">
    <button 
      onClick={onClick}
      className={`
        p-2 rounded-lg transition-all duration-200
        flex items-center justify-center
        w-10 h-10 
        ${active 
          ? 'bg-blue-500 text-white' 
          : 'bg-white hover:bg-blue-100 text-gray-700 hover:text-blue-600'
        }
        border border-gray-200 hover:border-blue-300
        ${className}
      `}
    >
      <Icon className="w-5 h-5" />
    </button>
    <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 
                    opacity-0 group-hover:opacity-100 transition-opacity duration-200
                    bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
      {label}
    </div>
  </div>
);

const ButtonGroup = ({ children, className = '' }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    {children}
  </div>
);

// Main Toolbar component
const Toolbar = ({
  mode,
  setMode,
  addShape,
  addDiamond,
  addText,
  deleteSelected,
  updateSelectedColor,
  clearCanvas,
  darkMode,
  toggleDarkMode,
  onImageUpload,
  color,
  onColorChange
}) => {
  return (
    <div className="flex items-center gap-4 p-3 bg-white border-b border-gray-200 shadow-sm">
      {/* Drawing Tools */}
      <ButtonGroup>
        <ToolButton
          icon={MousePointer2}
          label="Select"
          onClick={() => setMode('select')}
          active={mode === 'select'}
        />
        <ToolButton
          icon={Pencil}
          label="Pencil"
          onClick={() => setMode('pencil')}
          active={mode === 'pencil'}
        />
      </ButtonGroup>

      {/* Shapes */}
      <ButtonGroup>
        <ToolButton
          icon={Square}
          label="Rectangle"
          onClick={() => addShape('rectangle')}
        />
        <ToolButton
          icon={CircleIcon}
          label="Circle"
          onClick={() => addShape('circle')}
        />
        <ToolButton
          icon={Diamond}
          label="Diamond"
          onClick={addDiamond}
        />
        <ToolButton
          icon={Type}
          label="Text"
          onClick={addText}
        />
        <ToolButton
          icon={Link2}
          label="Connector"
          onClick={() => setMode('connector')}
          active={mode === 'connector'}
        />
      </ButtonGroup>

      {/* Actions */}
      <ButtonGroup>
        <ToolButton
          icon={Trash2}
          label="Delete"
          onClick={deleteSelected}
        />
        <ToolButton
          icon={Palette}
          label="Update Color"
          onClick={updateSelectedColor}
        />
        <ToolButton
          icon={Eraser}
          label="Clear Canvas"
          onClick={clearCanvas}
        />
      </ButtonGroup>

      {/* Color Picker */}
      <div className="relative group">
        <input
          type="color"
          value={color}
          onChange={onColorChange}
          className="w-10 h-10 rounded cursor-pointer"
        />
        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 
                      opacity-0 group-hover:opacity-100 transition-opacity duration-200
                      bg-gray-800 text-white text-xs px-2 py-1 rounded">
          Pick Color
        </div>
      </div>

      {/* Utilities */}
      <ButtonGroup>
        <ToolButton
          icon={Upload}
          label="Upload Image"
          onClick={onImageUpload}
        />
        <ToolButton
          icon={darkMode ? Sun : Moon}
          label={darkMode ? "Light Mode" : "Dark Mode"}
          onClick={toggleDarkMode}
        />
      </ButtonGroup>
    </div>
  );
};


  // ===== Main whiteboard interface =====
  return (
    <div
      className={`flex h-screen transition-colors duration-300 ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-100 text-gray-900'
        }`}
    >
      {/* Left: Whiteboard Area */}
      <div className="flex-grow flex flex-col">
        {/* Top Toolbar */}
        <Toolbar
          mode={mode}
          setMode={setMode}
          addShape={addShape}
          addDiamond={addDiamond}
          addText={addText}
          deleteSelected={deleteSelected}
          updateSelectedColor={updateSelectedColor}
          clearCanvas={clearCanvas}
          darkMode={darkMode}
          toggleDarkMode={toggleDarkMode}
          onImageUpload={() => fileInputRef.current.click()}
          color={color}
          onColorChange={handleColorChange}
        />
        {/* Canvas Area */}
        <div className="flex-grow flex items-center justify-center relative">
          <Stage
            width={window.innerWidth * 0.7}
            height={window.innerHeight * 0.9}
            ref={stageRef}
            onMouseDown={handleMouseDown}
            onMousemove={handleMouseMove}
            onMouseup={handleMouseUp}
          >
            <Layer>
              {shapes.map((shape) => (
                <React.Fragment key={shape.id}>
                  {renderShape(shape)}
                </React.Fragment>
              ))}
              {/* The Konva Transformer */}
              <Transformer ref={transformerRef} />
            </Layer>
            {/* Cursor Overlay */}
            <Layer>
              {Object.entries(userCursors).map(([id, user]) => (
                <Group key={id}>
                  <Circle
                    x={user.x}
                    y={user.y}
                    radius={5}
                    fill={user.isDrawing ? 'red' : 'blue'}
                  />
                  <Text
                    x={user.x + 8}
                    y={user.y - 5}
                    text={
                      id === socket.id ? user.username + ' (You)' : user.username
                    }
                    fontSize={12}
                    fill="black"
                  />
                </Group>
              ))}
            </Layer>
          </Stage>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-64 border-l p-4 overflow-y-auto shadow-inner flex flex-col">
        {/* Active Users List */}
        <h2 className="font-bold text-lg mb-2">Active Users</h2>
        <ul className="mb-4">
          {Object.entries(userCursors).map(([id, user]) => (
            <li
              key={id}
              className="mb-2 p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex flex-col">
                <span className="font-medium">
                  {id === socket.id ? user.username + ' (You)' : user.username}
                </span>
                <span className="text-xs">
                  {`x: ${Math.round(user.x)}, y: ${Math.round(user.y)}`}
                </span>
                {user.isDrawing && (
                  <span className="text-xs text-red-500">Drawing</span>
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* Chatbox */}
        <h2 className="font-bold text-lg mb-2">Chat</h2>
        <div className="flex-grow mb-2 overflow-auto border border-gray-300 dark:border-gray-600 rounded p-2">
          {messages.map((msg, idx) => (
            <div key={idx} className="mb-2">
              <span className="font-semibold">{msg.username}: </span>
              <span>{msg.text}</span>
            </div>
          ))}
        </div>
        <div className="flex">
          <input
            className="flex-grow border rounded p-2 mr-2 dark:bg-gray-700"
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type a message..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendChatMessage();
            }}
          />
          <Button onClick={sendChatMessage}>Send</Button>
        </div>
      </div>
    </div>
  );
};

export default App;
