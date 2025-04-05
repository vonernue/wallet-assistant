const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// Create Express app
const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = new Server(server, {
    cors: {
        origin: '*', // In production, restrict this to your domain
        methods: ['GET', 'POST']
    }
});

// Configure Express middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../')));

// Store connected clients
const connectedClients = new Set();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    connectedClients.add(socket.id);

    // Send welcome message to the client
    socket.emit('serverMessage', { message: 'Connected to MetaMask automation server' });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        connectedClients.delete(socket.id);
    });

    // Listen for client messages
    socket.on('clientMessage', (data) => {
        console.log('Received message from client:', data);
    });

    // Listen for sign message result
    socket.on('signMessageResult', (data) => {
        console.log('Sign message result:', data);
    });
});

// API routes
app.get('/api/status', (req, res) => {
    console.log('Status endpoint hit');
    res.json({
        status: 'online',
        connectedClients: connectedClients.size
    });
});

// API endpoint to trigger sign message on all connected clients
app.post('/api/trigger-sign', (req, res) => {
    console.log('Trigger sign endpoint hit (POST)');

    if (connectedClients.size === 0) {
        console.log('No clients connected');
        return res.status(404).json({ success: false, message: 'No clients connected' });
    }

    let message = 'Please sign this message from the server.';
    if (req.body && req.body.message) {
        message = req.body.message;
    }

    try {
        console.log(`Sending message to ${connectedClients.size} client(s): ${message}`);

        // Broadcast to all connected clients
        io.emit('triggerSign', { message });

        return res.json({
            success: true,
            message: `Sign request sent to ${connectedClients.size} client(s)`
        });
    } catch (error) {
        console.error('Error in trigger-sign (POST):', error);
        return res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Fix for the frontend "Trigger Sign from Backend" button
app.get('/api/trigger-sign', (req, res) => {
    console.log('Trigger sign endpoint hit (GET)');

    if (connectedClients.size === 0) {
        console.log('No clients connected');
        return res.status(404).json({ success: false, message: 'No clients connected' });
    }

    try {
        const message = 'Please sign this message triggered via GET from the frontend at ' + new Date().toISOString();
        console.log(`Sending message to ${connectedClients.size} client(s): ${message}`);

        // Broadcast to all connected clients
        io.emit('triggerSign', { message });

        return res.json({
            success: true,
            message: `Sign request sent to ${connectedClients.size} client(s)`
        });
    } catch (error) {
        console.error('Error in trigger-sign (GET):', error);
        return res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to view the MetaMask demo`);
});