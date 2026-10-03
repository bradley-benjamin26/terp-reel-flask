"""
umd_client/search.py
-----------------------
Orchestrates "browsing" a UMD OAI-PMH collection.
"""
from . import oai
from . import iiif

MAX_PAGES_PER_REQUEST = 8
TARGET_RESULTS = 10


def browse(set_spec: str, resumption_token: str | None) -> dict:
    gathered = []
    token = resumption_token
    done = False

    for _ in range(MAX_PAGES_PER_REQUEST):
        if len(gathered) >= TARGET_RESULTS:
            break

        page = oai.fetch_page(resumption_token=token, set_spec=set_spec if not token else None)
        records = page["records"]

        item_ids = [rec["item_iiif_id"] for rec in records]
        image_ids = iiif.resolve_image_ids(item_ids)

        for rec in records:
            image_id = image_ids.get(rec["item_iiif_id"])
            if image_id:
                gathered.append({**rec, "image_id": image_id})

        token = page["resumption_token"]
        if not token:
            done = True
            break

    return {"items": gathered, "resumption_token": token, "done": done}
