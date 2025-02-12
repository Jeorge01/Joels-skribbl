export function setupCanvas(canvas, strokeHistory, startDrawing, draw, stopDrawing) {
    if (!canvas) return;

    // const startDrawing = (e) => {
    //     // Your drawing start logic here
    // };

    // const draw = (e) => {
    //     // Your drawing logic here
    // };

    // const stopDrawing = () => {
    //     // Your stop drawing logic here
    // };

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

    // Cleanup function (optional if needed elsewhere)
    return () => {
        canvas.removeEventListener("mousedown", startDrawing);
        canvas.removeEventListener("mousemove", draw);
        canvas.removeEventListener("mouseup", stopDrawing);
        canvas.removeEventListener("mouseout", stopDrawing);
    };
}