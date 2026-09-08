import asyncio
import json

import websockets


async def main() -> None:
    uri = "ws://127.0.0.1:8000/api/v1/ws/chat/brain/smoke-test-1"
    async with websockets.connect(
        uri,
        additional_headers={"Origin": "http://localhost:3001"},
    ) as ws:
        await ws.send("What does the brain do?")
        chunks: list[str] = []
        while True:
            msg = await ws.recv()
            try:
                data = json.loads(msg)
                if isinstance(data, dict) and data.get("type") in {"done", "error"}:
                    print("CTRL", data)
                    break
            except json.JSONDecodeError:
                chunks.append(msg)
        text = "".join(chunks)
        print("TOKENS", len(text), "chars")
        print(text[:300])


if __name__ == "__main__":
    asyncio.run(main())

