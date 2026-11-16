"""Durable workflow state transition rules.

Keep this module free of database and HTTP dependencies so every API route,
worker event handler and recovery path can share the same transition contract.
"""
from __future__ import annotations

from dataclasses import dataclass


class InvalidTransition(ValueError):
    """Raised when a workflow entity is asked to enter an illegal state."""


JOB_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"prompts_ready", "cancelled", "failed"}),
    "prompts_ready": frozenset({"draft", "prompts_approved", "cancelled", "failed"}),
    "prompts_approved": frozenset({"queued", "running", "cancelled", "failed"}),
    "queued": frozenset({"running", "paused", "cancelled", "failed"}),
    "running": frozenset({"paused", "processing", "media_ready", "failed", "cancelled"}),
    "paused": frozenset({"queued", "running", "processing", "cancelled", "failed"}),
    "processing": frozenset({"media_ready", "paused", "failed", "cancelled"}),
    "media_ready": frozenset({"publishing", "completed", "failed"}),
    "publishing": frozenset({"completed", "media_ready", "failed"}),
    "completed": frozenset(),
    "failed": frozenset({"draft", "queued", "cancelled"}),
    "cancelled": frozenset(),
}

CLIP_TRANSITIONS: dict[str, frozenset[str]] = {
    "planned": frozenset({"prompt_ready", "cancelled"}),
    "prompt_ready": frozenset({"approved", "planned", "cancelled"}),
    "approved": frozenset({"queued", "cancelled"}),
    "queued": frozenset({"leased", "paused", "cancelled"}),
    "leased": frozenset({"project_open", "queued", "needs_login", "blocked_ui", "failed", "paused", "cancelled"}),
    "project_open": frozenset({"settings_verified", "needs_login", "blocked_ui", "failed", "paused", "cancelled"}),
    "settings_verified": frozenset({"submitted", "blocked_settings", "blocked_ui", "failed", "paused", "cancelled"}),
    "submitted": frozenset({"generating", "generation_completed", "failed", "paused", "blocked_ui"}),
    "generating": frozenset({"generation_completed", "failed", "paused", "blocked_ui"}),
    "generation_completed": frozenset({"downloading", "downloaded", "failed", "paused"}),
    "downloading": frozenset({"downloaded", "failed", "paused"}),
    "downloaded": frozenset({"validating", "failed"}),
    "validating": frozenset({"ready", "failed"}),
    "ready": frozenset(),
    "needs_login": frozenset({"queued", "cancelled", "failed"}),
    "blocked_ui": frozenset({"queued", "cancelled", "failed"}),
    "blocked_settings": frozenset({"queued", "cancelled", "failed"}),
    "paused": frozenset({"queued", "leased", "project_open", "settings_verified", "submitted", "generating", "generation_completed", "downloading", "cancelled", "failed"}),
    "failed": frozenset({"queued", "cancelled"}),
    "cancelled": frozenset(),
}

TASK_TRANSITIONS: dict[str, frozenset[str]] = {
    "queued": frozenset({"leased", "cancelled", "superseded"}),
    "leased": frozenset({"project_open", "queued", "submitted", "generating", "generation_completed", "downloading", "downloaded", "needs_login", "blocked_ui", "blocked_settings", "failed", "paused", "cancelled"}),
    "project_open": frozenset({"settings_verified", "needs_login", "blocked_ui", "failed", "paused", "cancelled"}),
    "settings_verified": frozenset({"submitted", "blocked_settings", "blocked_ui", "failed", "paused", "cancelled"}),
    "submitted": frozenset({"generating", "generation_completed", "failed", "paused", "blocked_ui"}),
    "generating": frozenset({"generation_completed", "failed", "paused", "blocked_ui"}),
    "generation_completed": frozenset({"downloading", "downloaded", "failed", "paused"}),
    "downloading": frozenset({"downloaded", "failed", "paused"}),
    "downloaded": frozenset(),
    "needs_login": frozenset({"queued", "cancelled", "superseded"}),
    "blocked_ui": frozenset({"queued", "cancelled", "superseded"}),
    "blocked_settings": frozenset({"queued", "cancelled", "superseded"}),
    "failed": frozenset({"queued", "cancelled", "superseded"}),
    "paused": frozenset({"queued", "leased", "project_open", "settings_verified", "submitted", "generating", "generation_completed", "downloading", "cancelled"}),
    "cancelled": frozenset({"queued", "superseded"}),
    "superseded": frozenset(),
}


@dataclass(frozen=True)
class Transition:
    entity: str
    previous: str
    target: str


def validate_transition(entity: str, current: str, target: str) -> Transition:
    """Validate and return a normalized transition; does not mutate persistence."""
    maps = {
        "job": JOB_TRANSITIONS,
        "clip": CLIP_TRANSITIONS,
        "task": TASK_TRANSITIONS,
    }
    if entity not in maps:
        raise InvalidTransition(f"Unknown workflow entity: {entity}")
    allowed = maps[entity]
    if current not in allowed:
        raise InvalidTransition(f"Unknown {entity} state: {current}")
    if target not in allowed:
        raise InvalidTransition(f"Unknown {entity} target state: {target}")
    if current == target:
        return Transition(entity, current, target)
    if target not in allowed[current]:
        raise InvalidTransition(f"Illegal {entity} transition: {current} -> {target}")
    return Transition(entity, current, target)


def can_transition(entity: str, current: str, target: str) -> bool:
    try:
        validate_transition(entity, current, target)
        return True
    except InvalidTransition:
        return False
