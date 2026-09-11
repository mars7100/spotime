"""The static cache policy.

This is the one backend behaviour the React port changes, and it is the failure
that hides: wrong headers here produce an app that works perfectly while serving
code nobody can see, or code nobody can escape.
"""


def test_hashed_asset_is_cached_forever(client):
    r = client.get("/assets/index-B7xK2p1q.js")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_entry_html_revalidates(client):
    for path in ("/", "/index.html"):
        r = client.get(path)
        assert r.status_code == 200, path
        assert r.headers["cache-control"] == "no-cache", path


def test_unhashed_asset_revalidates(client):
    # A file under /assets whose name carries no hash is not safe to pin.
    r = client.get("/assets/logo.svg")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-cache"


def test_api_responses_are_untouched(client):
    r = client.get("/api/media")
    assert r.status_code == 200
    assert "cache-control" not in r.headers


def test_artwork_is_cached_forever(client):
    # Cover art is the one /api response that carries a cache header. It is
    # written once at register and never replaced, and the library fans out one
    # request per row — uncached, that stampede is what takes the service down.
    import base64

    up = client.post("/api/media/upload-url",
                     json={"filename": "cover.mp3", "content_type": "audio/mpeg"}).json()
    assert client.put(up["url"], content=b"not really audio").status_code == 200
    media = client.post("/api/media/register", json={
        "id": up["id"], "filename": "cover.mp3",
        "cover_base64": base64.b64encode(b"jpeg-bytes").decode(),
    })
    assert media.status_code == 201, media.text

    r = client.get(f"/api/media/{up['id']}/artwork")
    assert r.status_code == 200
    assert r.content == b"jpeg-bytes"
    assert r.headers["cache-control"] == "public, max-age=31536000, immutable"
