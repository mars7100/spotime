"""Persistence facade.

Selects a store backend at import time and re-exports its methods as module-level
functions, so the rest of the app just calls `db.create_media(...)` etc. regardless
of backend.

Backend chosen by SPOTIME_DB_BACKEND: "sqlite" (default) or "firestore".
"""
import os

_backend = os.environ.get("SPOTIME_DB_BACKEND", "sqlite").lower()

if _backend == "firestore":
    from .stores.firestore_store import FirestoreStore
    store = FirestoreStore()
else:
    from .stores.sqlite_store import SqliteStore
    store = SqliteStore()

backend_name = _backend

# Re-export the store's interface as module-level functions.
init = store.init
create_media = store.create_media
list_media = store.list_media
get_media = store.get_media
update_media_paths = store.update_media_paths
update_media_tags = store.update_media_tags
delete_media = store.delete_media
get_state = store.get_state
upsert_state = store.upsert_state
