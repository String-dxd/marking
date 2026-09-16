from typing import Dict, List, Any, Optional
from app.markers.base import BaseSubjectMarker
from app.markers.lower_sec_science import LowerSecScienceMarker
from app.markers.chinese_essay import ChineseEssayMarker
from app.markers.general import GeneralMarker

_REGISTRY: Dict[str, BaseSubjectMarker] = {}

def register_marker(marker: BaseSubjectMarker):
    _REGISTRY[marker.marker_id] = marker

# Register default markers
register_marker(LowerSecScienceMarker())
register_marker(ChineseEssayMarker())
register_marker(GeneralMarker())

def list_markers() -> List[Dict[str, Any]]:
    """
    Returns available markers for UI selection and API consumers.
    """
    options = [
        {
            "id": "auto",
            "name": "Auto-detect from Subject & Title",
            "description": "Automatically selects the best marker based on subject name and assignment title.",
            "supports_direct_marking": True,
            "supports_parsed_marking": True
        }
    ]
    for m in _REGISTRY.values():
        options.append({
            "id": m.marker_id,
            "name": m.name,
            "description": m.description,
            "supports_direct_marking": m.supports_direct_marking,
            "supports_parsed_marking": m.supports_parsed_marking
        })
    return options

def get_marker(
    marker_id: Optional[str] = None,
    subject: str = "",
    title: str = ""
) -> BaseSubjectMarker:
    """
    Resolves the marker to use:
    1. If a known marker_id (not 'auto') is provided, returns that marker.
    2. Otherwise auto-detects based on subject and title keywords.
    3. Falls back safely to lower_sec_science or general.
    """
    if marker_id and marker_id != "auto" and marker_id in _REGISTRY:
        return _REGISTRY[marker_id]

    combined = f"{subject} {title}".lower()

    # Chinese composition & language keywords
    chinese_keywords = ["chinese", "华文", "作文", "写作", "华语", "记叙文", "说明文", "议论文"]
    if any(k in combined for k in chinese_keywords):
        return _REGISTRY["chinese_essay"]

    # Humanities / other essay keywords that use essay marker
    humanities_keywords = [
        "literature", "history", "social studies",
        "humanities", "economics", "general paper", "composition", "tok"
    ]
    if any(k in combined for k in humanities_keywords):
        return _REGISTRY["chinese_essay"]

    # Science / STEM keywords
    science_keywords = [
        "science", "physics", "chemistry", "biology",
        "科学", "物理", "化学", "生物", "kinematics", "mechanics"
    ]
    if any(k in combined for k in science_keywords):
        return _REGISTRY["lower_sec_science"]

    # Default fallback preserves previous default behavior (Lower Sec Science)
    return _REGISTRY.get("lower_sec_science", _REGISTRY["general"])
