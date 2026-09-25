"""Asynchronous email verification primitives backed by DNS MX lookups."""

from __future__ import annotations

import asyncio
import re
import smtplib
import socket
import time
from dataclasses import dataclass
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

    def as_dict(self) -> dict[str, object]:
        return {
            "email": self.email,
            "is_valid": self.is_valid,
            "status": self.status,
            "syntax_valid": self.syntax_valid,
            "mx_valid": self.mx_valid,
            "is_disposable": self.is_disposable,
            "mx_records": self.mx_records,
            "smtp_reachable": self.smtp_reachable,
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
        (str(answer.exchange).rstrip(".") for answer in answers),
        key=lambda host: host.lower(),
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

    mx_records: list[str] = []
    if syntax_valid:
        try:
            mx_records = await asyncio.to_thread(_lookup_mx, domain)
        except (dns.exception.DNSException, OSError):
            mx_records = []

    smtp_reachable: bool | None = None
    if smtp_check and mx_records:
        smtp_reachable = await asyncio.to_thread(_smtp_probe, mx_records[0])

    mx_valid = bool(mx_records)
    if is_disposable:
        status = "disposable"
    elif syntax_valid and mx_valid:
        status = "valid"
    else:
        status = "invalid"

    return VerificationResult(
        email=normalized,
        is_valid=status == "valid",
        status=status,
        syntax_valid=syntax_valid,
        mx_valid=mx_valid,
        is_disposable=is_disposable,
        mx_records=mx_records,
        smtp_reachable=smtp_reachable,
        execution_time_ms=max(1, round((time.perf_counter() - started) * 1000)),
    )
