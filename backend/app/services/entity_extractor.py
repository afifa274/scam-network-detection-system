import re

# ------------------------------------------------------------------
# Compiled patterns (compiled once at import time for performance)
# ------------------------------------------------------------------

_PHONE = re.compile(r'(?<!\d)\+?(?:91[-\s]?)?[6-9]\d{9}(?!\d)')
_EMAIL = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z]{2,}')
_URL = re.compile(r'https?://[^\s<>"]+|www\.[^\s<>"]+')
# UPI: word@upihandle  – exclude plain emails already captured above
_UPI = re.compile(r'\b[a-zA-Z0-9._-]{3,}@(?:oksbi|okaxis|okicici|okhdfcbank|ybl|ibl|upi|paytm|apl|indianbank|allbank|indus|barodampay|sbi|axis|icici|hdfc|kotak)\b', re.IGNORECASE)
_AMOUNT = re.compile(r'(?:₹|\$|Rs\.?|INR)\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*(?:rupees?|rs\.?|inr|dollars?)\b', re.IGNORECASE)
_BANK_ACCOUNT = re.compile(r'(?<!\d)\d{9,18}(?!\d)')
_IFSC = re.compile(r'\b[A-Z]{4}0[A-Z0-9]{6}\b')
_IP = re.compile(r'\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b')

# High-signal scam keywords grouped by category
_URGENCY_KEYWORDS = [
    "urgent", "immediately", "act now", "limited time", "expire",
    "last chance", "deadline", "hurry", "respond now", "within 24 hours",
    "asap", "final notice", "do not ignore",
]
_FINANCIAL_KEYWORDS = [
    "prize", "won", "lottery", "reward", "claim", "cashback", "refund",
    "winning", "jackpot", "lucky draw", "cash prize", "free money",
    "kyc", "verify account", "otp", "pin", "password", "bank details",
    "account number", "credit card", "debit card",
]
_THREAT_KEYWORDS = [
    "blocked", "suspended", "deactivated", "legal action", "arrest",
    "fir", "police", "court", "penalty", "fine", "violation",
]


def extract_entities(text: str) -> dict:
    text = text.strip()

    phones = _PHONE.findall(text)
    emails = _EMAIL.findall(text)
    urls = _URL.findall(text)
    upi_ids = _UPI.findall(text)
    amounts = _AMOUNT.findall(text)
    bank_accounts = _BANK_ACCOUNT.findall(text)
    ifsc_codes = _IFSC.findall(text)
    ip_addresses = _IP.findall(text)

    # Remove bank account candidates that are part of a phone number already found
    phone_digits = {re.sub(r'\D', '', p) for p in phones}
    bank_accounts = [b for b in bank_accounts if b not in phone_digits]

    # Deduplicate while preserving order
    def dedup(lst):
        seen = set()
        out = []
        for item in lst:
            if item not in seen:
                seen.add(item)
                out.append(item)
        return out

    text_lower = text.lower()
    urgency_flags = [kw for kw in _URGENCY_KEYWORDS if kw in text_lower]
    financial_flags = [kw for kw in _FINANCIAL_KEYWORDS if kw in text_lower]
    threat_flags = [kw for kw in _THREAT_KEYWORDS if kw in text_lower]

    return {
        "phones": dedup(phones),
        "emails": dedup(emails),
        "urls": dedup(urls),
        "upi_ids": dedup(upi_ids),
        "amounts": dedup(amounts),
        "bank_accounts": dedup(bank_accounts),
        "ifsc_codes": dedup(ifsc_codes),
        "ip_addresses": dedup(ip_addresses),
        "urgency_keywords": urgency_flags,
        "financial_keywords": financial_flags,
        "threat_keywords": threat_flags,
    }
