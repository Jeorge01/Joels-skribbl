export function drawingUtils() {
    function drawLine(ctx, x0, y0, x1, y1, color, width) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.stroke();
    }

    function startDrawing(event, playerData, isDrawing, lastX, lastY) {
        if (!playerData.painter) return;
        isDrawing = true;
        [lastX, lastY] = [event.offsetX, event.offsetY];
        return {
            isDrawing,
            lastX,
            lastY,
        };
    }

    function draw(
        event,
        isDrawing,
        lastX,
        lastY,
        players,
        myPlayerId,
        currentBrushSize,
        currentColor,
        currentStroke,
        ws,
        ctx
    ) {
        const currentPainter = players.find((player) => player.painter);

        if (!currentPainter || currentPainter.id !== myPlayerId) {
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

        drawLine(ctx, lastX, lastY, event.offsetX, event.offsetY, currentColor, width);

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

        return [event.offsetX, event.offsetY];
    }

    function handleDraw(data, ctx, currentStroke, strokeHistory) {
        if (data.x0 != null && data.y0 != null && data.x1 != null && data.y1 != null && data.color && data.width) {
            drawLine(ctx, data.x0, data.y0, data.x1, data.y1, data.color, data.width);

            currentStroke.push({
                x0: data.x0,
                y0: data.y0,
                x1: data.x1,
                y1: data.y1,
                color: data.color,
                width: data.width,
            });

            // console.log("handleDraw called");
            // console.log("currentStroke:", currentStroke);
            // console.log("strokeHistory:", strokeHistory);

            return {
                currentStroke,
                strokeHistory,
            };
        }
    }

    function stopDrawing(isDrawing, currentStroke, strokeHistory) {
        // console.log("stopDrawing called");
        // console.log("isDrawing:", isDrawing);
        // console.log("currentStroke before push:", currentStroke);
        if (isDrawing && currentStroke.length > 0) {
            const newStroke = [...currentStroke];
            strokeHistory.push(newStroke);
            currentStroke.length = 0;
        }
        // console.log("strokeHistory after push:", strokeHistory);
        isDrawing = false;
        return {
            isDrawing,
            currentStroke,
        };
    }

    function handleUndo(strokeHistory, ctx, canvas) {

        console.log("---------------------");
        console.log("handleUndo called");
        console.log("strokeHistory:", strokeHistory);
        if (!strokeHistory) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        strokeHistory.forEach((stroke, strokeIndex) => {
            // console.log(`Redrawing stroke ${strokeIndex}:`, stroke);
            stroke.forEach((point, pointIndex) => {
                // console.log(`Redrawing point ${pointIndex} of stroke ${strokeIndex}:`, point);
                drawLine(ctx, point.x0, point.y0, point.x1, point.y1, point.color, point.width);
            });
        });
    }

    function undo(strokeHistory, ctx, canvas, ws) {
        // console.log("undo called");
        // console.log("strokeHistory before pop:", strokeHistory);
        if (strokeHistory.length === 0) return strokeHistory;
        // Remove the last stroke from the history
        // strokeHistory.pop();
        const removedStroke = strokeHistory.pop();
        // console.log("Removed stroke:", removedStroke);
        // console.log("strokeHistory after pop:", strokeHistory);

        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Redraw remaining strokes
        strokeHistory.forEach((stroke, strokeIndex) => {
            // console.log(`Redrawing stroke ${strokeIndex}:`, stroke);
            stroke.forEach((point, pointIndex) => {
                // console.log(`Redrawing point ${pointIndex} of stroke ${strokeIndex}:`, point);
                drawLine(ctx, point.x0, point.y0, point.x1, point.y1, point.color, point.width);
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

        return strokeHistory;
    }

    return {
        startDrawing,
        draw,
        drawLine,
        handleDraw,
        stopDrawing,
        handleUndo,
        undo,
    };
}
