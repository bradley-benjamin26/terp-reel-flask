"""
umd_client/oai.py
------------------
Talks to the UMD Digital Collections OAI-PMH endpoint and parses the
RDF metadata it returns into simple Python dicts.
"""
import requests
from lxml import etree

OAI_BASE = "https://api.fcrepo.lib.umd.edu/oai/api"
FCREPO_PREFIX = "https://fcrepo.lib.umd.edu/fcrepo/rest/"

NS = {
    "oai": "http://www.openarchives.org/OAI/2.0/",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "dcterms": "http://purl.org/dc/terms/",
    "dc": "http://purl.org/dc/elements/1.1/",
}

_session = requests.Session()


def fcrepo_uri_to_iiif_id(uri: str) -> str | None:
    if not uri or not uri.startswith(FCREPO_PREFIX):
        return None
    rest = uri[len(FCREPO_PREFIX):]
    return "fcrepo:" + rest.replace("/", ":")


def _parse_record(record_el) -> dict | None:
    header = record_el.find("oai:header", NS)
    identifier_el = header.find("oai:identifier", NS) if header is not None else None
    identifier = identifier_el.text if identifier_el is not None else None

    descriptions = record_el.findall(".//rdf:Description", NS)
    primary = None
    for desc in descriptions:
        about = desc.get("{http://www.w3.org/1999/02/22-rdf-syntax-ns#}about", "")
        if about.startswith(FCREPO_PREFIX) and "#" not in about:
            primary = desc
            break
    if primary is None:
        return None

    title_el = primary.find("dcterms:title", NS)
    title = title_el.text.strip() if title_el is not None and title_el.text else "Untitled item"

    desc_el = primary.find("dcterms:description", NS)
    description = desc_el.text.strip() if desc_el is not None and desc_el.text else ""

    date_el = primary.find("dc:date", NS)
    date = date_el.text.strip() if date_el is not None and date_el.text else None

    type_els = primary.findall("dcterms:type", NS)
    is_image = any(
        "Image" in t.get("{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource", "")
        for t in type_els
    )

    about_uri = primary.get("{http://www.w3.org/1999/02/22-rdf-syntax-ns#}about")
    item_iiif_id = fcrepo_uri_to_iiif_id(about_uri)
    handle_url = None
    for id_el in primary.findall("dcterms:identifier",NS):
        val = (id_el.text or "").strip()
        if val.startswith("hdl:"):
            handle_url = "https://hdl.handle.net/"+val.split("hdl:", 1)[1]
            break
    return {
        "identifier": identifier,
        "title": title,
        "description": description,
        "date": date,
        "is_image": is_image,
        "item_iiif_id": item_iiif_id,
        "handle_url": handle_url,
    }


def fetch_page(resumption_token: str | None = None, set_spec: str | None = None) -> dict:
    if resumption_token:
        params = {"verb": "ListRecords", "resumptionToken": resumption_token}
    else:
        params = {"verb": "ListRecords", "metadataPrefix": "rdf"}
        if set_spec:
            params["set"] = set_spec

    resp = _session.get(OAI_BASE, params=params, timeout=15)
    resp.raise_for_status()

    root = etree.fromstring(resp.content)
    record_els = root.findall(".//oai:record", NS)

    records = []
    for el in record_els:
        parsed = _parse_record(el)
        if parsed and parsed["is_image"] and parsed["item_iiif_id"]:
            records.append(parsed)

    token_el = root.find(".//oai:resumptionToken", NS)
    resumption = token_el.text.strip() if token_el is not None and token_el.text else None

    return {"records": records, "resumption_token": resumption}


if __name__ == "__main__":
    page = fetch_page(set_spec="diamondback_photos")
    for rec in page["records"][:3]:
        print(rec)
    print("resumption token:", page["resumption_token"])
