"""WebSocket endpoint for real-time Whisper transcription via WhisperLiveKit."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.deps import decode_token
from app.services.whisper_live import get_engine

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/transcribe")
async def ws_transcribe(ws: WebSocket, token: str = Query(...)):
    """Stream audio in, get transcription JSON out.

    Protocol:
    - Client sends raw PCM int16 bytes (16 kHz mono) as binary frames.
    - Server sends JSON dicts with transcription results.
    """

    # ── Auth ──────────────────────────────────────────────────────────────────
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
    except Exception:
        await ws.close(code=4001, reason="Unauthorized")
        return

    await ws.accept()
    logger.info("Whisper WS connected (user=%s)", user_id)

    try:
        engine = get_engine()
        from whisperlivekit import AudioProcessor
    except Exception as exc:
        logger.warning("Whisper WS unavailable: %s", exc)
        await ws.close(code=1013, reason="Transcription service unavailable")
        return

    audio_processor = AudioProcessor(transcription_engine=engine)

    async def recv_loop():
        """Receive audio bytes from client and feed to processor."""
        try:
            while True:
                data = await ws.receive_bytes()
                await audio_processor.process_audio(data)
        except WebSocketDisconnect:
            pass

    async def send_loop():
        """Stream transcription results back to client."""
        try:
            async for response in audio_processor.results_generator():
                await ws.send_json(response.to_dict())
        except WebSocketDisconnect:
            pass

    recv_task = asyncio.create_task(recv_loop())
    send_task = asyncio.create_task(send_loop())

    try:
        await asyncio.gather(recv_task, send_task)
    except Exception as exc:
        logger.warning("Whisper WS error: %s", exc)
    finally:
        recv_task.cancel()
        send_task.cancel()
        audio_processor.cleanup()
        logger.info("Whisper WS disconnected (user=%s)", user_id)
