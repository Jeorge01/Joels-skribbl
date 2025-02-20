import { drawingUtils } from '../utils/drawingUtils.js';

export function setupCanvas(canvas, getStrokeHistory, startDrawing, draw, stopDrawing) {
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const drawingUtil = drawingUtils();

    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        const currentHistory = getStrokeHistory();
        currentHistory.forEach(stroke => {
            stroke.forEach(point => {
                drawingUtil.drawLine(ctx, point.x0, point.y0, point.x1, point.y1, point.color, point.width);
            });
        });
    }

    canvas.addEventListener("mousedown", startDrawing);
    canvas.addEventListener("mousemove", (e) => draw(e, ctx));
    canvas.addEventListener("mouseup", stopDrawing);
    canvas.addEventListener("mouseout", stopDrawing);

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    return {
        resizeCanvas
    };
}
