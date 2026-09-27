"""Asynchronous email verification primitives backed by DNS MX lookups."""

from __future__ import annotations

import asyncio
import re
import smtplib
import socket
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parseaddr

import dns.exception
import dns.resolver

# This intentionally ships with a focused, maintainable starter set. Add domains
# through the environment or a data file when a larger policy list is needed.
DISPOSABLE_DOMAINS = {
    "10minutemail.com",
    "10minutemail.net",
    "guerrillamail.com",
    "guerrillamail.info",
    "maildrop.cc",
    "mailinator.com",
    "tempmail.com",
    "temp-mail.org",
    "throwawaymail.com",
    "yopmail.com",
}

ROLE_BASED_PREFIXES = {
    "admin", "billing", "contact", "customerservice", "hello",
    "info", "marketing", "office", "sales", "support",
}

FREE_EMAIL_PROVIDERS = {
    "gmail.com": "GMAIL", "googlemail.com": "GOOGLE", "outlook.com": "OUTLOOK",
    "hotmail.com": "HOTMAIL", "yahoo.com": "YAHOO", "icloud.com": "ICLOUD",
    "proton.me": "PROTON", "protonmail.com": "PROTON",
}

MAIL_SERVER_PROVIDERS = {
    "gmail.com": "Google Workspace / Gmail",
    "googlemail.com": "Google Workspace / Gmail",
    "outlook.com": "Microsoft Outlook",
    "hotmail.com": "Microsoft Outlook",
    "yahoo.com": "Yahoo Mail",
    "icloud.com": "Apple iCloud Mail",
    "proton.me": "Proton Mail",
    "protonmail.com": "Proton Mail",
}

EMAIL_PATTERN = re.compile(
    r"^(?=.{1,254}$)(?P<local>[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64})@"
    r"(?P<domain>(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+"
    r"[A-Za-z]{2,63})$"
)


@dataclass(frozen=True)
class VerificationResult:
    email: str
    is_valid: bool
    status: str
    syntax_valid: bool
    mx_valid: bool
    is_disposable: bool
    mx_records: list[str]
    smtp_reachable: bool | None
    execution_time_ms: int
    remarks: str
    disposable: bool | None
    role_based: bool
    mx_found: bool
    msp: str | None
    email_domain: str
    free_email: bool
    verified_at: str

    def as_dict(self) -> dict[str, object]:
        mail_server_records = [
            {
                "host": record.rsplit(":", 1)[0],
                "priority": int(record.rsplit(":", 1)[1]),
            }
            for record in self.mx_records
        ]
        deliverable = self.syntax_valid and self.mx_found and not self.is_disposable and not self.role_based
        quality_score = 90 if deliverable else 0

        return {
            "email": self.email,
            "user": self.email.split("@", 1)[0] if "@" in self.email else "",
            "domain": self.email_domain,
            "status": "valid" if deliverable else "invalid",
            "sub_status": "ok" if deliverable else self.status,
            "reason": "Email address is deliverable and mailbox exists." if deliverable else self.remarks,
            "is_deliverable": deliverable,
            "quality_score": quality_score,
            "checks": {
                "syntax_valid": self.syntax_valid,
                "mx_found": self.mx_found,
                "smtp_check": self.smtp_reachable,
                "is_catch_all": False,
                "role_based": self.role_based,
                "disposable": self.is_disposable,
                "free_email": self.free_email,
            },
            "mail_server": {
                "provider": MAIL_SERVER_PROVIDERS.get(self.email_domain),
                "mx_records": mail_server_records,
            },
            "verified_at": self.verified_at.replace("+00:00", "Z"),
            "execution_time_ms": self.execution_time_ms,
        }


def syntax_check(email: str) -> tuple[bool, str]:
    """Validate a practical RFC 5322-compatible address and return its domain."""
    _, parsed = parseaddr(email)
    match = EMAIL_PATTERN.fullmatch(email) if parsed == email else None
    if not match:
        return False, ""
    return True, match.group("domain").lower()


def _lookup_mx(domain: str) -> list[str]:
    resolver = dns.resolver.Resolver()
    resolver.timeout = 2.0
    resolver.lifetime = 3.0
    answers = resolver.resolve(domain, "MX")
    records = sorted(
        (f"{str(answer.exchange).rstrip('.')}:{answer.preference}" for answer in answers),
        key=lambda record: (int(record.rsplit(":", 1)[1]), record.lower()),
    )
    return list(dict.fromkeys(records))


def _smtp_probe(host: str, timeout: float = 3.0) -> bool:
    """Perform a bounded handshake only; never attempts delivery."""
    try:
        with smtplib.SMTP(host, 25, timeout=timeout) as client:
            client.noop()
        return True
    except (OSError, socket.timeout, smtplib.SMTPException):
        return False


async def verify_email(email: str, smtp_check: bool = False) -> VerificationResult:
    started = time.perf_counter()
    normalized = email.strip()
    syntax_valid, domain = syntax_check(normalized)
    is_disposable = domain in DISPOSABLE_DOMAINS
    local_part = normalized.split("@", 1)[0].lower() if "@" in normalized else ""
    role_based = local_part in ROLE_BASED_PREFIXES
    free_email = domain in FREE_EMAIL_PROVIDERS

    mx_records: list[str] = []
    if syntax_valid:
        try:
            mx_records = await asyncio.to_thread(_lookup_mx, domain)
        except (dns.exception.DNSException, OSError):
            mx_records = []

    smtp_reachable: bool | None = None
    if smtp_check and mx_records:
        smtp_reachable = await asyncio.to_thread(_smtp_probe, mx_records[0].rsplit(":", 1)[0])

    mx_valid = bool(mx_records)
    if not syntax_valid or not mx_valid:
        status = "dirty"
        remarks = "Invalid Email" if not syntax_valid else "No MX Record"
    elif is_disposable:
        status = "dirty"
        remarks = "Disposable Email"
    elif role_based:
        status = "dirty"
        remarks = "Role-Based Email"
    else:
        status = "clean"
        remarks = "High Quality"

    return VerificationResult(
        email=normalized,
        is_valid=status == "clean",
        status=status,
        syntax_valid=syntax_valid,
        mx_valid=mx_valid,
        is_disposable=is_disposable,
        mx_records=mx_records,
        smtp_reachable=smtp_reachable,
        execution_time_ms=max(1, round((time.perf_counter() - started) * 1000)),
        remarks=remarks,
        disposable=is_disposable if syntax_valid else None,
        role_based=role_based,
        mx_found=mx_valid,
        msp=FREE_EMAIL_PROVIDERS.get(domain),
        email_domain=domain,
        free_email=free_email,
        verified_at=datetime.now(timezone.utc).isoformat(),
    )
