"""
AI Engine - Local LLM integration via Ollama.
Handles all LLM inference for conversation, appointment extraction,
urgency classification, and call summarization.
"""

import json
import os
import logging
from datetime import datetime
from typing import Optional

import asyncio

import yaml
import ollama

logger = logging.getLogger(__name__)

CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config")
MODEL_NAME = "llama3.1:8b"
MAX_CONTEXT_MESSAGES = 15


class AIEngine:
    def __init__(self):
        self.business_info = self._load_business_info()
        self.prompts = self._load_prompts()
        self.client = ollama.AsyncClient()
        # Verify model synchronously at startup (before event loop is running)
        self._verify_model_sync()

    def _load_business_info(self) -> dict:
        """Load business configuration from YAML."""
        path = os.path.join(CONFIG_DIR, "business_info.yaml")
        with open(path, "r") as f:
            return yaml.safe_load(f)

    def _load_prompts(self) -> dict:
        """Load prompt templates from YAML."""
        path = os.path.join(CONFIG_DIR, "prompts.yaml")
        with open(path, "r") as f:
            return yaml.safe_load(f)

    def _verify_model_sync(self):
        """Check that the Ollama model is available (sync, for startup)."""
        try:
            sync_client = ollama.Client()
            models = sync_client.list()
            model_names = [m.model for m in models.models]
            if not any(MODEL_NAME in name for name in model_names):
                logger.warning(
                    f"Model {MODEL_NAME} not found. Available: {model_names}. "
                    f"Run: ollama pull {MODEL_NAME}"
                )
            else:
                logger.info(f"✅ Model {MODEL_NAME} is available")
        except Exception as e:
            logger.error(f"Cannot connect to Ollama: {e}. Is Ollama running?")

    def _format_business_info(self) -> str:
        """Format business info for injection into prompts."""
        info = self.business_info
        biz = info.get("business", {})
        lines = [
            f"Business Name: {biz.get('name', 'N/A')}",
            f"Owner: {biz.get('owner', 'N/A')}",
            f"Phone: {biz.get('phone', 'N/A')}",
            f"Address: {biz.get('address', 'N/A')}",
            f"Website: {biz.get('website', 'N/A')}",
            "",
            "SERVICES:",
        ]
        for svc in info.get("services", []):
            lines.append(
                f"- {svc['name']}: {svc['description']} "
                f"(Price: {svc['price_range']}, Duration: {svc['duration_minutes']}min)"
            )
        lines.append("")
        lines.append("FREQUENTLY ASKED QUESTIONS:")
        for faq in info.get("faqs", []):
            lines.append(f"Q: {faq['question']}")
            lines.append(f"A: {faq['answer']}")
            lines.append("")

        return "\n".join(lines)

    def _get_today_hours(self) -> str:
        """Get business hours for today."""
        now = datetime.now()
        day_name = now.strftime("%A").lower()
        hours = self.business_info.get("hours", {})
        today = hours.get(day_name, "closed")
        if today == "closed":
            return "CLOSED today"
        return f"Open {today.get('open', 'N/A')} - {today.get('close', 'N/A')}"

    def _build_system_prompt(self) -> str:
        """Build the system prompt with business context."""
        template = self.prompts.get("system_prompt", "")
        biz = self.business_info.get("business", {})
        return template.format(
            business_name=biz.get("name", "the business"),
            owner_name=biz.get("owner", "the owner"),
            business_info=self._format_business_info(),
            current_datetime=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            today_hours=self._get_today_hours(),
        )

    def _format_conversation_history(self, messages: list[dict]) -> str:
        """Format message list into readable conversation history."""
        lines = []
        for msg in messages:
            role_label = "Caller" if msg["role"] == "caller" else "Assistant"
            lines.append(f"{role_label}: {msg['content']}")
        return "\n".join(lines)

    async def generate_response(
        self, conversation_history: list[dict], caller_message: str,
        extra_context: str = ""
    ) -> str:
        """Generate a conversational response using the LLM."""
        system_prompt = self._build_system_prompt()
        if extra_context:
            system_prompt += f"\n\n{extra_context}"

        ollama_messages = [{"role": "system", "content": system_prompt}]

        # Cap history to avoid exceeding LLM context window on long calls
        recent_history = conversation_history[-MAX_CONTEXT_MESSAGES:]
        for msg in recent_history:
            role = "user" if msg["role"] == "caller" else "assistant"
            ollama_messages.append({"role": role, "content": msg["content"]})

        ollama_messages.append({"role": "user", "content": caller_message})

        try:
            response = await self.client.chat(
                model=MODEL_NAME,
                messages=ollama_messages,
                options={
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "num_predict": 150,
                },
            )
            return response["message"]["content"].strip()
        except Exception as e:
            logger.error(f"LLM generation error: {e}")
            return "I apologize, I'm having a moment of difficulty. Could you please repeat that?"

    async def extract_appointment_details(
        self, conversation_history: list[dict]
    ) -> Optional[dict]:
        """Extract appointment details from conversation using LLM."""
        from datetime import date as date_type

        template = self.prompts.get("appointment_extraction", "")
        prompt = template.format(
            conversation_history=self._format_conversation_history(conversation_history),
            today_date=date_type.today().isoformat(),
        )

        try:
            response = await self.client.chat(
                model=MODEL_NAME,
                messages=[
                    {
                        "role": "system",
                        "content": "You extract structured data from conversations. Return ONLY valid JSON.",
                    },
                    {"role": "user", "content": prompt},
                ],
                options={"temperature": 0.1, "num_predict": 500},
            )
            text = response["message"]["content"].strip()
            logger.info(f"Raw appointment extraction LLM response: {text[:500]}")
            # Try to parse JSON from the response
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()

            result = json.loads(text)

            # Skip if LLM explicitly says no appointment was requested
            if result.get("appointment_requested") is False:
                logger.info("LLM determined no appointment was requested")
                return None

            return result
        except (json.JSONDecodeError, Exception) as e:
            logger.error(f"Appointment extraction error: {e}")
            return None

    async def assess_urgency(self, conversation_history: list[dict]) -> dict:
        """Classify the urgency of the current call."""
        template = self.prompts.get("urgency_assessment", "")
        prompt = template.format(
            conversation_history=self._format_conversation_history(conversation_history)
        )

        default = {
            "urgency": "LOW",
            "confidence": 0.5,
            "reason": "Unable to assess",
            "should_notify_owner": False,
        }

        try:
            response = await self.client.chat(
                model=MODEL_NAME,
                messages=[
                    {
                        "role": "system",
                        "content": "You classify call urgency. Return ONLY valid JSON.",
                    },
                    {"role": "user", "content": prompt},
                ],
                options={"temperature": 0.1, "num_predict": 200},
            )
            text = response["message"]["content"].strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            result = json.loads(text)
            # Validate fields
            result.setdefault("urgency", "LOW")
            result.setdefault("confidence", 0.5)
            result.setdefault("reason", "")
            result.setdefault("should_notify_owner", False)
            return result
        except (json.JSONDecodeError, Exception) as e:
            logger.error(f"Urgency assessment error: {e}")
            return default

    async def summarize_call(self, conversation_history: list[dict]) -> dict:
        """Generate a call summary for the business owner."""
        template = self.prompts.get("call_summary", "")
        prompt = template.format(
            conversation_history=self._format_conversation_history(conversation_history)
        )

        default = {
            "caller_name": "Unknown",
            "caller_phone": "Unknown",
            "reason_for_call": "Unable to summarize",
            "service_needed": "N/A",
            "appointment_scheduled": False,
            "appointment_details": "N/A",
            "urgency": "LOW",
            "action_needed": "Review call transcript",
            "key_notes": "",
        }

        try:
            response = await self.client.chat(
                model=MODEL_NAME,
                messages=[
                    {
                        "role": "system",
                        "content": "You summarize phone calls. Return ONLY valid JSON.",
                    },
                    {"role": "user", "content": prompt},
                ],
                options={"temperature": 0.1, "num_predict": 400},
            )
            text = response["message"]["content"].strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            return json.loads(text)
        except (json.JSONDecodeError, Exception) as e:
            logger.error(f"Call summary error: {e}")
            return default

    def get_greeting(self) -> str:
        """Get the appropriate greeting based on current time."""
        biz = self.business_info.get("business", {})
        greetings = self.business_info.get("greeting_style", {})
        now = datetime.now()
        day_name = now.strftime("%A").lower()
        hours = self.business_info.get("hours", {})
        today = hours.get(day_name, "closed")

        if today == "closed":
            template = greetings.get(
                "after_hours_template",
                "Thank you for calling. We're currently closed. How can I help?",
            )
        else:
            open_time = datetime.strptime(today["open"], "%H:%M").time()
            close_time = datetime.strptime(today["close"], "%H:%M").time()
            current_time = now.time()
            if open_time <= current_time <= close_time:
                template = greetings.get(
                    "greeting_template",
                    "Thank you for calling! How can I help you today?",
                )
            else:
                template = greetings.get(
                    "after_hours_template",
                    "Thank you for calling. We're currently closed. How can I help?",
                )

        return template.format(
            business_name=biz.get("name", "our business"),
            owner_name=biz.get("owner", "the owner"),
        )
