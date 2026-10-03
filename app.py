"""
app.py
------
The Flask application: routes + JSON API.
Run:  python3 -m flask --app app run --debug
"""
import os
import re

import requests
from flask import Flask, render_template, request, jsonify
from lxml.etree import XMLSyntaxError

from umd_client import search as umd_search
from umd_client.iiif import thumbnail_url

app = Flask(__name__)

STOCK_DESCRIPTIONS = {
    "The Diamondback Photo Morgue consists of images taken for the primary University of Maryland student newspaper, The Diamondback. Photographers took multiple shots at various campus events, athletic games, and of general campus life. Some images were printed in the newspaper, others were kept on file. This collection covers the period from the early 1970s to the late 1990s."
}

STOCK_DESCRIPTIONS_LOWER = {d.lower() for d in STOCK_DESCRIPTIONS}


def _filter_stock_description(description: str) -> str:
    cleaned = _clean_whitespace(description).lower()
    return "" if cleaned in STOCK_DESCRIPTIONS_LOWER else description

COLLECTIONS = [
    {"spec": "diamondback_photos", "name": "Diamondback Photos"},
    {"spec": "umd_student_newspapers", "name": "UMD Student Newspapers"},
    {"spec": "university_archives", "name": "University Archives"},
    {"spec": "cultural_preservation", "name": "Cultural Preservation"},
    {"spec": "katherine_anne_porter_correspondence", "name": "Katherine Anne Porter Correspondence"},
    {"spec": "maryland_and_historical_collections", "name": "Maryland and Historical Collections"},
    {"spec": "punk_collections", "name": "Punk Collections"},
    {"spec": "labor", "name": "Labor"},
    {"spec": "literature_and_rare_books", "name": "Literature and Rare Books"},
    {"spec": "djuna_barnes_correspondence", "name": "Djuna Barnes Correspondence"},
    {"spec": "postwar_japan", "name": "Postwar Japan"},
    {"spec": "performing_arts", "name": "Performing Arts"},
    {"spec": "government_documents", "name": "Government Documents"},
    {"spec": "world_s_fairs", "name": "World's Fairs"},
    {"spec": "prange_posters_and_wall_newspapers", "name": "Prange Posters and Wall Newspapers"},
    {"spec": "broadcasting", "name": "Broadcasting"},
    {"spec": "politics_and_civic_life", "name": "Politics and Civic Life"},
]

DEFAULT_SET = COLLECTIONS[0]["spec"]

ALT_TEXT_MAX_LEN = 300  # screen readers will read the whole alt attribute;
                        # keep it generous but bounded so a runaway
                        # metadata field doesn't produce an unreadable wall.


def _clean_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def build_alt_text(title: str, description: str, date: str) -> str:
    """Builds meaningful alt text from real catalog metadata instead of
    a generic 'photo' or the bare filename-style title.

    Priority: title + description (when available) is far more useful
    to a screen reader user than title alone, since the description
    field is where catalogers put the actual visual content ("Two
    students walk past McKeldin Library carrying protest signs...").
    Falls back gracefully when a description is missing.
    """
    title = _clean_whitespace(title) or "Untitled archival image"
    description = _clean_whitespace(description)

    if description:
        alt = f"{title}. {description}"
    else:
        alt = title

    if date:
        alt = f"{alt} ({_clean_whitespace(date)})"

    if len(alt) > ALT_TEXT_MAX_LEN:
        alt = alt[:ALT_TEXT_MAX_LEN].rsplit(" ", 1)[0] + "\u2026"

    return alt


@app.route("/")
def index():
    return render_template("index.html", collections=COLLECTIONS)


@app.route("/api/browse")
def api_browse():
    set_spec = request.args.get("set") or DEFAULT_SET
    resumption_token = request.args.get("resumptionToken") or None

    try:
        result = umd_search.browse(set_spec, resumption_token)
    except (requests.RequestException, XMLSyntaxError):
        return jsonify({"error": "Couldn't reach the UMD archive service. Please try again."}), 502

    items = []
    for rec in result["items"]:
        display_description = _filter_stock_description(rec["description"])
        # Prefer the handle URL when available; otherwise fall back
        # to the Digital Collections resource URL built from the IIIF ID.
        viewer_url = rec.get("handle_url") or f"https://digital.lib.umd.edu/resource/{rec['item_iiif_id']}"

        items.append({
            "identifier": rec["identifier"],
            "title": rec["title"],
            "description": display_description,
            "date": rec["date"],
            "alt_text": build_alt_text(rec["title"], display_description, rec["date"]),
            "item_iiif_id": rec["item_iiif_id"],
            "thumb_url": thumbnail_url(rec["image_id"], 1200),
            "blur_url": thumbnail_url(rec["image_id"], 60),
            "full_url": thumbnail_url(rec["image_id"], 2000),
            "viewer_url": viewer_url,
            "handle_url": rec.get("handle_url"),
        })

    return jsonify({
        "items": items,
        "resumptionToken": result["resumption_token"],
        "done": result["done"],
    })


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1")