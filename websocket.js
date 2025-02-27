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
let currentWord = ""; // To store the current word
let usedWords = []; // To keep track of used words
let isGameInProgress = false; // To track if a game is in progress
let timeLeft = 0; // To store the remaining time

let words = [];

app.use(express.static(__dirname));

// Add a basic route for the root path
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

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
    handlePlayers(ws);
    console.log("New client connected");

    drawingHistory.forEach((drawData) => {
      ws.send(JSON.stringify(drawData));
      console.log("drawData", drawData);
    });

    ws.on("message", (message) => {
      const data = JSON.parse(message);
      // console.log('Server received:', data);

      switch (data.type) {
        case "join":
          handleJoin(ws, data);
          handlePlayers(ws);
          break;

        case "chat":
          broadcast(message.toString(), ws);
          console.log("Broadcasting chat message");
          break;

        case "draw":
          handleDraw(ws, data);
          break;

        case "clear":
          handleClear(ws, data);
          break;

        case "undo":
          handleUndo(ws, data);
          break;

        case "updatePainter":
          handleUpdatePainter(ws, data);
          break;

        case "startGame":
          startGame(ws);
          break;

        case "wordChoices":
          handleWordchoices(ws, data);
          break;

        case "wordSelected":
          handleWordSelected(ws, data);
          break;

        case "timerUpdate":
          handleTimerUpdate(ws, data);
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
    const disconnectedPlayer = clients.get(ws);
    console.log("Client disconnected");

    clients.delete(ws);
    handlePlayers(ws);
    players = Array.from(clients.values()); // Sync players array with clients Map

    if (
      isGameInProgress &&
      (players.length < 2 || players.every((player) => player.painter))
    ) {
      isGameInProgress = false;
      clearInterval(timerInterval);

      // Notify remaining clients to cancel word selection
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: "cancelWordSelection",
            })
          );
          // Reset painter status
          const playerData = clients.get(client);
          if (playerData) {
            playerData.painter = false;
          }
        }
      });
      rotateTurn();
    }

    broadcastPlayers();
  });
});

/******************************
 *       HANDLE JOIN          *
 ******************************/
function handleJoin(ws, data) {
  // Assuming each client sends a unique player ID
  const playerId = data.id || `player-${Date.now()}`; // Generate unique ID if not provided
  const playerName = data.name;

  // Store the new client information
  clients.set(ws, {
    name: playerName,
    id: playerId,
    painter: false,
    points: 0,
    knowsWord: false,
  });

  console.log(`${playerName} joined with ID: ${playerId}`);

  // Respond back with a message containing the player's ID
  ws.send(
    JSON.stringify({
      type: "join",
      playerId: playerId,
    })
  );

  // hides start game button if game is in progress
  ws.send(
    JSON.stringify({
      type: "gameProgress",
      isGameInProgress: isGameInProgress,
    })
  );

  // gets the current word if player joined after the painter chose the word
  ws.send(
    JSON.stringify({
      type: "currentWord",
      word: currentWord,
    })
  );

  // Broadcast the updated players list
  broadcastPlayers();
}

/******************************
 * HANDLE PLAYERS                *
 ******************************/
function handlePlayers(ws) {
  const previousPlayersList = Array.from(clients.values());
  const currentPlayersList = Array.from(clients.values());

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "players",
          players: currentPlayersList,
          previousPlayers: previousPlayersList,
        })
      );
    }
  });
}

/******************************
 * HANDLE GAME IN PROGRESS                *
 ******************************/
function isGameInProgressCheck(ws, data) {
  console.log("isGameInProgress", isGameInProgress);
  console.log("Checking if game is in progress...");
  if (isGameInProgress) {
    wss.clients.forEach((client) => {
      client.send(
        JSON.stringify({
          type: "gameProgress",
          isGameInProgress: true,
        })
      );
    });
    return true;
  }

  wss.clients.forEach((client) => {
    client.send(
      JSON.stringify({
        type: "gameProgress",
        isGameInProgress: false,
      })
    );
  });
  return false;
}

/******************************
 * HANDLE DRAW                *
 ******************************/
function handleDraw(ws, data) {
  drawingHistory.push(data);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      const stringifiedData = JSON.stringify(data); // Convert to JSON string
      client.send(stringifiedData);
      // console.log("Sending draw data:", stringifiedData);
    }
  });
}

/******************************
 * HANDLE CLEAR              *
 ******************************/
function handleClear(ws, data) {
  drawingHistory = [];
  wss.clients.forEach((client) => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "clear" }));
    }
  });
}

/******************************
 * HANDLE UNDO               *
 ******************************/
function handleUndo(ws, data) {
  console.log("Handling undo on websocket:", data.history);
  const updatedHistory = data.history.slice(0, -1);
  console.log("Updated history:", updatedHistory);
  drawingHistory = updatedHistory;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "undo",
          history: updatedHistory,
        })
      );
    }
  });
}

/******************************
 * HANDLE UPDATE PAINTER    *
 ******************************/
function handleUpdatePainter(ws, data) {
  const updatedPlayerId = data.playerId;
  const isPainter = data.painter;

  // Update the painter status in the clients Map
  clients.forEach((clientData, clientWs) => {
    if (clientData.id === updatedPlayerId) {
      clientData.painter = isPainter;
      clientData.knowsWord = isPainter;
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
}

/******************************
 * CALCULATE POINTS         *
 *  ******************************/

function calculatePoints(timeLeft) {
  const points = Math.max(0, 1200 - (60 - timeLeft) * 20);
  return points;
}

function checkWinCondition() {
  const winner =
    Array.from(clients.values()).length < 2 ||
    Array.from(clients.values()).find((player) => player.points >= 2000);
  if (winner) {
    // Sort players by points to get top 3
    const topPlayers = Array.from(clients.values())
      .sort((a, b) => b.points - a.points)
      .slice(0, 3)
      .map((player, index) => ({
        name: player.name,
        points: player.points,
        position: index + 1,
      }));

    wss.clients.forEach((client) => {
      client.send(
        JSON.stringify({
          type: "gameWon",
          podium: topPlayers,
          winner: winner.name,
          points: winner.points,
        })
      );
    });

    // Reset game state
    isGameInProgress = false;
    // Reset points
    clients.forEach((client) => (client.points = 0));
  }
}

/******************************
 * HANDLE WORD CHOICES      *
 ******************************/
function handleWordchoices(ws, data) {
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
}

/******************************
 * HANDLE WORD SELECTED    *
 ******************************/
function handleWordSelected(ws, data) {
  console.log("Word selected, starting timer!");

  //Store selected word
  currentWord = data.word;

  usedWords.push(currentWord);

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
}

/******************************
 * HANDLE TIMER UPDATE      *
 ******************************/
function handleTimerUpdate(ws, data) {
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
}
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
  const availableWords = words.filter((word) => !usedWords.includes(word));
  console.log("All words:", words);
  console.log("Available words:", availableWords);

  if (availableWords.length < 3) {
    usedWords = [];
    return words.sort(() => 0.5 - Math.random()).slice(0, 3);
  }
  return availableWords.sort(() => 0.5 - Math.random()).slice(0, 3);
}

/****************
 * START GAME *
 ****************/
function startGame(ws) {
  if (isGameInProgress) {
    ws.send(
      JSON.stringify({
        type: "gameError",
        message: "A game is already in progress",
      })
    );
    return;
  }

  players = Array.from(clients.values());
  if (players.length < 2) {
    ws.send(
      JSON.stringify({
        type: "gameError",
        message: "Need at least 2 players to start the game",
      })
    );
    return;
  }

  isGameInProgress = true;
  usedWords = [];

  isGameInProgressCheck();

  console.log("Game has started!");

  // Set the first player as the painter
  const firstPlayer = players[0];
  firstPlayer.painter = true;
  handleUpdatePainter(null, { playerId: firstPlayer.id, painter: true });

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
  timeLeft = 60;
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
      // Broadcast word reveal to all clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: "wordReveal",
              word: currentWord,
            })
          );
        }
      });
      rotateTurn();
    }
  }, 1000);
}

/*******************
 * ROTATE TURN *
 *******************/
function rotateTurn() {
  // Clear any existing timer interval
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  // Clear drawing history
  drawingHistory = [];

  // Check if there are players before proceeding
  if (!players.length) {
    return;
  }

  if (currentTurnIndex >= players.length) {
    currentTurnIndex = 0;
  }

  const previousPlayer = players[currentTurnIndex];
  // Only proceed with painter update if we have a valid player
  if (previousPlayer) {
    broadcastPainterUpdate(previousPlayer.id, false);
  }

  // Reset timer display for all clients
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "timerUpdate",
          timeLeft: 60,
        })
      );
    }
  });

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

  // Reset knowsWord for all players
  clients.forEach((clientData) => {
    clientData.knowsWord = false;
  });

  // First update the painter status
  // previousPlayer = players[currentTurnIndex];
  broadcastPainterUpdate(previousPlayer.id, false); // Remove painter status from current player

  // Rotate to next player
  currentTurnIndex = (currentTurnIndex + 1) % players.length;
  const currentPlayer = players[currentTurnIndex];

  checkWinCondition();

  if (!isGameInProgress) {
    currentPlayer.painter = false;
    broadcastPainterUpdate(currentPlayer.id, false);
    broadcastPlayers();
    return;
  }

  // Set new painter's knowsWord to true
  clients.forEach((clientData) => {
    if (clientData.id === currentPlayer.id) {
      clientData.knowsWord = true;
    }
  });

  broadcastPainterUpdate(currentPlayer.id, true); // Set new player as painter
  broadcastPlayers();

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
  const parsedMessage = JSON.parse(message);
  const senderData = clients.get(sender);
  console.log("parsedMessage", parsedMessage);
  console.log("senderData", senderData);

  if (
    parsedMessage.type === "chat" &&
    parsedMessage.message === currentWord &&
    senderData.painter
  ) {
    return;
  }

  if (parsedMessage.type === "chat" && parsedMessage.message === currentWord) {
    const guesserPoints = calculatePoints(timeLeft);

    clients.get(sender).points += guesserPoints;

    const painter = Array.from(clients.values()).find(
      (player) => player.painter
    );
    if (painter) {
      painter.points += Math.floor(guesserPoints * 0.5);
    }

    const hiddenMessage = {
      ...parsedMessage,
      isCorrectGuess: true,
      message: "✓ guessed correct!",
    };

    const revealedMessage = {
      ...parsedMessage,
      isCorrectGuess: true,
      message: `${currentWord} ✓ Correct!`,
    };

    // Send appropriate message version to each client
    wss.clients.forEach((client) => {
      const receiverData = clients.get(client);
      if (client.readyState === WebSocket.OPEN && client !== sender) {
        if (receiverData.knowsWord) {
          client.send(JSON.stringify(revealedMessage));
        } else {
          client.send(JSON.stringify(hiddenMessage));
        }
      }
    });

    // Update knowsWord status
    clients.forEach((clientData, ws) => {
      if (ws === sender) {
        clientData.knowsWord = true;
      }
    });

    // Check if all players know the word
    const allPlayersKnowWord = Array.from(clients.values()).every(
      (player) => player.knowsWord || player.painter
    );

    if (allPlayersKnowWord && timerInterval) {
      clearInterval(timerInterval);

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: "timerUpdate",
              timeLeft: 0,
            })
          );

          client.send(
            JSON.stringify({
              type: "wordReveal",
              word: currentWord,
            })
          );
        }
      });

      setTimeout(rotateTurn, 3000);
    }

    broadcastPlayers();
    return;
  }

  // Handle regular messages
  wss.clients.forEach((client) => {
    const receiverData = clients.get(client);
    if (!senderData.knowsWord || receiverData.knowsWord) {
      if (client.readyState === WebSocket.OPEN && client !== sender) {
        client.send(message);
      }
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
    points: client.points,
    knowsWord: client.knowsWord,
  }));

  console.log("Full Player Details:");
  playersList.forEach((player) => {
    console.log(`
            Player: ${player.name}
            ID: ${player.id}
            Points: ${player.points}
            Knows Word: ${player.knowsWord}
            Is Painter: ${player.painter}
            -------------------
        `);
  });

  // console.log("playersList", playersList);

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
