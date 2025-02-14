export function setupChat(chatBox) {
  let ws = null;

  function setWebSocket(WebSocket) {
    ws = WebSocket;
  }

  function scrollToBottom(force = false) {
    const atBottom =
      chatBox.scrollHeight - chatBox.scrollTop === chatBox.clientHeight;
    if (atBottom || force) {
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  }

  function sendMessage(playerName, currentWord, playerData) {
    const chatInput = document.querySelector("#chatInput");
    const message = chatInput.value;
    const timestamp = Date.now();

    if (!message) return;

    if (playerData.painter && message === currentWord) {
      chatInput.value = "";
      return;
    }

    const timeOptions = { hour: "2-digit", minute: "2-digit" };
    let correctOrNot = "";
    let displayMessage = message;

    if (message === currentWord) {
      correctOrNot = "correct";
      displayMessage = `${currentWord} ✓ Correct!`;
    }

    chatBox.innerHTML += `
            <li class="message ${correctOrNot}">
                <span> 
                    <span class="player">${playerName}</span>
                    <span class="time">${new Date().toLocaleTimeString(
                      [],
                      timeOptions
                    )}</span>
                </span>
                <span class="player-message">${displayMessage}</span>
            </li>`;

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
  }

  function handleChat(data) {
    let correctOrNot = data.isCorrectGuess ? "correct" : "";
    const timeOptions = { hour: "2-digit", minute: "2-digit" };
    const localTime = new Date(data.timestamp).toLocaleTimeString(
      [],
      timeOptions
    );

    chatBox.innerHTML += `
            <li class="message ${correctOrNot}">
                <span> 
                    <span class="player">${data.sender}</span>
                    <span class="time">${localTime}</span>
                </span>
                <span class="player-message">${data.message}</span>
            </li>`;
    scrollToBottom();
  }

  return {
    setWebSocket,
    sendMessage,
    handleChat,
  };
}
