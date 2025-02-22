const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

app.use(express.json());

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Join session event: add the socket to a room based on passcode.
  socket.on('join-session', ({ username, passcode }) => {
    socket.username = username;
    socket.passcode = passcode;
    socket.join(passcode);
    console.log(`${username} joined session ${passcode}`);
  });

  // Receive canvas data and broadcast it to the same room.
  socket.on('canvas-data', (data) => {
    const room = socket.passcode;
    if (room) {
      socket.to(room).emit('canvas-data', data);
    }
  });

  // New: Handle cursor updates.
  socket.on('cursor-update', (data) => {
    const room = socket.passcode;
    if (room) {
      // Broadcast the cursor update to everyone else in the room.
      socket.to(room).emit('user-update', data);
    }
  });

  // When a user disconnects, notify others in the room.
  socket.on('disconnect', () => {
    if (socket.passcode) {
      socket.to(socket.passcode).emit('user-disconnect', socket.id);
    }
    console.log('User disconnected:', socket.id);
  });
});

// New endpoint to interact with OpenAI API for diagram generation.
app.post('/api/generate-diagram', async (req, res) => {
  const { description } = req.body;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: description }],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error generating diagram:", error);
    res.status(500).send("Error generating diagram");
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
