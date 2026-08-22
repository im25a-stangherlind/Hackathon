import json
import random
from typing import Dict, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Player:
    def __init__(self, client_id: str, websocket: WebSocket):
        self.client_id: str = client_id
        self.websocket: WebSocket = websocket
        self.role: Optional[str] = None
        self.is_found: bool = False


class GameManager:
    def __init__(self):
        self.players: Dict[str, Player] = {}
        self.game_active: bool = False

    async def connect(self, client_id: str, websocket: WebSocket):
        await websocket.accept()
        self.players[client_id] = Player(client_id, websocket)
        await self.broadcast({
            "type": "player_joined",
            "client_id": client_id,
            "player_count": len(self.players)
        })
        await self.broadcast_player_list()

    async def disconnect(self, client_id: str):
        if client_id in self.players:
            del self.players[client_id]
            if len(self.players) == 0:
                self.game_active = False

            await self.broadcast({
                "type": "player_left",
                "client_id": client_id,
                "player_count": len(self.players),
                "remaining_hiders": self.count_remaining_hiders()
            })
            await self.broadcast_player_list()

    async def send_to(self, client_id: str, message: dict):
        if client_id in self.players:
            try:
                await self.players[client_id].websocket.send_json(message)
            except Exception:
                pass

    async def broadcast(self, message: dict, exclude_client_id: Optional[str] = None):
        for cid, player in list(self.players.items()):
            if cid != exclude_client_id:
                try:
                    await player.websocket.send_json(message)
                except Exception:
                    pass

    def count_remaining_hiders(self) -> int:
        return sum(1 for p in self.players.values() if p.role == "verstecker" and not p.is_found)

    async def broadcast_player_list(self):
        player_data = [
            {
                "client_id": p.client_id,
                "role": p.role,
                "is_found": p.is_found
            }
            for p in self.players.values()
        ]
        await self.broadcast({
            "type": "player_list_update",
            "players": player_data,
            "player_count": len(self.players),
            "remaining_hiders": self.count_remaining_hiders()
        })

    async def start_game(self):
        if len(self.players) < 2:
            await self.broadcast({
                "type": "error",
                "message": "Mindestens 2 Spieler erforderlich."
            })
            return

        self.game_active = True
        all_ids = list(self.players.keys())
        seeker_id = random.choice(all_ids)

        for cid, player in self.players.items():
            player.is_found = False
            if cid == seeker_id:
                player.role = "sucher"
            else:
                player.role = "verstecker"

            await self.send_to(cid, {
                "type": "role_assignment",
                "role": player.role
            })

        await self.broadcast({
            "type": "game_started",
            "seeker_id": seeker_id,
            "remaining_hiders": self.count_remaining_hiders()
        })
        await self.broadcast_player_list()

    async def mark_found(self, target_client_id: str):
        if target_client_id in self.players:
            target = self.players[target_client_id]
            if target.role == "verstecker" and not target.is_found:
                target.is_found = True
                remaining = self.count_remaining_hiders()

                await self.broadcast({
                    "type": "player_found",
                    "client_id": target_client_id,
                    "remaining_hiders": remaining
                })

                if remaining == 0:
                    self.game_active = False
                    await self.broadcast({
                        "type": "game_over",
                        "winner": "sucher"
                    })

    async def handle_message(self, client_id: str, payload: dict):
        msg_type = payload.get("type")

        if msg_type == "start_game":
            await self.start_game()

        elif msg_type == "position":
            payload["client_id"] = client_id
            await self.broadcast(payload, exclude_client_id=client_id)

        elif msg_type == "player_found":
            target_id = payload.get("target_client")
            if target_id:
                await self.mark_found(target_id)

        elif msg_type == "proximity_alert":
            target_id = payload.get("target_client")
            if target_id:
                await self.send_to(target_id, {
                    "type": "proximity_alert",
                    "seeker_id": client_id
                })

        else:
            payload["client_id"] = client_id
            await self.broadcast(payload, exclude_client_id=client_id)


manager = GameManager()


@app.get("/")
async def health_check():
    return {
        "status": "online",
        "active_players": len(manager.players),
        "game_active": manager.game_active
    }


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(client_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            await manager.handle_message(client_id, payload)
    except WebSocketDisconnect:
        await manager.disconnect(client_id)
    except Exception:
        await manager.disconnect(client_id)