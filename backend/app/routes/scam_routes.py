from fastapi import APIRouter
from pydantic import BaseModel, field_validator
from app.services.scam_classifier import predict_message
from app.services.entity_extractor import extract_entities
from app.services.graph_builder import (
    build_graph_from_entities,
    get_graph_info,
    get_central_nodes,
    get_graph_data,
)
import hashlib

router = APIRouter()

# ---------------------------------------------------------------------------
# Risk weights — each entity type contributes a base risk score (0-1)
# ---------------------------------------------------------------------------
RISK_WEIGHTS = {
    "upi_ids": 0.90,
    "bank_accounts": 0.90,
    "ifsc_codes": 0.80,
    "phones": 0.60,
    "emails": 0.50,
    "urls": 0.65,
    "amounts": 0.70,
    "ip_addresses": 0.45,
    # keyword categories
    "urgency_keywords": 0.75,
    "financial_keywords": 0.70,
    "threat_keywords": 0.80,
}

# Multi-factor risk profile weights per entity type (values sum conceptually to 100)
_PROFILE_BASES = {
    "urls":            {"url_reputation": 85, "sender_history": 40, "content_phish": 70, "behavioral_anomalies": 50, "monetary_value": 20, "social_urgency": 45},
    "upi_ids":         {"url_reputation": 30, "sender_history": 55, "content_phish": 40, "behavioral_anomalies": 60, "monetary_value": 90, "social_urgency": 50},
    "bank_accounts":   {"url_reputation": 20, "sender_history": 60, "content_phish": 35, "behavioral_anomalies": 70, "monetary_value": 95, "social_urgency": 55},
    "ifsc_codes":      {"url_reputation": 15, "sender_history": 50, "content_phish": 30, "behavioral_anomalies": 60, "monetary_value": 80, "social_urgency": 40},
    "phones":          {"url_reputation": 10, "sender_history": 65, "content_phish": 25, "behavioral_anomalies": 45, "monetary_value": 30, "social_urgency": 60},
    "emails":          {"url_reputation": 55, "sender_history": 70, "content_phish": 60, "behavioral_anomalies": 35, "monetary_value": 25, "social_urgency": 40},
    "amounts":         {"url_reputation": 10, "sender_history": 30, "content_phish": 45, "behavioral_anomalies": 50, "monetary_value": 95, "social_urgency": 65},
    "ip_addresses":    {"url_reputation": 70, "sender_history": 45, "content_phish": 35, "behavioral_anomalies": 75, "monetary_value": 15, "social_urgency": 25},
    "urgency_keywords":{"url_reputation": 20, "sender_history": 30, "content_phish": 55, "behavioral_anomalies": 60, "monetary_value": 40, "social_urgency": 90},
    "financial_keywords":{"url_reputation": 25,"sender_history": 35, "content_phish": 65, "behavioral_anomalies": 55, "monetary_value": 90, "social_urgency": 70},
    "threat_keywords": {"url_reputation": 15, "sender_history": 40, "content_phish": 60, "behavioral_anomalies": 80, "monetary_value": 50, "social_urgency": 85},
    "default":         {"url_reputation": 40, "sender_history": 40, "content_phish": 40, "behavioral_anomalies": 40, "monetary_value": 40, "social_urgency": 40},
}


def _make_profile(entity_type: str, entity_value: str) -> dict:
    """Return a deterministic risk profile based on entity type and a hash of its value."""
    base = _PROFILE_BASES.get(entity_type, _PROFILE_BASES["default"])
    # Create a stable small jitter from the entity's content (±8 points)
    h = int(hashlib.md5(entity_value.encode()).hexdigest(), 16)
    jitter_vals = [(h >> (i * 4)) & 0xF for i in range(6)]  # 0-15 each
    dims = ["url_reputation", "sender_history", "content_phish",
            "behavioral_anomalies", "monetary_value", "social_urgency"]
    return {
        d: min(100, max(0, base[d] + jitter_vals[i] - 8))
        for i, d in enumerate(dims)
    }


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class MessageRequest(BaseModel):
    message: str

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("message must not be empty")
        if len(v) > 5000:
            raise ValueError("message too long (max 5000 characters)")
        return v


# ---------------------------------------------------------------------------
# Helper: build graph excluding keyword nodes (they aren't real graph nodes)
# ---------------------------------------------------------------------------
_KEYWORD_TYPES = {"urgency_keywords", "financial_keywords", "threat_keywords"}


def _graph_entities(entities: dict) -> dict:
    return {k: v for k, v in entities.items() if k not in _KEYWORD_TYPES and v}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/predict", tags=["analysis"])
def predict(data: MessageRequest):
    message = data.message

    # ML prediction
    result = predict_message(message)

    # Entity extraction
    entities = extract_entities(message)
    non_empty_entities = {k: v for k, v in entities.items() if v}

    # Graph (only structural entities, not keyword lists)
    graph_entities = _graph_entities(entities)
    G = build_graph_from_entities(graph_entities)
    graph_info = get_graph_info(G)
    central_nodes = get_central_nodes(G)
    graph_data = get_graph_data(G)

    # ---- Risk scoring ----
    risk_score = 0.0
    entity_count = 0

    for node in graph_data["nodes"]:
        if node["type"] == "message":
            node["node_risk"] = 0
            node["risk_profile"] = {d: 0 for d in ["url_reputation", "sender_history",
                                                    "content_phish", "behavioral_anomalies",
                                                    "monetary_value", "social_urgency"]}
            continue

        weight = RISK_WEIGHTS.get(node["type"], 0.35)
        node_risk = round(weight * 100, 2)
        node["node_risk"] = node_risk
        node["risk_profile"] = _make_profile(node["type"], node["id"])
        risk_score += weight
        entity_count += 1

    # Bonus for scam keywords detected (doesn't add graph nodes but boosts score)
    keyword_boost = 0.0
    for ktype in _KEYWORD_TYPES:
        kws = entities.get(ktype, [])
        if kws:
            keyword_boost += RISK_WEIGHTS.get(ktype, 0.5) * min(len(kws), 3) * 0.1

    # Combine entity risk + keyword boost + ML confidence
    ml_label = result.get("prediction", "ham")
    ml_confidence = float(result.get("confidence", 0.5))
    ml_factor = ml_confidence if ml_label == "spam" else (1.0 - ml_confidence) * 0.3

    if entity_count > 0:
        base_risk = risk_score / entity_count
    else:
        base_risk = 0.0

    combined_risk = base_risk * 0.5 + ml_factor * 0.4 + min(keyword_boost, 0.3) * 0.1
    combined_risk = round(min(combined_risk, 1.0), 3)
    risk_score_pct = round(combined_risk * 100, 2)

    if combined_risk > 0.6:
        risk_level = "High"
    elif combined_risk > 0.3:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    # Graph narrative summary
    clusters = set(n["cluster"] for n in graph_data["nodes"] if n["type"] != "message")
    top_entity = central_nodes[0]["entity"] if central_nodes else "None"

    if entity_count == 0 and not any(entities.get(k) for k in _KEYWORD_TYPES):
        structure_text = "No suspicious entities detected."
    elif entity_count == 0:
        structure_text = "No network entities found but suspicious keywords were flagged."
    else:
        structure_text = f"{entity_count} suspicious network entities connected to the central message node."

    cluster_text = f"{len(clusters)} behavioral cluster(s) detected." if clusters else "No distinct clusters."

    if risk_level == "High":
        behavior = "Strong financial redirection or phishing pattern identified."
    elif risk_level == "Medium":
        behavior = "Moderate suspicious communication pattern detected."
    else:
        behavior = "Low-risk structural pattern."

    graph_summary = (
        f"This graph shows a communication network. "
        f"The white node represents the original message. "
        f"{structure_text} "
        f"Most influential entity: '{top_entity}'. "
        f"{cluster_text} "
        f"{behavior}"
    )

    return {
        "prediction": ml_label,
        "confidence": ml_confidence,
        "entities": non_empty_entities,
        "graph": graph_info,
        "graph_data": graph_data,
        "top_suspicious_nodes": central_nodes,
        "risk_level": risk_level,
        "risk_score": combined_risk,
        "risk_score_pct": risk_score_pct,
        "graph_summary": graph_summary,
        "keyword_flags": {
            "urgency": entities.get("urgency_keywords", []),
            "financial": entities.get("financial_keywords", []),
            "threat": entities.get("threat_keywords", []),
        },
    }


