import os
import json
from pathlib import Path
from typing import Any, Tuple

from loguru import logger

from ..config_manager.utils import read_yaml


DEFAULT_OVERRIDE_DIR = Path(__file__).resolve().parents[3] / "data" / "persona_overrides"

ALLOWED_FIELDS = {
    "name": "persona.name",
    "description": "identity.description",
    "preferred_language": "languages.preferred",
    "verbosity": "behavior.interaction_style.verbosity",
}


def _ensure_dir(path: Path) -> None:
    os.makedirs(path, exist_ok=True)


def _load_yaml_or_empty(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        data = read_yaml(str(path))
        return data if isinstance(data, dict) else {}
    except Exception as e:
        logger.error(f"Failed to read override yaml {path}: {e}")
        return {}


def _set_nested(dct: dict, dotted_key: str, value: Any) -> dict:
    keys = dotted_key.split(".")
    cur = dct
    for k in keys[:-1]:
        if k not in cur or not isinstance(cur[k], dict):
            cur[k] = {}
        cur = cur[k]
    cur[keys[-1]] = value
    return dct


def load_override(persona_id: str, base_dir: Path | None = None) -> dict:
    base_dir = base_dir or DEFAULT_OVERRIDE_DIR
    _ensure_dir(base_dir)
    path = base_dir / f"{persona_id}.override.yaml"
    return _load_yaml_or_empty(path)


def save_override(persona_id: str, data: dict, base_dir: Path | None = None) -> None:
    base_dir = base_dir or DEFAULT_OVERRIDE_DIR
    _ensure_dir(base_dir)
    path = base_dir / f"{persona_id}.override.yaml"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def delete_override(persona_id: str, base_dir: Path | None = None) -> None:
    base_dir = base_dir or DEFAULT_OVERRIDE_DIR
    path = base_dir / f"{persona_id}.override.yaml"
    if path.exists():
        path.unlink()


def apply_override(persona: dict, override: dict) -> Tuple[dict, dict]:
    """
    Apply allowed override fields to persona dict.
    Returns (new_persona, applied_fields_meta)
    """
    if not override:
        return persona, {}

    updated = json.loads(json.dumps(persona))  # deep copy
    applied = {}

    # Map allowed fields from override to persona structure
    for field, dotted in ALLOWED_FIELDS.items():
        if field not in override:
            continue
        value = override[field]
        # Basic validation/sanitization
        if isinstance(value, str):
            value = value.strip()
            if not value:
                continue
        elif value is None:
            continue
        _set_nested(updated, dotted, value)
        applied[field] = value

    return updated, applied
