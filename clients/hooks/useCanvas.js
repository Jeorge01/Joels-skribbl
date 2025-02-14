export function setupCanvas(canvas, strokeHistory, startDrawing, draw, stopDrawing) {
    if (!canvas) return;

    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    
        strokeHistory.forEach(stroke => {
            stroke.forEach(point => {
                drawLine(point.x0, point.y0, point.x1, point.y1, point.color, point.width);
            });
        });
        
    }

    window.addEventListener("resize", resizeCanvas);

    // Attach event listeners
    canvas.addEventListener("mousedown", startDrawing);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", stopDrawing);
    canvas.addEventListener("mouseout", stopDrawing);

    resizeCanvas();

    return {
        resizeCanvas
      };
}