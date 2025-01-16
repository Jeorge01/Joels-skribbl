let ws;
let isDrawing = false;
let canvas = document.querySelector('#gameCanvas');
let ctx = canvas.getContext('2d');
let lastX, lastY;
const PORT = 8888;

document.addEventListener('DOMContentLoaded', () => {
    const joinBtn = document.querySelector('#joinBtn');
    joinBtn.addEventListener('click', joinGame);
    setupCanvas();
});

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    startDrawing(touch);
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    draw(touch);
});

canvas.addEventListener('touchend', stopDrawing);

function joinGame() {
    console.log("joining game")
    const playerName = document.querySelector('#playerName').value;
    if (!playerName) return;

    ws = new WebSocket(`ws://localhost:${PORT}`);

    ws.onopen = () => {
        document.querySelector('.login-screen').style.display = 'none';
        document.querySelector('.game-container').style.display = 'flex';

        ws.send(JSON.stringify({
            type: 'join',
            name: playerName
        }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'draw') {
            drawLine(data.x0, data.y0, data.x1, data.y1, data.color, data.width);
        } else if (data.type === 'players') {
            updatePlayerList(data.players);
        }
    };
}

function setupCanvas() {
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
}

function startDrawing(event) {
    isDrawing = true;
    [lastX, lastY] = [event.offsetX, event.offsetY];
}

function draw(event) {
    if (!isDrawing) return;
    const color = document.querySelector('#colorPicker').value;
    const width = document.querySelector('#brushSize').value;

    drawLine(lastX, lastY, event.offsetX, event.offsetY, color, width);

    ws.send(JSON.stringify({
        type: 'draw',
        x0: lastX,
        y0: lastY,
        x1: event.offsetX,
        y1: event.offsetY,
        color: color,
        width: width
    }));

    [lastX, lastY] = [event.offsetX, event.offsetY];
}

function DrawLine(x0, y0, x1, y1, color, width) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
}

function stopDrawing() {
    isDrawing = false;
}

function updatePlayerList(players) {
    const playerList = document.querySelector('#players');
    playerList.innerHTML = players.map(player => `<li>${player}</li>`).join('');
}

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}

window.addEventListener('resize', resizeCanvas);

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ws.send(JSON.stringify({
        type: 'clear'
    }));
}