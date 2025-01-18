const websocket = require('ws');
const express = require('express');
const path = require('path');
require('dotenv').config();

const WebSocket = websocket;
const PORT = process.env.PORT || 3000;
const app = express();
const server = require('http').createServer(app);
const wss = new websocket.Server({ server });
let drawingHistory = [];

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

    drawingHistory.forEach(drawData => {
        ws.send(JSON.stringify(drawData));
    });

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        // console.log('Server received:', data);
        
        switch(data.type) {
            case 'join':
                clients.set(ws, {
                    name: data.name,
                    id: data.id,
                });
                broadcastPlayers();
                break;
            case 'chat':
                    broadcast(message.toString(), ws);
                    console.log('Broadcasting chat message');
                    break;
            case 'draw':
                drawingHistory.push(data);

                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        const stringifiedData = JSON.stringify(data); // Convert to JSON string
                        client.send(stringifiedData);
                        // console.log("Sending draw data:", stringifiedData);
                    }
                });
                break;
            case 'clear':
                drawingHistory = [];
                
                drawingHistory = [];
    wss.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({type: 'clear'}));
        }
    });
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
    const playerData = Array.from(clients).map(([_, client]) => ({
        name: client.name,
        id: client.id
    }));
    
    const message = JSON.stringify({
        type: 'players',
        players: playerData
    });

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});