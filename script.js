let ws;
let isDrawing = false;
let canvas = document.querySelector("#gameCanvas");
let ctx = canvas.getContext("2d");
let lastX, lastY;
let playerName;
let currentColor = "#000000";
let currentBrushSize = 8;
// const PORT = window.CONFIG.PORT || 3000;
let strokeHistory = [];
let currentStroke = [];
let playerData = {
    painter: false,
};
let gameInterval;
let turnDuration = 60000; // 1 minute in milliseconds
let timerDisplay;
let timeLeft;

let players = [];
let currentTurnIndex = 0;
let myPlayerId = null;
let words = [];
let currentWord = null;
// let wordSelectionDiv = document.querySelector(".word-selection");
let isGameInProgress = false;
let previousPlayers = [];
const chatBox = document.querySelector(".chat-box");

let isSpacePressed = false;

document.addEventListener("DOMContentLoaded", () => {
    const joinForm = document.querySelector("#join-form");

    // Fetch words from words.json
    fetch("words.json")
        .then((response) => response.json())
        .then((data) => {
            words = data.englishWords;
            // console.log("Words loaded:", words);
        });

    joinForm.addEventListener("submit", (e) => {
        e.preventDefault();
        joinGame();
    });

    setupCanvas();
});

document.querySelectorAll(".color-btn").forEach((btn) => {
    btn.style.backgroundColor = btn.dataset.color;
    btn.addEventListener("click", () => {
        document.querySelectorAll(".color-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentColor = btn.dataset.color;
    });
});

// Add this after your existing color button event listeners
document.querySelectorAll('.brush-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.brush-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentBrushSize = parseInt(btn.dataset.size);
    });
});

document.addEventListener('keydown', (e) => {
    // Only enable space drawing if not focused on chat input
    if (e.code === 'Space' && !isSpacePressed && document.activeElement !== document.querySelector('#chatInput')) {
        e.preventDefault();
        isSpacePressed = true;
        isDrawing = true;
        [lastX, lastY] = [e.offsetX, e.offsetY];
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        isSpacePressed = false;
        isDrawing = false;
    }
});



document.querySelector("#clearBtn").addEventListener("click", () => {
    if (!playerData.painter) return;
    clearCanvas();
});

document.querySelector("#undoBtn").addEventListener("click", () => {
    if (!playerData.painter) return;
    undo();
});

document.querySelector("#startGameBtn").addEventListener("click", () => {
    startGameTurns();
    // console.log("Starting game turns");
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

/******************************
 * HANDLE JOIN GAME    *
 ******************************/

function joinGame() {
    // console.log("joining game");

    playerName = document.querySelector("#playerName").value;
    if (!playerName) return;

    const playerId = `${playerName}_${Date.now()}`;

    const wsUrl = `ws://localhost:8888`;
    // const wsUrl = `wss://shark-app-4w9xh.ondigitalocean.app`;
    console.log("Connecting to:", wsUrl);

    try {
        ws = new WebSocket(wsUrl);

        ws.onerror = (error) => {
            console.log("WebSocket Error:", error);
        };

        ws.onopen = () => {
            if (ws.readyState === WebSocket.OPEN) {
                document.querySelector(".login-screen").style.display = "none";
                document.querySelector(".game-container").style.display = "flex";
                document.querySelector("#chatInput").focus();

                setTimeout(() => {
                    resizeCanvas();
                }, 100);

                const sendBtn = document.querySelector("#sendBtn");
                sendBtn.addEventListener("click", sendMessage);

                // playerData.painter = true;

                ws.send(
                    JSON.stringify({
                        type: "join",
                        name: playerName,
                        id: playerId,
                        status: "connected",
                        painter: playerData.painter,
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
            // console.log("Raw received data:", event.data);

            const decodedData =
                typeof event.data === "string"
                    ? event.data // Already a string
                    : new TextDecoder().decode(event.data); // Decode binary Buffer

            const data = JSON.parse(decodedData); // Parse JSON string
            // console.log("Decoded and parsed data:", data);

            // console.log("Received message type:", data.type); // Add this line

            // Handle message types
            switch (data.type) {
                case "join":
                    // Set the player's unique ID when they join
                    myPlayerId = data.playerId;
                    // console.log("Player joined with ID:", myPlayerId);
                    break;

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
                    handleUndo(data);
                    break;

                case "updatePainter":
                    handleUpdatePainter(data);
                    break;

                case "startGame":
                    startGameTurns(); // Start the game turns on receiving the game start signal
                    break;

                case "gameProgress":
                    handleGameProgress(data);
                    break;

                case "gameWon":
                    handleGameWon(data);
                    break;

                case "timerUpdate":
                    handleTimerUpdate(data);
                    break;

                case "updatePlayers":
                    handleUpdatePlayers(data);
                    break;

                case "wordChoices":
                    handleWordChoices(data);
                    break;

                case "currentWord":
                    handleCurrentWord(data);
                    break;

                case "wordReveal":
                    handleWordReveal(data);
                    break;
                case "cancelWordSelection":
                    cancelWordSelection();
                    break;
                case "gameError":
                    alert(data.message);
                    break;

                default:
                    console.warn("Unknown message type received:", data.type);
            }
        } catch (error) {
            console.error("Error parsing or handling WebSocket message:", error, event.data);
        }
    };

    // Helper function to handle "draw" messages
    function handleDraw(data) {
        if (data.x0 != null && data.y0 != null && data.x1 != null && data.y1 != null && data.color && data.width) {
            drawLine(data.x0, data.y0, data.x1, data.y1, data.color, data.width);
        } else {
            console.warn("Invalid draw data:", data);
        }
    }

    // Helper function to handle "players" messages
    function handlePlayers(data) {
        // console.log("Raw players data received:", data);
        // console.log("Previous players:", previousPlayers);

        if (!Array.isArray(data.players)) {
            console.warn("Invalid players data:", data);
            return;
        }

        // console.log("Current players and their painter status:", data.players);
        // data.players.forEach((player) => {
        //     console.log(`Player: ${player.name}, Painter: ${player.painter}`);
        // });

        const chatBox = document.querySelector(".chat-box");

        if (data.players.length > previousPlayers.length) {
            const newPlayer = data.players.find(
                (player) => !previousPlayers.some((prevPlayer) => prevPlayer.id === player.id)
            );
            if (newPlayer) {
                chatBox.innerHTML += `<li class="connection-message"><span>${newPlayer.name} has connected</span></li>`;
            }
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
    }

    // Helper function to handle "chat" messages
    function handleChat(data) {
        // console.log("Received chat message:", data);

        let correctOrNot = "";
        if (data.isCorrectGuess === true) {
            correctOrNot = "correct";
        }

        const chatBox = document.querySelector(".chat-box");
        const timeOptions = { hour: "2-digit", minute: "2-digit" };

        if (!data.sender || !data.message || !data.timestamp) {
            console.warn("Invalid chat data:", data);
            return;
        }

        const localTime = new Date(data.timestamp).toLocaleTimeString([], timeOptions);
        chatBox.innerHTML += `<li class="message ${correctOrNot}">
            <span> 
                <span class="player">${data.sender} </span>
                <span class="time">${localTime} </span>
            </span>
            <span class="player-message">${data.message} </span>
        </li>`;
        scrollToBottom();
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
    resizeCanvas();
}

function sendMessage(e) {
    e.preventDefault();
    const chatInput = document.querySelector("#chatInput");
    const message = chatInput.value;
    const timestamp = Date.now();

    if (!message) return;

    if (playerData.painter && message === currentWord) {
        chatInput.value = "";
        return;
    }

    const chatBox = document.querySelector(".chat-box");
    const timeOptions = { hour: "2-digit", minute: "2-digit" };

    let correctOrNot = "";
    let displayMessage = message;

    if (message === currentWord) {
        correctOrNot = "correct";
        displayMessage = `${currentWord} ✓ Correct!`;
    }

    chatBox.innerHTML += `<li class="message ${correctOrNot}">
        <span> 
            <span class="player">${playerName} </span>
            <span class="time">${new Date().toLocaleTimeString([], timeOptions)} </span>
        </span>
        <span class="player-message">${displayMessage}</span>
    </li>`;
    scrollToBottom();

    ws.send(
        JSON.stringify({
            type: "chat",
            message: message,
            sender: playerName,
            timestamp: timestamp,
        })
    );

    chatInput.value = "";
    scrollToBottom();
    // console.log("scrollToBottom");
}

function startDrawing(event) {
    if (!playerData.painter) return;
    isDrawing = true;
    [lastX, lastY] = [event.offsetX, event.offsetY];
}

function draw(event) {
    // console.log("players", players);
    // console.log("myPlayerId", myPlayerId);
    const currentPainter = players.find((player) => player.painter);

    // Check if the current user is the painter
    if (!currentPainter || currentPainter.id !== myPlayerId) {
        // console.warn("You are not the painter!");
        return;
    }

    if (!isDrawing) return;
    const width = currentBrushSize;

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

function handleUndo(data) {
    strokeHistory = data.history;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokeHistory.forEach((stroke) => {
        stroke.forEach((point) => {
            drawLine(point.x0, point.y0, point.x1, point.y1, point.color, point.width);
        });
    });
}

function scrollToBottom(force = false) {
    // Check if user is at the bottom before adding new messages
    const atBottom = chatBox.scrollHeight - chatBox.scrollTop === chatBox.clientHeight;

    // Only scroll if the user was already at the bottom
    if (atBottom || force) {
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

function handleUpdatePainter(data) {
    // console.log("players", players);
    const updatedPlayerId = data.playerId;
    const isPainter = data.painter;

    // Find the player and update their painter status
    const playerIndex = players.findIndex((player) => player.id === updatedPlayerId);
    if (playerIndex !== -1) {
        players[playerIndex].painter = isPainter; // Update status
    }

    // Check if this client is the painter
    if (updatedPlayerId === myPlayerId) {
        playerData.painter = isPainter;

        if (!isPainter) {
            const wordDisplay = document.getElementById("current-word");
            if (wordDisplay) {
                wordDisplay.remove();
            }
        }
    }

    // console.log("Painter updated:", players);
    // console.log("Am I the painter?", playerData.painter);

    updatePlayerList(players); // Refresh UI
    // console.log("players again", players);
}

function handleTimerUpdate(data) {
    // console.log("Timer updated:", data.timeLeft); // Log the updated timer
    // Update the DOM with the new time
    document.querySelector("#timer").textContent = `${data.timeLeft}s`;
}

function updatePlayerList(players) {
    const playerList = document.querySelector("#players");
    // console.log("Updating player list with:", players);

    const generatedHTML = players
        .map(
            (player) =>
                `<li data-player-id="${player.id}" ${player.painter ? 'class="painter"' : ""}><span><span>${player.name
                }</span> <span>${player.painter ? "(Painter)" : ""}</span></span><span>${player.points
                } Points</span></li>`
        )
        .join("");

    // console.log("Generated HTML:", generatedHTML);
    playerList.innerHTML = generatedHTML;
}

function handleUpdatePlayers(data) {
    players = data.players;

    // If myPlayerId is not set, find and set it
    if (!myPlayerId) {
        const me = players.find((player) => player.name === myName); // Match by name or another unique identifier
        if (me) {
            myPlayerId = me.id;
            // console.log("My Player ID set from players list:", myPlayerId);
        }
    }

    updatePlayerList(players);
}

function handleWordChoices(data) {
    // console.log("wordchoices script.js", data);
    const currentPainter = players.find((player) => player.painter);
    if (currentPainter && currentPainter.id === myPlayerId) {
        const drawingArea = document.querySelector(".drawing-area");
        const wordSelectionDiv = document.createElement("div");
        wordSelectionDiv.className = "word-selection";
        wordSelectionDiv.innerHTML = `
                                <div class="word-selection-container">
                                    <h3>Choose a word to draw:</h3>
                                    <div class="word-buttons">
                                        ${data.words
                .map(
                    (word) => `
                                            <button class="word-choice">${word}</button>
                                        `
                )
                .join("")}
                                    </div>
                                </div>
                            `;

        drawingArea.appendChild(wordSelectionDiv);

        wordSelectionDiv.addEventListener("click", (e) => {
            if (e.target.classList.contains("word-choice")) {
                const selectedWord = e.target.textContent;
                ws.send(
                    JSON.stringify({
                        type: "wordSelected",
                        word: selectedWord,
                    })
                );
                wordSelectionDiv.remove();
            }
        });
    }
}

function handleCurrentWord(data) {
    currentWord = data.word;
    // console.log("Current word:", currentWord);
    if (playerData.painter) {
        // Create or update word display element

        const wordDisplay = document.createElement("div");
        wordDisplay.id = "current-word";
        wordDisplay.className = "current-word";
        wordDisplay.textContent = `Word to draw: ${data.word}`;
        wordDisplay.style.cssText =
            "position: fixed; top: 10px; left: 50%; transform: translateX(-50%); background: #fff; padding: 10px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);";

        // Remove existing word display if any
        const existingDisplay = document.getElementById("current-word");
        if (existingDisplay) {
            existingDisplay.remove();
        }

        document.body.appendChild(wordDisplay);
    }
}

function handleWordReveal(data) {
    const wordReveal = document.createElement("div");
    wordReveal.className = "word-reveal";
    wordReveal.innerHTML = `<h3>The word was: ${data.word}</h3>`;
    wordReveal.style.cssText =
        "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); z-index: 1000;";

    document.body.appendChild(wordReveal);

    // Remove the reveal after 3 seconds
    setTimeout(() => {
        wordReveal.remove();
    }, 5000);
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

function handleGameProgress(data) {
    const startGameBtn = document.querySelector("#startGameBtn");
    // console.log("isGameInProgress", data.isGameInProgress);
    if (data.isGameInProgress) {
        startGameBtn.style.display = "none";
    } else {
        startGameBtn.style.display = "block";
    }
}

function handleGameWon(data) {
    const winnerDisplay = createWinnerElement(data);
    document.body.appendChild(winnerDisplay);
    resetGameState();
    scheduleWinnerDisplayRemoval(winnerDisplay);
}

function cancelWordSelection(data) {
    const wordSelectionDiv = document.querySelector(".word-selection");
    if (wordSelectionDiv) {
        wordSelectionDiv.remove();
    }
}

function createWinnerElement(data) {
    const winnerDisplay = document.createElement("div");
    winnerDisplay.className = "winner-display";

    const winnerName = data.podium.find(player => player.position === 1)?.name || "No winner??";

    const podiumHTML = data.podium
        .map(
            (player) => `
    <div class="podium-position">
      ${player.position === 1 ? "🥇" : player.position === 2 ? "🥈" : "🥉"}
      <p>${player.name}</p>
      <p>${player.points} points</p>
    </div>
  `
        )
        .join("");

    winnerDisplay.innerHTML = `
    <div class="winner-container">
      <h2>🏆 Game Over! 🏆</h2>
      <h3>${winnerName} wins!</h3>
      <div class="podium">
        ${podiumHTML}
      </div>
    </div>
  `;

    winnerDisplay.style.cssText =
        "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); z-index: 1000; text-align: center;";
    return winnerDisplay;
}

function resetGameState() {
    isGameInProgress = false;
    document.querySelector("#startGameBtn").style.display = "block";
}

function scheduleWinnerDisplayRemoval(element) {
    setTimeout(() => {
        element.remove();
    }, 5000);
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
            drawLine(point.x0, point.y0, point.x1, point.y1, point.color, point.width);
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

function chooseWords() {
    // console.log("Choosing words...");
    return new Promise((resolve) => {
        const randomWords = words.sort(() => 0.5 - Math.random()).slice(0, 3);

        if (playerData.painter) {
            const drawingArea = document.querySelector(".drawing-area");
            const wordSelectionDiv = document.createElement("div");
            wordSelectionDiv.className = "word-selection";
            wordSelectionDiv.innerHTML = `
                <div class="word-selection-container">
                    <h3>Choose a word to draw:</h3>
                    <div class="word-buttons">
                        ${randomWords
                    .map(
                        (word) => `
                            <button class="word-choice">${word}</button>
                        `
                    )
                    .join("")}
                    </div>
                </div>
            `;

            drawingArea.appendChild(wordSelectionDiv);

            const handleWordSelection = (e) => {
                if (e.target.classList.contains("word-choice")) {
                    const selectedWord = e.target.textContent;
                    ws.send(
                        JSON.stringify({
                            type: "wordSelected",
                            word: selectedWord,
                        })
                    );
                    wordSelectionDiv.remove();
                    resolve();
                }
            };

            wordSelectionDiv.addEventListener("click", handleWordSelection);
        } else {
            // For non-painters, resolve immediately
            resolve();
        }
    });
}

async function startGameTurns() {
    // console.log(players);
    if (isGameInProgress) return;

    // Wait for word choices from server
    // Timer will only start after word is selected
    ws.send(
        JSON.stringify({
            type: "startGame",
        })
    );
}
async function rotateTurn() {
    if (players.length === 0) return;

    const previousPlayerId = players[currentTurnIndex].id;
    ws.send(
        JSON.stringify({
            type: "updatePainter",
            playerId: previousPlayerId,
            painter: false,
        })
    );

    currentTurnIndex = (currentTurnIndex + 1) % players.length;

    const newPlayerId = players[currentTurnIndex].id;
    ws.send(
        JSON.stringify({
            type: "updatePainter",
            playerId: newPlayerId,
            painter: true,
        })
    );

    await chooseWords();
}
