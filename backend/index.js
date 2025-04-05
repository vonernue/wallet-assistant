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
    },
    // Set ping timeout and interval for better connection management
    pingTimeout: 60000,
    pingInterval: 25000
});

// Configure Express middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../')));

// Store connected clients
const connectedClients = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
    const clientInfo = {
        id: socket.id,
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
        connectedAt: new Date()
    };

    console.log(`Client connected: ${socket.id} (IP: ${clientInfo.ip})`);
    console.log(`Connected clients: ${connectedClients.size}`);

    // Check if this socket ID is already in our set
    if (!connectedClients.has(socket.id)) {
        connectedClients.set(socket.id, clientInfo);

        // Send welcome message to the client
        socket.emit('serverMessage', { message: 'Connected to MetaMask automation server' });

        // Handle disconnection
        socket.on('disconnect', (reason) => {
            console.log(`Client disconnected: ${socket.id} (Reason: ${reason})`);
            connectedClients.delete(socket.id);
            console.log(`Remaining clients: ${connectedClients.size}`);
        });

        // Handle errors
        socket.on('error', (error) => {
            console.error(`Socket error for ${socket.id}:`, error);
            connectedClients.delete(socket.id);
            console.log(`Remaining clients after error: ${connectedClients.size}`);
        });

        // Listen for client messages
        socket.on('clientMessage', (data) => {
            console.log(`Message from client ${socket.id}:`, data);
        });

        // Listen for sign message result
        socket.on('signMessageResult', (data) => {
            console.log(`Sign message result from ${socket.id}:`);
            console.log(`- Account: ${data.account}`);
            console.log(`- Message: ${data.message}`);
            console.log(`- Signature: ${data.signature?.substring(0, 20)}...${data.signature?.substring(data.signature.length - 10)}`);

            // Acknowledge receipt of signature
            socket.emit('serverMessage', {
                message: `Signature received for message: "${data.message.substring(0, 30)}${data.message.length > 30 ? '...' : ''}"`
            });
        });
    } else {
        console.log(`Duplicate connection attempt from ${socket.id}`);
        // For duplicates, we could either keep the new one and close the old one
        // or reject the new one depending on your use case
    }
});

// API routes
app.get('/api/status', (req, res) => {
    console.log('Status endpoint hit');

    // Convert connected clients to array of info for the response
    const clientList = Array.from(connectedClients.values()).map(client => ({
        id: client.id,
        connectedSince: client.connectedAt
    }));

    res.json({
        status: 'online',
        connectedClients: connectedClients.size,
        clients: clientList
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

        // Get array of client IDs for logging
        const clientIds = Array.from(connectedClients.keys()).join(', ');
        console.log(`Client IDs receiving message: ${clientIds}`);

        // Track message delivery acknowledgement
        const messageId = Date.now().toString();
        const messageData = { message, id: messageId };

        // Broadcast to all connected clients
        io.emit('triggerSign', messageData);
        console.log(`Message ID ${messageId} broadcast to all clients`);

        return res.json({
            success: true,
            message: `Sign request sent to ${connectedClients.size} client(s)`,
            clients: Array.from(connectedClients.keys()),
            messageId
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

        // Get array of client IDs for logging
        const clientIds = Array.from(connectedClients.keys()).join(', ');
        console.log(`Client IDs receiving message: ${clientIds}`);

        // Track message delivery acknowledgement
        const messageId = Date.now().toString();
        const messageData = { message, id: messageId };

        // Broadcast to all connected clients
        io.emit('triggerSign', messageData);
        console.log(`Message ID ${messageId} broadcast to all clients`);

        return res.json({
            success: true,
            message: `Sign request sent to ${connectedClients.size} client(s)`,
            clients: Array.from(connectedClients.keys()),
            messageId
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
}).on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please:
1. Stop any other process using port ${PORT}, or
2. Use a different port by setting the PORT environment variable`);
        process.exit(1);
    } else {
        console.error('Error starting server:', error);
        process.exit(1);
    }
});