const websocket = require("ws");
const express = require("express");
const path = require("path");
require("dotenv").config();
const fs = require("fs");

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

let words = [];

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
              isPainter ? "now the painter" : "no longer the painter"
            }`
          );
          break;
        case "startGame":
          console.log("Game started!");
          startGame(ws);
          break;
        case "wordChoices":
          if (playerData.painter) {
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

            document.body.appendChild(wordSelectionDiv);

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

                // Start the timer after word selection
                timeLeft = 60;
                document.querySelector("#timer").textContent = `${timeLeft}s`;

                const timerInterval = setInterval(() => {
                  timeLeft--;
                  ws.send(
                    JSON.stringify({
                      type: "timerUpdate",
                      timeLeft: timeLeft,
                    })
                  );

                  if (timeLeft <= 0) {
                    clearInterval(timerInterval);
                  }
                }, 1000);
              }
            });
          }
          break;
        case "wordSelected":
          console.log("Word selected, starting timer!");
          //Store selected word
          const currentWord = data.word;
          // Send word only to the painter

          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                  type: "currentWord",
                  word: currentWord,
                })
              );
            }
          });
          startTimer();
          break;
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
        case "rotateTurn":
          rotateTurn();
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

/******************************
 * LOAD WORDS FROM words.json *
 ******************************/
function loadWords() {
  try {
    const data = fs.readFileSync("words.json", "utf8");
    console.log("Raw file content:", data); // Debugging

    const parsedData = JSON.parse(data);

    // Select the words based on the desired language
    words = parsedData.englishWords || []; // Change to swedishWords if needed

    if (!Array.isArray(words)) {
      throw new Error(
        "Words data is not an array. Check words.json structure!"
      );
    }

    console.log(`Loaded ${words.length} words from words.json`);
  } catch (error) {
    console.error("Error loading words:", error);
    words = []; // Prevent crashing
  }
}

// Call this function once when the server starts
loadWords();

/***********************
 * CHOOSE A RANDOM WORD *
 ***********************/
function chooseWords() {
  // Get 3 random words from the words array
  const words = JSON.parse(fs.readFileSync("words.json")).englishWords;
  return words.sort(() => 0.5 - Math.random()).slice(0, 3);
}

/****************
 * START GAME *
 ****************/
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

  // Choose words and send to the first painter
  const wordChoices = chooseWords();
  const painterWs = Array.from(clients.entries()).find(
    ([socket, client]) => client.id === firstPlayer.id
  )?.[0];

  if (painterWs && painterWs.readyState === WebSocket.OPEN) {
    painterWs.send(
      JSON.stringify({
        type: "wordChoices",
        words: wordChoices,
      })
    );
  }

  // Update the painter status in the clients Map
  clients.forEach((clientData) => {
    clientData.painter = clientData.id === firstPlayer.id;
  });

  broadcastPlayers();
  broadcastPainterUpdate(firstPlayer.id, true);

  // Wait for word selection before starting timer
  wss.once("wordSelected", () => {
    startTimer();
  });
}

/*******************
 * STARTRT TIMER *
 *******************/
function startTimer() {
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
      rotateTurn();
    }
  }, 1000);
}

/*******************
 * ROTATE TURN *
 *******************/
function rotateTurn() {
  // clear canvas
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "clear",
        })
      );
    }
  });

  // First update the painter status
  const previousPlayer = players[currentTurnIndex];
  broadcastPainterUpdate(previousPlayer.id, false); // Remove painter status from current player

  // Rotate to next player
  currentTurnIndex = (currentTurnIndex + 1) % players.length;
  const currentPlayer = players[currentTurnIndex];
  broadcastPainterUpdate(currentPlayer.id, true); // Set new player as painter

  // Then send word choices to new painter
  const wordChoices = chooseWords();
  const painter = Array.from(clients.entries()).find(
    ([_, client]) => client.id === currentPlayer.id
  );

  if (painter) {
    painter[0].send(
      JSON.stringify({
        type: "wordChoices",
        words: wordChoices,
      })
    );
  }
}

/*********************************
 * BROADCAST PAINTER UPDATE *
 *********************************/
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

/*******************************************
 * BROADCAST WORD CHOICES TO PAINTER *
 *******************************************/
function broadcastWordChoicesToPainter(painter, words) {
  let painterWs = null;
  clients.forEach((clientData, ws) => {
    if (clientData.id === painter.id) {
      painterWs = ws;
    }
  });

  if (painterWs && painterWs.readyState === WebSocket.OPEN) {
    painterWs.send(
      JSON.stringify({
        type: "wordSelection",
        words: words, // Sending three words instead of one
      })
    );
  }
}

/*********************************
 * BROADCAST PLAYERS MESSAGES *
 *********************************/
function broadcast(message, sender) {
  const messageToSend =
    typeof message === "string" ? message : JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(messageToSend);
    }
  });
}

/*********************************
 * BROADCAST PLAYERS *
 *********************************/
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
