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
let players = []; // This will hold the players for turn rotation
let currentTurnIndex = 0; // To track the current player
let gameInterval; // Interval for game rounds
let timerInterval; // Interval for timer updates

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
    try {
        console.log("New client connected");

        drawingHistory.forEach((drawData) => {
            ws.send(JSON.stringify(drawData));
        });

        ws.on("message", (message) => {
            const data = JSON.parse(message);
            // console.log('Server received:', data);

            switch (data.type) {
                case "join":
                    // Assuming each client sends a unique player ID
                    const playerId = data.id || `player-${Date.now()}`; // Generate unique ID if not provided
                    const playerName = data.name;

                    // Store the new client information
                    clients.set(ws, {
                        name: playerName,
                        id: playerId,
                        painter: false,
                    });

                    console.log(`${playerName} joined with ID: ${playerId}`);

                    // Respond back with a message containing the player's ID
                    ws.send(
                        JSON.stringify({
                            type: "join",
                            playerId: playerId,
                        })
                    );

                    // Broadcast the updated players list
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
                    wss.clients.forEach((client) => {
                        if (
                            client !== ws &&
                            client.readyState === WebSocket.OPEN
                        ) {
                            client.send(JSON.stringify({ type: "clear" }));
                        }
                    });
                    break;
                case "undo":
                    wss.clients.forEach((client) => {
                        if (
                            client !== ws &&
                            client.readyState === WebSocket.OPEN
                        ) {
                            client.send(
                                JSON.stringify({
                                    type: "undo",
                                    history: data.history,
                                })
                            );
                        }
                    });
                    break;
                case "updatePainter":
                    const updatedPlayerId = data.playerId;
                    const isPainter = data.painter;

                    // Update the painter status in the clients Map
                    clients.forEach((clientData, clientWs) => {
                        if (clientData.id === updatedPlayerId) {
                            clientData.painter = isPainter;
                        }
                    });

                    // Rebuild the players array to keep it in sync with the clients Map
                    players = Array.from(clients.values());

                    // Broadcast the updated players list to all clients
                    broadcastPlayers();

                    console.log(
                        `Painter status updated: Player ${updatedPlayerId} is ${
                            isPainter
                                ? "now the painter"
                                : "no longer the painter"
                        }`
                    );
                    break;
                case "startGame":
                    console.log("Game started!");
                    startGame(ws);
                case "timerUpdate":
                    console.log("Timer updated:", data.timeLeft);
                    // No need for DOM updates here, just send the timer update to clients
                    wss.clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(
                                JSON.stringify({
                                    type: "timerUpdate",
                                    timeLeft: data.timeLeft,
                                })
                            );
                        }
                    });
                    break;
                default:
                    console.warn("Unknown message type received:", data.type);
            }
        });
    } catch (error) {
        console.error(
            "Error parsing or handling WebSocket message:",
            error,
            event.data
        );
    }

    ws.on("close", () => {
        console.log("Client disconnected");
        clients.delete(ws);
        players = Array.from(clients.values()); // Sync players array with clients Map
        broadcastPlayers();
    });
});

function startGame(ws) {
    players = Array.from(clients.values());
    if (players.length === 0) {
        console.warn("Cannot start game: no players connected.");
        return;
    }

    console.log("Game has started!");

    // Set the first player as the painter
    const firstPlayer = players[0];
    firstPlayer.painter = true;

    // Update the painter status in the clients Map
    clients.forEach((clientData) => {
        clientData.painter = clientData.id === firstPlayer.id;
    });

    broadcastPlayers();

    // Log to confirm the painter is set correctly
    console.log(
        `${firstPlayer.name} is the first painter: ${firstPlayer.painter}`
    );

    broadcastPainterUpdate(firstPlayer.id, true);

    // Start the timer
    let timeLeft = 60;
    timerInterval = setInterval(() => {
        timeLeft--;
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(
                    JSON.stringify({
                        type: "timerUpdate",
                        timeLeft: timeLeft,
                    })
                );
            }
        });

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            rotateTurn(); // Move to the next player when the time is up
        }
    }, 1000);

    // Handle turn rotation every minute
    const turnDuration = 60 * 1000;
    gameInterval = setInterval(() => {
        rotateTurn();
    }, turnDuration);
}

function rotateTurn() {
    if (players.length === 0) return;

    // Reset previous painter
    const previousPlayer = players[currentTurnIndex];
    const nextPlayerIndex = (currentTurnIndex + 1) % players.length;
    const nextPlayer = players[nextPlayerIndex];

    // Broadcast painter updates
    broadcastPainterUpdate(previousPlayer.id, false);
    broadcastPainterUpdate(nextPlayer.id, true);

    // Update the painter status in the clients Map
    clients.forEach((clientData) => {
        if (clientData.id === previousPlayer.id) {
            clientData.painter = false;
        }
        if (clientData.id === nextPlayer.id) {
            clientData.painter = true;
        }
    });

    // Update the global players array to reflect changes
    players = Array.from(clients.values());

    // Update currentTurnIndex
    currentTurnIndex = nextPlayerIndex;

    console.log(`Turn rotated: ${nextPlayer.name} is now the painter.`);
}

function broadcastPainterUpdate(playerId, painterStatus) {
    // Update the painter status in the clients Map
    clients.forEach((clientData) => {
        if (clientData.id === playerId) {
            clientData.painter = painterStatus;
        }
    });

    // Broadcast the update to all clients
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(
                JSON.stringify({
                    type: "updatePainter",
                    playerId: playerId,
                    painter: painterStatus,
                })
            );
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
    const playersList = Array.from(clients.values()).map((client) => ({
        id: client.id,
        name: client.name,
        painter: client.painter || false,
    }));

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(
                JSON.stringify({
                    type: "updatePlayers",
                    players: playersList,
                })
            );
        }
    });
}

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
