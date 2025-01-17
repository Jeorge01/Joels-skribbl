let ws;
let isDrawing = false;
let canvas = document.querySelector("#gameCanvas");
let ctx = canvas.getContext("2d");
let lastX, lastY;
let playerName;
const PORT = 8888;

document.addEventListener("DOMContentLoaded", () => {
    const joinForm = document.querySelector("#join-form");

    joinForm.addEventListener("submit", (e) => {
        e.preventDefault();
        joinGame();
    });

    setupCanvas();
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

function joinGame() {
    console.log("joining game");
    playerName = document.querySelector("#playerName").value;
    if (!playerName) return;
    let previousPlayers = [];

    const playerId = `${playerName}_${Date.now()}`;

    try {
        ws = new WebSocket(`ws://localhost:${PORT}`);

        ws.onerror = (error) => {
            console.log('WebSocket Error:', error);
        };

        ws.onopen = () => {
            if (ws.readyState === WebSocket.OPEN) {
                document.querySelector(".login-screen").style.display = "none";
                document.querySelector(".game-container").style.display = "flex";
                document.querySelector("#chatInput").focus();

                const sendBtn = document.querySelector("#sendBtn");
                sendBtn.addEventListener("click", sendMessage);

                ws.send(
                    JSON.stringify({
                        type: "join",
                        name: playerName,
                        id: playerId,
                        status: "connected",
                    })
                );
            }
        };

        // Rest of your ws.onmessage handler remains the same
    } catch (error) {
        console.log('Connection Error:', error);
    }

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("Received:", data);

        if (data.type === "draw") {
            drawLine(data.x0, data.y0, data.x1, data.y1, data.color, data.width);
        } else if (data.type === "players") {
            const chatBox = document.querySelector(".chat-box");

            if (data.players.length > previousPlayers.length) {
                const newPlayer = data.players[data.players.length - 1];
                chatBox.innerHTML += `<li class="connection-message"><span>${newPlayer.name} has connected</span></li>`;
            } else if (data.players.length < previousPlayers.length) {
                const disconnectedPlayer = previousPlayers.find(
                    (prevPlayer) => !data.players.some((currentPlayer) => currentPlayer.id === prevPlayer.id)
                );
                if (disconnectedPlayer) {
                    chatBox.innerHTML += `<li class="disconnection-message"><span>${disconnectedPlayer.name} has disconnected</span></li>`;
                }
            }

            updatePlayerList(data.players);
            previousPlayers = [...data.players];
        } else if (data.type === "chat") {
            const chatBox = document.querySelector(".chat-box");
            const timeOptions = { hour: "2-digit", minute: "2-digit" };
            const localTime = new Date(data.timestamp).toLocaleTimeString([], timeOptions);
            chatBox.innerHTML += `<li><span>${data.sender}${" "}</span><span>${localTime}${" "}</span><span>${
                data.message
            }${" "}</span></li>`;
        }
    };

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
    isDrawing = true;
    [lastX, lastY] = [event.offsetX, event.offsetY];
}

function draw(event) {
    if (!isDrawing) return;
    const color = document.querySelector("#colorPicker").value;
    const width = document.querySelector("#brushSize").value;

    drawLine(lastX, lastY, event.offsetX, event.offsetY, color, width);

    ws.send(
        JSON.stringify({
            type: "draw",
            x0: lastX,
            y0: lastY,
            x1: event.offsetX,
            y1: event.offsetY,
            color: color,
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
    isDrawing = false;
}

function updatePlayerList(players) {
    const playerList = document.querySelector("#players");
    playerList.innerHTML = players.map((player) => `<li>${player.name}</li>`).join("");
}

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}

window.addEventListener("resize", resizeCanvas);

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ws.send(
        JSON.stringify({
            type: "clear",
        })
    );
}
