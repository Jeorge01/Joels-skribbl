let ws;
let isDrawing = false;
let canvas = document.querySelector("#gameCanvas");
let ctx = canvas.getContext("2d");
let lastX, lastY;
let playerName;
let currentColor = "#000000";
const PORT = window.CONFIG.PORT || 3000;
let strokeHistory = [];
let currentStroke = [];
let playerData = {
    painter: false,
};

document.addEventListener("DOMContentLoaded", () => {
    const joinForm = document.querySelector("#join-form");

    joinForm.addEventListener("submit", (e) => {
        e.preventDefault();
        joinGame();
    });

    setupCanvas();
});

document.querySelectorAll(".color-btn").forEach((btn) => {
    btn.style.backgroundColor = btn.dataset.color;
    btn.addEventListener("click", () => {
        document
            .querySelectorAll(".color-btn")
            .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentColor = btn.dataset.color;
    });
});

document.querySelector("#clearBtn").addEventListener("click", () => {
    if (!playerData.painter) return;
    clearCanvas();
});

document.querySelector("#undoBtn").addEventListener("click", () => {
    if (!playerData.painter) return;
    undo();
});

canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    startDrawing(touch);
});

canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    draw(touch);
});

canvas.addEventListener("touchend", stopDrawing);

document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "z") {
        undo();
    }
});

function joinGame() {
    console.log("joining game");
    playerName = document.querySelector("#playerName").value;
    if (!playerName) return;
    let previousPlayers = [];

    const playerId = `${playerName}_${Date.now()}`;

    const wsUrl = `ws://${window.location.hostname}:8888`;
    console.log("Connecting to:", wsUrl);

    try {
        ws = new WebSocket(wsUrl);

        ws.onerror = (error) => {
            console.log("WebSocket Error:", error);
        };

        ws.onopen = () => {
            if (ws.readyState === WebSocket.OPEN) {
                document.querySelector(".login-screen").style.display = "none";
                document.querySelector(".game-container").style.display =
                    "flex";
                document.querySelector("#chatInput").focus();

                const sendBtn = document.querySelector("#sendBtn");
                sendBtn.addEventListener("click", sendMessage);

                playerData.painter = true;

                ws.send(
                    JSON.stringify({
                        type: "join",
                        name: playerName,
                        id: playerId,
                        status: "connected",
                        painter: playerData.painter
                    })
                );
            }
        };

        // Rest of your ws.onmessage handler remains the same
    } catch (error) {
        console.log("Connection Error:", error);
    }

    ws.onmessage = (event) => {
        try {
            console.log("Raw received data:", event.data);

            const decodedData =
                typeof event.data === "string"
                    ? event.data // Already a string
                    : new TextDecoder().decode(event.data); // Decode binary Buffer

            const data = JSON.parse(decodedData); // Parse JSON string
            // console.log("Decoded and parsed data:", data);

            // Handle message types
            switch (data.type) {
                case "draw":
                    handleDraw(data);
                    break;
                case "players":
                    handlePlayers(data);
                    break;
                case "chat":
                    handleChat(data);
                    break;
                case "clear":
                    clearCanvas(); // Clear the canvas on receiving a clear message
                    break;
                case "undo":
                    strokeHistory = data.history;
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    strokeHistory.forEach((stroke) => {
                        stroke.forEach((point) => {
                            drawLine(
                                point.x0,
                                point.y0,
                                point.x1,
                                point.y1,
                                point.color,
                                point.width
                            );
                        });
                    });
                    break;
                case "updatePainter":
                    playerData.painter = data.painter;
                    // Optional: Update UI to show painter status
                    if (!playerData.painter) {
                        canvas.style.cursor = "not-allowed";
                    } else {
                        canvas.style.cursor = "crosshair";
                    }
                    break;
                default:
                    console.warn("Unknown message type received:", data.type);
            }
        } catch (error) {
            console.error(
                "Error parsing or handling WebSocket message:",
                error,
                event.data
            );
        }
    };

    // Helper function to handle "draw" messages
    function handleDraw(data) {
        if (
            data.x0 != null &&
            data.y0 != null &&
            data.x1 != null &&
            data.y1 != null &&
            data.color &&
            data.width
        ) {
            drawLine(
                data.x0,
                data.y0,
                data.x1,
                data.y1,
                data.color,
                data.width
            );
        } else {
            console.warn("Invalid draw data:", data);
        }
    }

    // Helper function to handle "players" messages
    function handlePlayers(data) {

        console.log("Current players and their painter status:", data.players);
    data.players.forEach(player => {
        console.log(`Player: ${player.name}, Painter: ${playerData.painter}`);
    });

        const chatBox = document.querySelector(".chat-box");

        if (!Array.isArray(data.players)) {
            console.warn("Invalid players data:", data);
            return;
        }

        if (data.players.length > previousPlayers.length) {
            const newPlayer = data.players[data.players.length - 1];
            chatBox.innerHTML += `<li class="connection-message"><span>${newPlayer.name} has connected</span></li>`;
        } else if (data.players.length < previousPlayers.length) {
            const disconnectedPlayer = previousPlayers.find(
                (prevPlayer) =>
                    !data.players.some(
                        (currentPlayer) => currentPlayer.id === prevPlayer.id
                    )
            );
            if (disconnectedPlayer) {
                chatBox.innerHTML += `<li class="disconnection-message"><span>${disconnectedPlayer.name} has disconnected</span></li>`;
            }
        }

        updatePlayerList(data.players);
        previousPlayers = [...data.players];
    }

    // Helper function to handle "chat" messages
    function handleChat(data) {
        const chatBox = document.querySelector(".chat-box");
        const timeOptions = { hour: "2-digit", minute: "2-digit" };

        if (!data.sender || !data.message || !data.timestamp) {
            console.warn("Invalid chat data:", data);
            return;
        }

        const localTime = new Date(data.timestamp).toLocaleTimeString(
            [],
            timeOptions
        );
        chatBox.innerHTML += `<li><span>${
            data.sender
        }${" "}</span><span>${localTime}${" "}</span><span>${
            data.message
        }${" "}</span></li>`;
    }

    window.addEventListener("beforeunload", () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
                JSON.stringify({
                    type: "status",
                    name: playerName,
                    id: playerId,
                    status: "disconnected",
                })
            );
        }
    });
}

function setupCanvas() {
    canvas.addEventListener("mousedown", startDrawing);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", stopDrawing);
    canvas.addEventListener("mouseout", stopDrawing);
}

function sendMessage(e) {
    e.preventDefault();
    const chatInput = document.querySelector("#chatInput");
    const message = chatInput.value;
    const timestamp = Date.now();

    if (!message) return;

    const chatBox = document.querySelector(".chat-box");
    const timeOptions = { hour: "2-digit", minute: "2-digit" };
    chatBox.innerHTML += `<li><span>${playerName}${" "}</span><span>${new Date().toLocaleTimeString(
        [],
        timeOptions
    )}${" "}</span><span>${message}${" "}</span></li>`;
    console.log("Sending chat message:", message);

    ws.send(
        JSON.stringify({
            type: "chat",
            message: message,
            sender: playerName,
            timestamp: timestamp,
        })
    );

    chatInput.value = "";
}

function startDrawing(event) {
    if (!playerData.painter) return;
    isDrawing = true;
    [lastX, lastY] = [event.offsetX, event.offsetY];
}

function draw(event) {
    if (!playerData.painter) return;
    if (!isDrawing) return;
    const width = document.querySelector("#brushSize").value;

    currentStroke.push({
        x0: lastX,
        y0: lastY,
        x1: event.offsetX,
        y1: event.offsetY,
        color: currentColor,
        width: width,
    });

    drawLine(lastX, lastY, event.offsetX, event.offsetY, currentColor, width);

    ws.send(
        JSON.stringify({
            type: "draw",
            x0: lastX,
            y0: lastY,
            x1: event.offsetX,
            y1: event.offsetY,
            color: currentColor,
            width: width,
        })
    );

    [lastX, lastY] = [event.offsetX, event.offsetY];
}

function drawLine(x0, y0, x1, y1, color, width) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.stroke();
}

function stopDrawing() {
    if (isDrawing && currentStroke.length > 0) {
        strokeHistory.push([...currentStroke]);
        currentStroke = [];
    }
    isDrawing = false;
}

function updatePlayerList(players) {
    const playerList = document.querySelector("#players");
    playerList.innerHTML = players
        .map(
            (player) =>
                `<li>${player.name} ${playerData.painter ? "(Painter)" : ""}</li>`
        )
        .join("");
}

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}

window.addEventListener("resize", resizeCanvas);

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Only send the clear message if we initiated the clear
    if (event && event.type === "click") {
        ws.send(
            JSON.stringify({
                type: "clear",
            })
        );
    }
}

function undo() {
    if (strokeHistory.length === 0) return;

    // Removes the last stroke from the canvas
    strokeHistory.pop();

    //clears the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Redraws remaining strokes
    strokeHistory.forEach((stroke) => {
        stroke.forEach((point) => {
            drawLine(
                point.x0,
                point.y0,
                point.x1,
                point.y1,
                point.color,
                point.width
            );
        });
    });

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
            JSON.stringify({
                type: "undo",
                history: strokeHistory,
            })
        );
    }
}
