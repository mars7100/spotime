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
