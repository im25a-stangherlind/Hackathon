from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import json

app = FastAPI()


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict, sender: WebSocket = None):
        for connection in self.active_connections:
            if connection != sender:
                await connection.send_json(message)


manager = ConnectionManager()


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket)

    await manager.broadcast({"type": "join", "client_id": client_id}, sender=websocket)

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            await manager.broadcast(payload, sender=websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast({"type": "leave", "client_id": client_id})