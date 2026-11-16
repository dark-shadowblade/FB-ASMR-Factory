import pytest

from app.workflow_state import (
    InvalidTransition,
    can_transition,
    validate_transition,
)


@pytest.mark.parametrize(
    ("entity", "current", "target"),
    [
        ("job", "draft", "prompts_ready"),
        ("job", "prompts_approved", "running"),
        ("job", "running", "processing"),
        ("job", "media_ready", "publishing"),
        ("job", "publishing", "completed"),
        ("clip", "queued", "leased"),
        ("clip", "leased", "project_open"),
        ("clip", "settings_verified", "submitted"),
        ("clip", "generating", "generation_completed"),
        ("clip", "downloaded", "validating"),
        ("clip", "validating", "ready"),
        ("task", "queued", "leased"),
        ("task", "leased", "project_open"),
        ("task", "generating", "generation_completed"),
        ("task", "failed", "queued"),
    ],
)
def test_expected_workflow_transitions_are_allowed(entity, current, target):
    transition = validate_transition(entity, current, target)
    assert transition.entity == entity
    assert transition.previous == current
    assert transition.target == target


@pytest.mark.parametrize(
    ("entity", "current", "target"),
    [
        ("job", "completed", "running"),
        ("job", "draft", "completed"),
        ("clip", "ready", "queued"),
        ("clip", "generating", "ready"),
        ("clip", "leased", "downloaded"),
        ("task", "downloaded", "queued"),
        ("task", "superseded", "leased"),
    ],
)
def test_unsafe_workflow_transitions_are_rejected(entity, current, target):
    with pytest.raises(InvalidTransition):
        validate_transition(entity, current, target)


def test_same_state_transition_is_idempotent():
    assert validate_transition("task", "generating", "generating").previous == "generating"


def test_unknown_entity_or_state_is_rejected():
    with pytest.raises(InvalidTransition):
        validate_transition("profile", "idle", "leased")
    with pytest.raises(InvalidTransition):
        validate_transition("job", "mystery", "running")


def test_can_transition_is_non_throwing():
    assert can_transition("clip", "downloaded", "validating")
    assert not can_transition("clip", "ready", "queued")
