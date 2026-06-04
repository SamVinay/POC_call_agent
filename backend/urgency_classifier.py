"""
Urgency Classifier - Determines the urgency level of incoming calls.
Uses both keyword-based fast detection and LLM-based deep analysis.
"""

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)

URGENCY_KEYWORDS = {
    "CRITICAL": [
        "gas leak", "flooding", "burst pipe", "fire", "no heat",
        "carbon monoxide", "sewage backup", "electrical fire",
        "water everywhere", "pipe burst", "emergency",
    ],
    "HIGH": [
        "leaking", "leak", "no hot water", "broken", "not working",
        "urgent", "asap", "as soon as possible", "today",
        "freezing", "overflowing", "backed up", "clogged",
        "water damage", "mold",
    ],
    "MEDIUM": [
        "schedule", "appointment", "repair", "fix", "replace",
        "maintenance", "tune up", "inspection", "estimate",
        "this week", "soon",
    ],
}


class UrgencyClassifier:
    """Classifies call urgency using keyword matching and LLM analysis."""

    def __init__(self, ai_engine=None):
        self.ai_engine = ai_engine

    def quick_scan(self, text: str) -> dict:
        """
        Fast keyword-based urgency detection.
        Used for real-time urgency assessment during the call.
        """
        text_lower = text.lower()

        for level in ["CRITICAL", "HIGH", "MEDIUM"]:
            for keyword in URGENCY_KEYWORDS[level]:
                if keyword in text_lower:
                    return {
                        "urgency": level,
                        "confidence": 0.7,
                        "reason": f"Keyword detected: '{keyword}'",
                        "should_notify_owner": level in ("CRITICAL", "HIGH"),
                        "method": "keyword_scan",
                    }

        return {
            "urgency": "LOW",
            "confidence": 0.6,
            "reason": "No urgency keywords detected",
            "should_notify_owner": False,
            "method": "keyword_scan",
        }

    async def deep_analysis(self, conversation_history: list[dict]) -> dict:
        """
        LLM-based deep urgency analysis.
        Used after the call or at key conversation points.
        """
        if self.ai_engine is None:
            logger.warning("AI engine not available for deep analysis, using keyword scan")
            full_text = " ".join(msg["content"] for msg in conversation_history)
            return self.quick_scan(full_text)

        try:
            result = await self.ai_engine.assess_urgency(conversation_history)
            result["method"] = "llm_analysis"
            return result
        except Exception as e:
            logger.error(f"Deep urgency analysis failed: {e}")
            full_text = " ".join(msg["content"] for msg in conversation_history)
            return self.quick_scan(full_text)

    async def classify(
        self, conversation_history: list[dict], use_llm: bool = True
    ) -> dict:
        """
        Full classification pipeline:
        1. Quick keyword scan for immediate detection
        2. LLM analysis for nuanced classification (if enabled)
        3. Return the highest urgency level found
        """
        full_text = " ".join(msg["content"] for msg in conversation_history)
        keyword_result = self.quick_scan(full_text)

        # If keywords already flagged CRITICAL, no need for LLM
        if keyword_result["urgency"] == "CRITICAL":
            return keyword_result

        if use_llm and self.ai_engine:
            llm_result = await self.deep_analysis(conversation_history)

            # Use the higher urgency between keyword and LLM
            urgency_order = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
            keyword_level = urgency_order.get(keyword_result["urgency"], 0)
            llm_level = urgency_order.get(llm_result.get("urgency", "LOW"), 0)

            if llm_level >= keyword_level:
                return llm_result
            else:
                # Keyword scan caught something LLM missed
                keyword_result["note"] = "Elevated by keyword detection"
                return keyword_result

        return keyword_result

    def should_escalate(self, urgency_result: dict) -> bool:
        """Determine if the call should trigger an immediate owner notification."""
        return urgency_result.get("urgency") in ("CRITICAL", "HIGH") and \
               urgency_result.get("should_notify_owner", False)
