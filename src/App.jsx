import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Rect, Circle, Line, Text, Image, Group } from 'react-konva';
import useImage from 'use-image';
import io from 'socket.io-client';
import { Button } from './components/ui/button';
import { Select } from './components/ui/select';

const socket = io('http://localhost:3001');

// Helper function to generate a random passcode (6 alphanumeric characters)
const generatePasscode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const App = () => {
  // ===== Authentication / Session state =====
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [passcode, setPasscode] = useState('');
  const [isCreatingSession, setIsCreatingSession] = useState(true); // Toggle between creating or joining a session

  // ===== Whiteboard state =====
  const [mode, setMode] = useState('select'); // Modes: 'select', 'pencil', 'connector'
  const [shapes, setShapes] = useState([]);
  const [color, setColor] = useState('#000000');
  const [selectedId, setSelectedId] = useState(null);
  const [connectorStartId, setConnectorStartId] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const stageRef = useRef(null);
  const fileInputRef = useRef(null);

  // ===== Presence state =====
  // userCursors will hold data for each connected user: { [userId]: { username, x, y, isDrawing } }
  const [userCursors, setUserCursors] = useState({});

  // ===== Join session =====
  useEffect(() => {
    if (isLoggedIn) {
      socket.emit('join-session', { username, passcode });
    }
  }, [isLoggedIn, username, passcode]);

  // ===== Socket Listeners =====
  // Canvas updates from other users.
  useEffect(() => {
    socket.on('canvas-data', (data) => {
      if (data.userId !== socket.id) {
        setShapes(data.shapes);
      }
    });

    // Listen for user cursor updates.
    socket.on('user-update', (data) => {
      // Update the userCursors state with the new data.
      setUserCursors((prev) => ({
        ...prev,
        [data.userId]: { username: data.username, x: data.x, y: data.y, isDrawing: data.isDrawing }
      }));
    });

    // Remove disconnected users.
    socket.on('user-disconnect', (userId) => {
      setUserCursors((prev) => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });
    });

    return () => {
      socket.off('canvas-data');
      socket.off('user-update');
      socket.off('user-disconnect');
    };
  }, []);

  const emitCanvasData = (newShapes) => {
    socket.emit('canvas-data', { userId: socket.id, shapes: newShapes });
  };

  // Emit pointer updates on every mouse move.
  const emitCursorUpdate = (pos, drawing) => {
    socket.emit('cursor-update', {
      userId: socket.id,
      username,
      x: pos.x,
      y: pos.y,
      isDrawing: drawing
    });
  };

  // ===== Pencil (free-drawing) handlers =====
  const handleMouseDown = (e) => {
    if (mode === 'pencil') {
      setIsDrawing(true);
      const pos = stageRef.current.getPointerPosition();
      const id = 'line-' + Date.now();
      const newLine = { id, type: 'line', points: [pos.x, pos.y], stroke: color, strokeWidth: 2 };
      const updated = [...shapes, newLine];
      setShapes(updated);
      emitCanvasData(updated);
      setSelectedId(id);
    }
  };

  const handleMouseMove = (e) => {
    if (!stageRef.current) return;
    const pos = stageRef.current.getPointerPosition();
    // Always emit the current cursor position.
    emitCursorUpdate(pos, mode === 'pencil' && isDrawing);

    if (mode === 'pencil' && isDrawing && selectedId) {
      setShapes((prevShapes) =>
        prevShapes.map((shape) => {
          if (shape.id === selectedId && shape.type === 'line') {
            return { ...shape, points: [...shape.points, pos.x, pos.y] };
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

  // ===== Connector Mode Handler =====
  const handleShapeClick = (e, shape) => {
    if (mode === 'connector') {
      if (!connectorStartId) {
        setConnectorStartId(shape.id);
      } else if (connectorStartId !== shape.id) {
        const getCenter = (s) => {
          if (s.type === 'rect' || s.type === 'text') {
            return { x: s.x + (s.width || 100) / 2, y: s.y + (s.height || 30) / 2 };
          } else if (s.type === 'circle') {
            return { x: s.x, y: s.y };
          } else if (s.type === 'diamond') {
            return { x: s.x + (s.width || 120) / 2, y: s.y + (s.height || 80) / 2 };
          } else if (s.type === 'line') {
            return { x: s.points[0], y: s.points[1] };
          } else if (s.type === 'image') {
            return { x: s.x, y: s.y };
          }
          return { x: s.x, y: s.y };
        };
        const startShape = shapes.find((s) => s.id === connectorStartId);
        if (startShape) {
          const startCenter = getCenter(startShape);
          const endCenter = getCenter(shape);
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

  // ===== Adding Basic Shapes =====
  const addShape = (shapeType) => {
    const id = shapeType + '-' + Date.now();
    let newShape = null;
    if (shapeType === 'rectangle') {
      newShape = { id, type: 'rect', x: 100, y: 100, width: 100, height: 100, fill: color };
    } else if (shapeType === 'circle') {
      newShape = { id, type: 'circle', x: 150, y: 150, radius: 50, fill: color };
    }
    if (newShape) {
      const updated = [...shapes, newShape];
      setShapes(updated);
      emitCanvasData(updated);
    }
  };

  // ===== Add a Diamond shape =====
  const addDiamond = () => {
    const id = 'diamond-' + Date.now();
    const newDiamond = { id, type: 'diamond', x: 100, y: 100, width: 120, height: 80, fill: color };
    const updated = [...shapes, newDiamond];
    setShapes(updated);
    emitCanvasData(updated);
  };

  // ===== Add a Text element =====
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
    };
    const updated = [...shapes, newText];
    setShapes(updated);
    emitCanvasData(updated);
  };

  // ===== Image Upload Handler =====
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const id = 'image-' + Date.now();
      const newImage = { id, type: 'image', x: 100, y: 100, src: dataUrl };
      const updated = [...shapes, newImage];
      setShapes(updated);
      emitCanvasData(updated);
    };
    reader.readAsDataURL(file);
  };

  // ===== Delete Selected Shape =====
  const deleteSelected = () => {
    if (selectedId) {
      const updated = shapes.filter((s) => s.id !== selectedId);
      setShapes(updated);
      setSelectedId(null);
      emitCanvasData(updated);
    }
  };

  // ===== Update Color of Selected Shape =====
  const updateSelectedColor = () => {
    if (selectedId) {
      const updated = shapes.map((s) =>
        s.id === selectedId ? { ...s, fill: color, stroke: color } : s
      );
      setShapes(updated);
      emitCanvasData(updated);
    }
  };

  // ===== Clear Entire Canvas =====
  const clearCanvas = () => {
    setShapes([]);
    setSelectedId(null);
    setConnectorStartId(null);
    emitCanvasData([]);
  };

  const handleColorChange = (e) => {
    setColor(e.target.value);
  };

  // ===== Component for Rendering Uploaded Images =====
  const URLImage = ({ shape }) => {
    const [img] = useImage(shape.src);
    return (
      <Image
        image={img}
        {...shape}
        draggable
        onClick={(e) => handleShapeClick(e, shape)}
        onDragEnd={(e) => {
          const pos = e.target.position();
          const updated = shapes.map((s) =>
            s.id === shape.id ? { ...s, x: pos.x, y: pos.y } : s
          );
          setShapes(updated);
          emitCanvasData(updated);
        }}
      />
    );
  };

  // ===== Render shapes based on type =====
  const renderShape = (shape) => {
    switch (shape.type) {
      case 'rect':
        return (
          <Rect
            key={shape.id}
            {...shape}
            draggable
            onClick={(e) => handleShapeClick(e, shape)}
            onDragEnd={(e) => {
              const pos = e.target.position();
              const updated = shapes.map((s) =>
                s.id === shape.id ? { ...s, x: pos.x, y: pos.y } : s
              );
              setShapes(updated);
              emitCanvasData(updated);
            }}
          />
        );
      case 'circle':
        return (
          <Circle
            key={shape.id}
            {...shape}
            draggable
            onClick={(e) => handleShapeClick(e, shape)}
            onDragEnd={(e) => {
              const pos = e.target.position();
              const updated = shapes.map((s) =>
                s.id === shape.id ? { ...s, x: pos.x, y: pos.y } : s
              );
              setShapes(updated);
              emitCanvasData(updated);
            }}
          />
        );
      case 'text':
        return (
          <Text
            key={shape.id}
            {...shape}
            draggable
            onClick={(e) => handleShapeClick(e, shape)}
            onDragEnd={(e) => {
              const pos = e.target.position();
              const updated = shapes.map((s) =>
                s.id === shape.id ? { ...s, x: pos.x, y: pos.y } : s
              );
              setShapes(updated);
              emitCanvasData(updated);
            }}
          />
        );
      case 'line':
        return <Line key={shape.id} {...shape} />;
      case 'diamond':
        return (
          <Line
            key={shape.id}
            points={[
              shape.x + shape.width / 2, shape.y,
              shape.x + shape.width, shape.y + shape.height / 2,
              shape.x + shape.width / 2, shape.y + shape.height,
              shape.x, shape.y + shape.height / 2,
            ]}
            fill={shape.fill}
            closed
            draggable
            onClick={(e) => handleShapeClick(e, shape)}
            onDragEnd={(e) => {
              const pos = e.target.position();
              const updated = shapes.map((s) =>
                s.id === shape.id ? { ...s, x: pos.x, y: pos.y } : s
              );
              setShapes(updated);
              emitCanvasData(updated);
            }}
          />
        );
      case 'image':
        return <URLImage key={shape.id} shape={shape} />;
      default:
        return null;
    }
  };

  // ===== Login / Session screen =====
  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <h1 className="text-2xl font-bold mb-4">Join or Create a Session</h1>
        <div className="mb-4">
          <label className="block mb-1">Username:</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="border p-2 rounded"
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
                className="border p-2 rounded mr-2"
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
              className="border p-2 rounded"
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
          >
            {isCreatingSession ? 'Create Session' : 'Join Session'}
          </Button>
        </div>
        <div>
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
            {isCreatingSession ? 'Switch to Join Session' : 'Switch to Create Session'}
          </Button>
        </div>
      </div>
    );
  }

  // ===== Main whiteboard interface =====
  return (
    <div className="flex h-screen">
      {/* Left: Whiteboard Area */}
      <div className="flex-grow flex flex-col">
        {/* Top Toolbar */}
        <div className="bg-gray-100 border-b border-gray-300 px-4 py-2 flex items-center gap-4">
          <Button onClick={() => setMode('select')}>Select</Button>
          <Button onClick={() => setMode('pencil')}>Pencil</Button>
          <Button onClick={() => addShape('rectangle')}>Rectangle</Button>
          <Button onClick={() => addShape('circle')}>Circle</Button>
          <Button onClick={addDiamond}>Diamond</Button>
          <Button onClick={addText}>Text</Button>
          <Button onClick={() => setMode('connector')}>Connector</Button>
          <Button onClick={deleteSelected}>Delete</Button>
          <Button onClick={updateSelectedColor}>Update Color</Button>
          <Button onClick={clearCanvas}>Clear</Button>
          <div className="flex items-center gap-2">
            <label htmlFor="colorPicker" className="font-medium">Color:</label>
            <input
              id="colorPicker"
              type="color"
              value={color}
              onChange={handleColorChange}
              className="w-10 h-10 border rounded"
            />
          </div>
          <Button onClick={() => fileInputRef.current && fileInputRef.current.click()}>
            Upload Image
          </Button>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleImageUpload}
          />
        </div>
        {/* Canvas Area */}
        <div className="flex-grow flex items-center justify-center bg-white relative">
          <Stage
            width={window.innerWidth * 0.7}
            height={window.innerHeight * 0.9}
            ref={stageRef}
            onMouseDown={handleMouseDown}
            onMousemove={handleMouseMove}
            onMouseup={handleMouseUp}
          >
            <Layer>
              {shapes.map(renderShape)}
            </Layer>
            {/* Cursor Overlay Layer */}
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
                    text={id === socket.id ? user.username + " (You)" : user.username}
                    fontSize={12}
                    fill="black"
                  />
                </Group>
              ))}
            </Layer>
          </Stage>
        </div>
      </div>
      {/* Right Sidebar: List of Active Users */}
      <div className="w-60 border-l border-gray-300 p-4">
        <h2 className="font-bold mb-2">Active Users</h2>
        <ul>
          {Object.entries(userCursors).map(([id, user]) => (
            <li key={id} className="mb-2">
              <div className="flex flex-col">
                <span className="font-medium">{id === socket.id ? user.username + " (You)" : user.username}</span>
                <span className="text-xs">
                  {`x: ${Math.round(user.x)}, y: ${Math.round(user.y)}`}
                </span>
                {user.isDrawing && <span className="text-xs text-red-500">Drawing</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default App;
