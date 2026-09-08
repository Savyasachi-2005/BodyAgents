from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph

from app.config import get_settings
from app.memory.sessions import append_turn, get_history
from app.personas import get_persona
from app.rag.retrieve import retrieve_passages


class AgentState(TypedDict, total=False):
    philosopher_id: str
    session_id: str
    user_message: str
    history: list[dict[str, str]]
    retrieved: list[dict[str, Any]]
    system_prompt: str


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
    if not retrieved:
        return (
            f"{base}\n{style}\n{memory_rules}\n"
            "Use only reliable educational knowledge. Prefer short answers."
        )

    context_blocks = [f"[{index}] {passage['text']}" for index, passage in enumerate(retrieved, start=1)]
    context = "\n".join(context_blocks)
    return (
        f"{base}\n{style}\n{memory_rules}\n"
        "Ground your answer in the retrieved educational context when relevant. "
        "If the context does not contain the answer, say what you know carefully without inventing facts.\n"
        f"Retrieved context:\n{context}"
    )


async def load_memory_node(state: AgentState) -> AgentState:
    history = await get_history(state["philosopher_id"], state["session_id"])
    return {"history": history}


async def retrieve_node(state: AgentState) -> AgentState:
    try:
        retrieved = await retrieve_passages(state["philosopher_id"], state["user_message"])
    except Exception:
        retrieved = []
    return {"retrieved": retrieved}


async def prompt_node(state: AgentState) -> AgentState:
    persona = get_persona(state["philosopher_id"])
    assert persona is not None
    return {"system_prompt": _build_system_prompt(persona, state.get("retrieved") or [])}


def build_agent_graph():
    graph = StateGraph(AgentState)
    graph.add_node("load_memory", load_memory_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("prompt", prompt_node)
    graph.add_edge(START, "load_memory")
    graph.add_edge("load_memory", "retrieve")
    graph.add_edge("retrieve", "prompt")
    graph.add_edge("prompt", END)
    return graph.compile()


_agent = build_agent_graph()


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

    llm = ChatGroq(
        api_key=settings.groq_api_key,
        model=settings.groq_model,
        temperature=0.4,
        streaming=True,
    )

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

    assistant_message = "".join(full_reply).strip()
    if assistant_message:
        await append_turn(philosopher_id, session_id, user_message, assistant_message)

    yield json.dumps({"type": "done"})
