"""FastAPI application for free email verification."""

from __future__ import annotations

import asyncio
import csv
import io
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .verifier import verify_email

MAX_BULK_EMAILS = 50_000
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
CONCURRENCY_LIMIT = 32


class SingleVerifyRequest(BaseModel):
    email: str = Field(min_length=1, max_length=254)
    smtp_check: bool = False


class BulkVerifyResponse(BaseModel):
    results: list[dict[str, object]]
    total: int
    valid: int
    invalid: int
    disposable: int


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(
    title="MailVerify API",
    version="1.0.0",
    description="Free asynchronous email syntax, disposable-domain, and MX verification.",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8443"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/disposable-domains")
async def disposable_domains() -> dict[str, object]:
    from .verifier import DISPOSABLE_DOMAINS

    return {"total": len(DISPOSABLE_DOMAINS), "domains": sorted(DISPOSABLE_DOMAINS)}


@app.post("/api/verify-single")
async def verify_single(payload: SingleVerifyRequest) -> dict[str, object]:
    return (await verify_email(payload.email, smtp_check=payload.smtp_check)).as_dict()


def _emails_from_csv(content: str) -> list[str]:
    reader = csv.reader(io.StringIO(content))
    emails: list[str] = []
    for row in reader:
        if not row:
            continue
        candidate = row[0].strip()
        if candidate.lower() in {"email", "email_address", "address"}:
            continue
        if candidate:
            emails.append(candidate)
    return emails


@app.post("/api/verify-bulk", response_model=BulkVerifyResponse)
async def verify_bulk(file: UploadFile = File(...)) -> BulkVerifyResponse:
    if file.content_type not in {"text/csv", "text/plain", "application/vnd.ms-excel"}:
        raise HTTPException(status_code=415, detail="Upload a CSV or TXT file.")

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 5 MB limit.")

    try:
        emails = _emails_from_csv(content.decode("utf-8-sig"))
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded.") from exc

    if not emails:
        raise HTTPException(status_code=400, detail="The uploaded file contains no email addresses.")
    if len(emails) > MAX_BULK_EMAILS:
        raise HTTPException(status_code=413, detail=f"Limit is {MAX_BULK_EMAILS:,} email addresses.")

    semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)

    async def limited_verify(email: str) -> dict[str, object]:
        async with semaphore:
            return (await verify_email(email)).as_dict()

    results = await asyncio.gather(*(limited_verify(email) for email in emails))
    counts = {status: sum(result["status"] == status for result in results) for status in ("valid", "invalid", "disposable")}
    return BulkVerifyResponse(
        results=results,
        total=len(results),
        valid=counts["valid"],
        invalid=counts["invalid"],
        disposable=counts["disposable"],
    )
