import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  addEdge,
  Controls,
  Background,
  MiniMap,
  Handle,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';
import io from 'socket.io-client';
import { 
  MousePointer2, 
  Square,
  MessageCircle, 
  Circle as CircleIcon, 
  Type, 
  Link2, 
  Trash2, 
  Palette, 
  Upload, 
  Sun, 
  Moon,
  X,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { Button } from './components/ui/button';

const socket = io('http://localhost:3001');

const nodeTypes = {
  rectangle: ({ data }) => (
    <div 
      className="node-rectangle"
      style={{ 
        backgroundColor: data.color,
        width: data.width,
        height: data.height,
        border: `2px solid ${data.borderColor}`,
        borderRadius: data.borderRadius,
        padding: data.text ? '8px' : 0,
      }}
    >
      {data.text && <div style={{ color: data.textColor }}>{data.text}</div>}
      <Handle type="source" position="bottom" />
      <Handle type="target" position="top" />
    </div>
  ),
  circle: ({ data }) => (
    <div
      className="node-circle"
      style={{
        backgroundColor: data.color,
        width: data.width,
        height: data.height,
        borderRadius: '50%',
        border: `2px solid ${data.borderColor}`,
      }}
    >
      <Handle type="source" position="bottom" />
      <Handle type="target" position="top" />
    </div>
  ),
  text: ({ data }) => (
    <div 
      className="node-text"
      style={{ 
        color: data.color, 
        fontSize: data.fontSize,
        padding: '8px',
        width: data.width,
        height: data.height,
      }}
    >
      {data.content}
    </div>
  ),
  image: ({ data }) => (
    <div 
      className="node-image"
      style={{ 
        width: data.width, 
        height: data.height,
        overflow: 'hidden',
        border: `2px solid ${data.borderColor}`,
      }}
    >
      <img
        src={data.src}
        alt="user-uploaded"
        style={{ 
          width: '100%', 
          height: '100%',
          objectFit: 'cover',
        }}
      />
      <Handle type="source" position="bottom" />
      <Handle type="target" position="top" />
    </div>
  ),
};

const generatePasscode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

const MIN_CHAT_WIDTH = 300;

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [passcode, setPasscode] = useState('');
  const [isCreatingSession, setIsCreatingSession] = useState(true);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [history, setHistory] = useState([{ nodes: [], edges: [] }]);
  const [historyStep, setHistoryStep] = useState(0);

  const [darkMode, setDarkMode] = useState(false);
  const [color, setColor] = useState('#4a90e2');
  const [chatWidth, setChatWidth] = useState(MIN_CHAT_WIDTH);
  const [chatVisible, setChatVisible] = useState(true);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [userCursors, setUserCursors] = useState({});

  const fileInputRef = useRef(null);
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  useEffect(() => {
    if (!isLoggedIn) return;

    socket.on('flow-data', ({ nodes: serverNodes, edges: serverEdges, userId }) => {
      if (userId !== socket.id) {
        setNodes(serverNodes);
        setEdges(serverEdges);
      }
    });

    socket.on('user-update', (data) => {
      setUserCursors(prev => ({
        ...prev,
        [data.userId]: {
          username: data.username,
          x: data.x,
          y: data.y,
        }
      }));
    });

    socket.on('user-disconnect', (userId) => {
      setUserCursors(prev => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });
    });

    socket.on('chat-message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    return () => {
      socket.off('flow-data');
      socket.off('user-update');
      socket.off('user-disconnect');
      socket.off('chat-message');
    };
  }, [isLoggedIn]);

  const updateHistory = useCallback((newNodes, newEdges) => {
    setHistory(prev => [
      ...prev.slice(0, historyStep + 1),
      { nodes: newNodes, edges: newEdges }
    ]);
    setHistoryStep(prev => prev + 1);
  }, [historyStep]);

  const onConnect = useCallback(
    (connection) => {
      setEdges(eds => {
        const newEdges = addEdge(connection, eds);
        socket.emit('flow-data', { nodes, edges: newEdges, userId: socket.id });
        return newEdges;
      });
    },
    [nodes]
  );

  const createNode = (type, position) => {
    const id = `${type}-${Date.now()}`;
    return {
      id,
      type,
      position,
      data: { 
        color,
        borderColor: darkMode ? '#ffffff' : '#000000',
        width: 100,
        height: 100,
        ...(type === 'text' && { content: 'New Text', fontSize: 16, width: 150, height: 50 }),
        ...(type === 'image' && { src: '' }),
      },
    };
  };

  const addNode = (type) => {
    if (!reactFlowInstance) return;
    const position = reactFlowInstance.project({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const newNode = createNode(type, position);
    setNodes(nds => {
      const newNodes = nds.concat(newNode);
      updateHistory(newNodes, edges);
      socket.emit('flow-data', { nodes: newNodes, edges, userId: socket.id });
      return newNodes;
    });
  };

  const deleteSelected = () => {
    setNodes(nds => {
      const newNodes = nds.filter(node => !node.selected);
      updateHistory(newNodes, edges);
      socket.emit('flow-data', { nodes: newNodes, edges, userId: socket.id });
      return newNodes;
    });
  };

  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
    updateHistory([], []);
    socket.emit('flow-data', { nodes: [], edges: [], userId: socket.id });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const position = reactFlowInstance.project({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const newNode = createNode('image', position);
      newNode.data.src = reader.result;
      
      setNodes(nds => {
        const newNodes = nds.concat(newNode);
        updateHistory(newNodes, edges);
        socket.emit('flow-data', { nodes: newNodes, edges, userId: socket.id });
        return newNodes;
      });
    };
    reader.readAsDataURL(file);
  };

  const undo = () => {
    setHistoryStep(prev => {
      if (prev > 0) {
        const { nodes: prevNodes, edges: prevEdges } = history[prev - 1];
        setNodes(prevNodes);
        setEdges(prevEdges);
        socket.emit('flow-data', { nodes: prevNodes, edges: prevEdges, userId: socket.id });
        return prev - 1;
      }
      return prev;
    });
  };

  const redo = () => {
    setHistoryStep(prev => {
      if (prev < history.length - 1) {
        const { nodes: nextNodes, edges: nextEdges } = history[prev + 1];
        setNodes(nextNodes);
        setEdges(nextEdges);
        socket.emit('flow-data', { nodes: nextNodes, edges: nextEdges, userId: socket.id });
        return prev + 1;
      }
      return prev;
    });
  };

  const sendChatMessage = () => {
    if (!chatInput.trim()) return;
    const msgData = {
      userId: socket.id,
      username,
      text: chatInput.trim(),
    };
    socket.emit('chat-message', msgData);
    setMessages(prev => [...prev, msgData]);
    setChatInput('');
  };

  if (!isLoggedIn) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
        <div className="absolute top-4 right-4">
          <Button onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>
        </div>
        <div className={`shadow-lg rounded-lg p-8 w-full max-w-md ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <h1 className="text-2xl font-bold mb-6 text-center">Collaborative Whiteboard</h1>
          <div className="mb-4">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`w-full p-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}
            />
          </div>
          {isCreatingSession ? (
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={passcode}
                  readOnly
                  placeholder="Generate Passcode"
                  className={`flex-1 p-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}
                />
                <Button onClick={() => setPasscode(generatePasscode())}>Generate</Button>
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <input
                type="text"
                placeholder="Enter Passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className={`w-full p-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}
              />
            </div>
          )}
          <Button
            className="w-full mb-4"
            onClick={() => username && passcode && setIsLoggedIn(true)}
          >
            {isCreatingSession ? 'Create Session' : 'Join Session'}
          </Button>
          <div className="text-center">
            <Button
              variant="link"
              onClick={() => {
                setIsCreatingSession(!isCreatingSession);
                setPasscode('');
              }}
            >
              {isCreatingSession ? 'Join existing session' : 'Create new session'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      <div className="flex-grow" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onInit={setReactFlowInstance}
          fitView
          style={{ background: darkMode ? '#1f2937' : '#f3f4f6' }}
        >
          <Controls className={`${darkMode ? 'bg-gray-800' : 'bg-white'}`} />
          <MiniMap className={`${darkMode ? 'bg-gray-800' : 'bg-white'}`} />
          <Background gap={16} color={darkMode ? '#64748b' : '#cbd5e1'} />
        </ReactFlow>

        <div className="absolute top-4 left-4 flex gap-2">
          <Button onClick={() => addNode('rectangle')}><Square className="w-4 h-4" /></Button>
          <Button onClick={() => addNode('circle')}><CircleIcon className="w-4 h-4" /></Button>
          <Button onClick={() => addNode('text')}><Type className="w-4 h-4" /></Button>
          <Button onClick={() => setNodes(nds => nds.map(n => n.selected ? {...n, data: {...n.data, color}} : n))}>
            <Palette className="w-4 h-4" />
          </Button>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-10 h-10 rounded cursor-pointer"
          />
          <Button onClick={deleteSelected}><Trash2 className="w-4 h-4" /></Button>
          <Button onClick={clearCanvas}>Clear</Button>
          <Button onClick={undo}><Undo2 className="w-4 h-4" /></Button>
          <Button onClick={redo}><Redo2 className="w-4 h-4" /></Button>
          <Button onClick={() => fileInputRef.current.click()}>
            <Upload className="w-4 h-4" />
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
            accept="image/*"
          />
        </div>

        <div className="absolute top-4 right-4 flex gap-2">
          <Button onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          <Button onClick={() => setChatVisible(!chatVisible)}>
            <MessageCircle className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {chatVisible && (
        <div 
          className={`border-l p-4 flex flex-col ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
          style={{ width: chatWidth }}
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Chat</h2>
            <Button variant="ghost" onClick={() => setChatVisible(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto mb-4">
            {messages.map((msg, idx) => (
              <div key={idx} className="mb-2 p-2 rounded bg-gray-100 dark:bg-gray-700">
                <span className="font-medium">{msg.username}: </span>
                <span>{msg.text}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
              className={`flex-1 p-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}
              placeholder="Type a message..."
            />
            <Button onClick={sendChatMessage}>Send</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;