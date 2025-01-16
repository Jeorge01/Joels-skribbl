const websocket = require('ws');
const express = require('express');
const path = require('path');
require('dotenv').config();

const WebSocket = websocket;
const PORT = process.env.PORT || 3000;
const app = express();
const server = require('http').createServer(app);
const wss = new websocket.Server({ server });

app.use(express.static(__dirname));

app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'"
    );
    next();
});

const clients = new Map();

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        switch(data.type) {
            case 'join':
                clients.set(ws, { name: data.name });
                broadcastPlayers();
                break;
            case 'draw':
                broadcast(message, ws);
                break;
            case 'chat':
                broadcast(message.toString(), ws);
                console.log('Broadcasting chat message');
                break;
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);
        broadcastPlayers();
    });
});

function broadcast(message, sender) {
    const messageToSend = typeof message === 'string' ? message : JSON.stringify(message);
    wss.clients.forEach((client) => {
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(messageToSend);
        }
    });
}

function broadcastPlayers() {
    const playerList = Array.from(clients.values()).map((client) => client.name);
    const message = JSON.stringify({ type: 'players', players: playerList });

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});