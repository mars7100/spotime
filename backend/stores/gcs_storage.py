"""Google Cloud Storage backend (Phase 3).

Audio bytes live in a private bucket. Playback uses V4 signed URLs so the browser
fetches bytes straight from GCS (which supports HTTP Range natively) and Cloud Run
never touches the audio path.

Signing needs a key. We never ship a JSON key: instead we sign via IAM SignBlob
using an impersonated service account (SPOTIME_SIGNER_SA). Locally your user
impersonates that SA; on Cloud Run the runtime SA impersonates itself. Either way
no private key hits disk.
"""
import os
from datetime import timedelta
from pathlib import Path
from typing import Optional

from google.auth import default, impersonated_credentials
from google.cloud import storage as gcs
from google.cloud.exceptions import NotFound

# Impersonation for signing goes through IAM SignBlob, which needs a broad scope.
SIGN_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]
URL_TTL = timedelta(minutes=60)


class GcsStorage:
    def __init__(self):
        self._client = None
        self._bucket = None
        self._signing_creds = None
        self._signer_sa = None

    # ---- lazy client so importing never requires credentials ----
    def _init(self):
        if self._client is not None:
            return
        project = os.environ.get("GOOGLE_CLOUD_PROJECT")
        self._signer_sa = os.environ.get("SPOTIME_SIGNER_SA")
        source_creds, _ = default()

        # Data ops (upload/download/delete) use ambient credentials directly:
        # locally your user, on Cloud Run the runtime service account.
        self._client = gcs.Client(project=project, credentials=source_creds)
        self._bucket = self._client.bucket(os.environ["SPOTIME_GCS_BUCKET"])

        # Signing needs a key we don't have locally, so impersonate the signer SA
        # and let IAM SignBlob produce the signature. On Cloud Run the runtime SA
        # impersonates itself (needs Token Creator on itself).
        if self._signer_sa:
            self._signing_creds = impersonated_credentials.Credentials(
                source_credentials=source_creds,
                target_principal=self._signer_sa,
                target_scopes=SIGN_SCOPES,
            )

    @property
    def bucket(self):
        self._init()
        return self._bucket

    # ---- interface ----
    def save(self, key: str, data: bytes) -> None:
        self.bucket.blob(key).upload_from_string(data)

    def delete(self, key: str) -> None:
        blob = self.bucket.blob(key)
        if blob.exists():
            blob.delete()

    def read_bytes(self, key: str) -> Optional[bytes]:
        # One round-trip, not two. A missing blob raises NotFound, which is the
        # same answer an exists() probe would have cost a second GCS call to get
        # — and cover art fans out one call per library row, so the probe was
        # doubling the load that saturates the request threadpool.
        try:
            return self.bucket.blob(key).download_as_bytes()
        except NotFound:
            return None

    def exists(self, key: str) -> bool:
        return self.bucket.blob(key).exists()

    def play_url(self, key: str) -> str:
        self._init()
        return self.bucket.blob(key).generate_signed_url(
            version="v4", expiration=URL_TTL, method="GET",
            credentials=self._signing_creds, service_account_email=self._signer_sa)

    def upload_url(self, key: str, content_type: str) -> dict:
        # Signed V4 PUT URL — the browser uploads straight to GCS, bypassing
        # Cloud Run's request-size limit. The browser must send exactly this
        # Content-Type since it's part of the signature.
        self._init()
        url = self.bucket.blob(key).generate_signed_url(
            version="v4", expiration=timedelta(minutes=30), method="PUT",
            content_type=content_type,
            credentials=self._signing_creds, service_account_email=self._signer_sa)
        return {"url": url, "method": "PUT", "headers": {"Content-Type": content_type}}

    def local_path(self, key: str) -> Optional[Path]:
        # Not a local file — the stream endpoint redirects to play_url instead.
        return None
