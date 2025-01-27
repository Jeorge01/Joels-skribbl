const websocket = require("ws");
const express = require("express");
const path = require("path");
require("dotenv").config();

const WebSocket = websocket;
const PORT = process.env.PORT || 3000;
const app = express();
const server = require("http").createServer(app);
const wss = new websocket.Server({ server });
let drawingHistory = [];

app.use(express.static(__dirname));

app.use((req, res, next) => {
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'"
    );
    next();
});

const clients = new Map();

wss.on("connection", (ws) => {
    console.log("New client connected");

    drawingHistory.forEach((drawData) => {
        ws.send(JSON.stringify(drawData));
    });

    ws.on("message", (message) => {
        const data = JSON.parse(message);
        // console.log('Server received:', data);

        switch (data.type) {
            case "join":
                clients.set(ws, {
                    name: data.name,
                    id: data.id,
                });
                broadcastPlayers();
                break;
            case "chat":
                broadcast(message.toString(), ws);
                console.log("Broadcasting chat message");
                break;
            case "draw":
                drawingHistory.push(data);

                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        const stringifiedData = JSON.stringify(data); // Convert to JSON string
                        client.send(stringifiedData);
                        // console.log("Sending draw data:", stringifiedData);
                    }
                });
                break;
            case "clear":
                drawingHistory = [];

                drawingHistory = [];
                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: "clear" }));
                    }
                });
                break;
            case "undo":
                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(
                            JSON.stringify({
                                type: "undo",
                                history: data.history,
                            })
                        );
                    }
                });
                break;
            case "startGame":
                console.log("Game started!");
                startGame(ws);
                break;
            case "timerUpdate":
                
                break;
        }
    });

    ws.on("close", () => {
        console.log("Client disconnected");
        clients.delete(ws);
        broadcastPlayers();
    });
});

function startGame(ws) {
    // Start the game and broadcast the game state to all clients
    console.log("Game has started!");

    // Notify all clients that the game has started
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "gameStart" }));
        }
    });

    // Initialize game state on server (e.g., timer, turn)
    let timeLeft = 60;
    let currentTurnIndex = 0;

    // Start the timer and broadcast updates every second
    const timerInterval = setInterval(() => {
        timeLeft--;
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: "timerUpdate",
                    timeLeft: timeLeft,
                }));
            }
        });

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
        }
    }, 1000);

    // Handle turn rotation every `turnDuration`
    const turnDuration = 60 * 1000; // 1 minute per turn, for example
    const gameInterval = setInterval(() => {
        rotateTurn();
    }, turnDuration);
}

function rotateTurn() {
    const players = Array.from(clients.values());
    if (players.length === 0) return;

    // Update the painter (reset previous, set new one)
    currentTurnIndex = (currentTurnIndex + 1) % players.length;

    const currentPlayer = players[currentTurnIndex];
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: "updatePainter",
                playerId: currentPlayer.id,
                painter: currentPlayer.id === currentPlayer.id,
            }));
        }
    });
}

function broadcast(message, sender) {
    const messageToSend =
        typeof message === "string" ? message : JSON.stringify(message);
    wss.clients.forEach((client) => {
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(messageToSend);
        }
    });
}

function broadcastPlayers() {
    const playerData = Array.from(clients).map(([_, client]) => ({
        name: client.name,
        id: client.id,
    }));

    const message = JSON.stringify({
        type: "players",
        players: playerData,
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
