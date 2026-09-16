"""
Fallback Event Tracker for Tallus.
Captures, records, and propagates all heuristic, rule-based, or error-recovery fallback occurrences
across OCR extraction, question grading, direct visual marking, and rubric parsing.
"""
import threading
from typing import List, Dict, Any, Optional

_local = threading.local()

def get_current_fallbacks() -> List[Dict[str, Any]]:
    """Returns the list of fallbacks recorded in the current thread/request context."""
    if not hasattr(_local, "fallbacks"):
        _local.fallbacks = []
    return _local.fallbacks

def clear_fallbacks():
    """Clears all fallbacks recorded in the current thread/request context."""
    _local.fallbacks = []

def record_fallback(source: str, trigger: str, action: str, details: Optional[str] = None):
    """
    Records a fallback event.
    :param source: Component name (e.g. 'JSON Parser', 'Score Bounds', 'Direct Marking', 'Rubric Parser')
    :param trigger: What triggered the fallback (e.g. 'Model output was not valid JSON')
    :param action: The fallback action taken (e.g. 'Applied regex fallback parser')
    :param details: Additional contextual info
    """
    event = {
        "source": source,
        "trigger": trigger,
        "action": action,
        "details": details or ""
    }
    if not hasattr(_local, "fallbacks"):
        _local.fallbacks = []
    _local.fallbacks.append(event)
    print(f"[FALLBACK EVENT] [{source}] {trigger} -> {action}")

class FallbackContext:
    """Thread-safe context manager to track fallbacks for a given operation."""
    def __enter__(self):
        clear_fallbacks()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass

    @property
    def fallbacks(self) -> List[Dict[str, Any]]:
        return list(get_current_fallbacks())

    @property
    def triggered(self) -> bool:
        return len(self.fallbacks) > 0
