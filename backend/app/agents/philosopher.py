from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from functools import lru_cache
import re
from typing import Any, Literal, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph

from app.config import get_settings
from app.memory.sessions import append_turn, get_history
from app.personas import get_persona
from app.rag.retrieve import retrieve_passages

logger = logging.getLogger(__name__)


class AgentState(TypedDict, total=False):
    philosopher_id: str
    session_id: str
    user_message: str
    history: list[dict[str, str]]
    retrieved: list[dict[str, Any]]
    system_prompt: str
    intent: Literal["anatomy", "quiz", "conversation", "visualization"]


def _maybe_trace(name: str, metadata: dict[str, Any]) -> None:
    settings = get_settings()
    if not settings.opik_api_key:
        return
    try:
        import opik  # type: ignore

        client = opik.Opik(api_key=settings.opik_api_key, project_name=settings.opik_project)
        client.log_traces([{"name": name, "metadata": metadata}])
    except Exception:
        return


def clean_chat_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"(^|\r?\n)(\s*(?:[-*•]\s+)?)\*\*\s*", r"\1\2", text)
    text = re.sub(r"\s*\*\*\s+", " ", text)
    return text.replace("**", "")


def _build_system_prompt(persona: dict[str, Any], retrieved: list[dict[str, Any]]) -> str:
    base = persona["system_prompt"]
    style = (
        f"Teaching style: {persona.get('teaching_style', '')}. "
        f"Vocabulary: {persona.get('vocabulary_level', '')}. "
        f"Domain: {persona.get('domain', '')}."
    )
    memory_rules = (
        "You have short-term memory for THIS chat session. "
        "Prior user and assistant messages are included in the conversation. "
        "When the learner asks if you remember something from earlier in this chat, "
        "use those prior messages and answer specifically. "
        "Never say you have no memory of this conversation."
    )
    formatting_rules = (
        "Formatting rules: Do NOT use double asterisks (**) or markdown bold in your output. "
        "Never start headers, bullet items, or sentences with '** ' or '**'. "
        "Write clean, plain conversational text without asterisk formatting."
    )
    if not retrieved:
        return (
            f"{base}\n{style}\n{memory_rules}\n{formatting_rules}\n"
            "Use only reliable educational knowledge. Prefer short answers."
        )

    context_blocks = [f"[{index}] {passage['text']} (source: {passage.get('source', 'seed')})" for index, passage in enumerate(retrieved, start=1)]
    context = "\n".join(context_blocks)
    return (
        f"{base}\n{style}\n{memory_rules}\n{formatting_rules}\n"
        "Ground factual claims in the retrieved context. Cite supporting passages as [1], [2] when used. "
        "If the context is insufficient, explicitly say so instead of inventing anatomy facts.\n"
        f"Retrieved context:\n{context}"
    )


async def load_memory_node(state: AgentState) -> AgentState:
    history = await get_history(state["philosopher_id"], state["session_id"])
    cleaned_history = [
        {"role": turn.get("role", "assistant"), "content": clean_chat_text(turn.get("content", ""))}
        for turn in history
    ]
    return {"history": cleaned_history}


async def classify_intent_node(state: AgentState) -> AgentState:
    message = state["user_message"].lower()
    if any(word in message for word in ("quiz", "test me", "questionnaire")):
        intent = "quiz"
    elif any(word in message for word in ("show", "visual", "model", "rotate", "3d")):
        intent = "visualization"
    elif len(message.split()) < 5 and any(word in message for word in ("again", "that", "it", "why")):
        intent = "conversation"
    else:
        intent = "anatomy"
    return {"intent": intent}


async def retrieve_node(state: AgentState) -> AgentState:
    try:
        retrieved = await retrieve_passages(state["philosopher_id"], state["user_message"])
    except Exception:
        logger.exception("RAG retrieval failed", extra={"persona": state["philosopher_id"]})
        retrieved = []
    return {"retrieved": retrieved}


def route_after_intent(state: AgentState) -> str:
    # Brief conversational follow-ups primarily depend on bounded session memory.
    return "prompt" if state.get("intent") == "conversation" else "retrieve"


async def prompt_node(state: AgentState) -> AgentState:
    persona = get_persona(state["philosopher_id"])
    assert persona is not None
    return {"system_prompt": _build_system_prompt(persona, state.get("retrieved") or [])}


def build_agent_graph():
    graph = StateGraph(AgentState)
    graph.add_node("load_memory", load_memory_node)
    graph.add_node("classify_intent", classify_intent_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("prompt", prompt_node)
    graph.add_edge(START, "load_memory")
    graph.add_edge("load_memory", "classify_intent")
    graph.add_conditional_edges("classify_intent", route_after_intent, {"retrieve": "retrieve", "prompt": "prompt"})
    graph.add_edge("retrieve", "prompt")
    graph.add_edge("prompt", END)
    return graph.compile()


_agent = build_agent_graph()


@lru_cache
def get_llm() -> ChatGroq:
    settings = get_settings()
    return ChatGroq(api_key=settings.groq_api_key, model=settings.groq_model, temperature=settings.groq_temperature,
                    max_tokens=settings.groq_max_tokens, timeout=settings.groq_timeout_seconds,
                    max_retries=settings.groq_max_retries, streaming=True)


async def stream_reply(
    philosopher_id: str,
    session_id: str,
    user_message: str,
) -> AsyncIterator[str]:
    settings = get_settings()
    persona = get_persona(philosopher_id)
    if persona is None:
        yield json.dumps({"type": "error", "message": "Unknown persona"})
        return

    if not settings.groq_api_key:
        yield json.dumps({"type": "error", "message": "GROQ_API_KEY is not set"})
        return

    prepared: AgentState = await _agent.ainvoke(
        {
            "philosopher_id": philosopher_id,
            "session_id": session_id,
            "user_message": user_message,
        }
    )

    messages: list[Any] = [SystemMessage(content=prepared["system_prompt"])]
    for turn in prepared.get("history") or []:
        if turn["role"] == "user":
            messages.append(HumanMessage(content=turn["content"]))
        else:
            messages.append(AIMessage(content=turn["content"]))
    messages.append(HumanMessage(content=user_message))

    llm = get_llm()

    _maybe_trace(
        "bodyagents_chat",
        {
            "philosopher_id": philosopher_id,
            "session_id": session_id,
            "retrieved": len(prepared.get("retrieved") or []),
        },
    )

    full_reply: list[str] = []
    async for chunk in llm.astream(messages):
        token = chunk.content
        if not token:
            continue
        if isinstance(token, list):
            token = "".join(
                part.get("text", "") if isinstance(part, dict) else str(part) for part in token
            )
        text = str(token)
        full_reply.append(text)
        yield text

    assistant_message = clean_chat_text("".join(full_reply).strip())
    if assistant_message:
        await append_turn(philosopher_id, session_id, user_message, assistant_message)

    yield json.dumps({"type": "done"})
