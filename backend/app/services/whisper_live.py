"""WhisperLiveKit transcription engine — lazy-loaded global singleton."""

from __future__ import annotations

import logging

from app.config import settings

logger = logging.getLogger(__name__)

_engine = None


def get_engine():
    """Return (and lazily initialise) the global TranscriptionEngine."""
    global _engine
    if _engine is None:
        from whisperlivekit import TranscriptionEngine  # heavy import — defer

        logger.info(
            "Initialising WhisperLiveKit engine (model=%s, language=%s)",
            settings.whisper_model,
            settings.whisper_language,
        )
        _engine = TranscriptionEngine(
            model=settings.whisper_model,
            lan=settings.whisper_language,
        )
        logger.info("WhisperLiveKit engine ready")
    return _engine
