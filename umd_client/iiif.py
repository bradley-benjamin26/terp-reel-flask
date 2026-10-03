"""
umd_client/iiif.py
--------------------
Resolves UMD IIIF item identifiers into the actual image bitstream
identifiers needed to build thumbnail/full-image URLs. Uses a thread
pool + persistent on-disk cache so repeat browsing of any collection
is fast (see README.md "Performance" section for details).
"""
import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor

import requests

MANIFEST_BASE = "https://iiif.lib.umd.edu/manifests"
IMAGE_BASE = "https://iiif.lib.umd.edu/images/iiif/2"
CACHE_FILE = os.path.join(os.path.dirname(__file__), "..", "image_id_cache.json")
MAX_WORKERS = 8

_session = requests.Session()
_cache_lock = threading.Lock()


def _load_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_cache(cache: dict) -> None:
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(cache, f)
    except OSError:
        pass


_image_id_cache: dict[str, str | None] = _load_cache()


def _extract_image_id(manifest_json: dict) -> str | None:
    try:
        service = (
            manifest_json["sequences"][0]
            ["canvases"][0]
            ["images"][0]
            ["resource"]["service"]
        )
        service_id = service["@id"]
        return service_id.split("/images/iiif/2/")[1].rstrip("/")
    except (KeyError, IndexError, TypeError):
        return None


def _fetch_one(item_iiif_id: str) -> tuple[str, str | None]:
    manifest_url = f"{MANIFEST_BASE}/{item_iiif_id}/manifest"
    try:
        resp = _session.get(manifest_url, timeout=15)
        if resp.ok:
            return item_iiif_id, _extract_image_id(resp.json())
    except requests.RequestException:
        pass
    return item_iiif_id, None


def resolve_image_ids(item_iiif_ids: list[str]) -> dict[str, str | None]:
    """Resolves each item's image bitstream ID, using the on-disk cache.

    Only successful lookups are persisted to the cache. A failed lookup
    (network error, unexpected manifest shape, etc.) is not cached, so
    it's retried on the next request instead of being silently and
    permanently dropped from the feed.
    """
    results: dict[str, str | None] = {}
    to_fetch = []
    for item_id in item_iiif_ids:
        if item_id in _image_id_cache:
            results[item_id] = _image_id_cache[item_id]
        else:
            to_fetch.append(item_id)

    if to_fetch:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            for item_id, image_id in pool.map(_fetch_one, to_fetch):
                results[item_id] = image_id

        resolved = {k: v for k, v in results.items() if k in to_fetch and v is not None}
        if resolved:
            with _cache_lock:
                _image_id_cache.update(resolved)
                _save_cache(_image_id_cache)

    return results


def thumbnail_url(image_id: str, width: int) -> str:
    return f"{IMAGE_BASE}/{image_id}/full/{width},/0/default.jpg"
