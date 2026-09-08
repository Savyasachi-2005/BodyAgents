from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active: dict[str, WebSocket] = {}

    def _key(self, philosopher_id: str, session_id: str) -> str:
        return f"{philosopher_id}:{session_id}"

    async def connect(self, websocket: WebSocket, philosopher_id: str, session_id: str) -> None:
        await websocket.accept()
        self.active[self._key(philosopher_id, session_id)] = websocket

    def disconnect(self, philosopher_id: str, session_id: str) -> None:
        self.active.pop(self._key(philosopher_id, session_id), None)

    async def send_text(self, philosopher_id: str, session_id: str, message: str) -> None:
        websocket = self.active.get(self._key(philosopher_id, session_id))
        if websocket is not None:
            await websocket.send_text(message)


manager = ConnectionManager()
