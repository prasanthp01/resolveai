from fastapi.testclient import TestClient
from app.sandbox import main


def test_built_studio_routes_and_api_boundaries(tmp_path, monkeypatch):
    frontend = tmp_path / "web/dist"
    frontend.mkdir(parents=True)
    (frontend / "index.html").write_text("<html><body>Studio</body></html>")
    (frontend / "app.js").write_text('console.log("studio")')
    monkeypatch.setattr(main, "ROOT", tmp_path)
    with TestClient(main.create_app(origin="http://testserver", secure=False)) as client:
        response = client.get("/")
        assert response.status_code == 200
        assert response.url.path == "/projects/resolveai/app/studio"
        assert "script-src 'self'" in response.headers["content-security-policy"]
        assert client.get("/projects/resolveai/app/app.js").status_code == 200
        assert client.get("/projects/resolveai/app/missing.js").status_code == 404
        assert client.get("/api/projects/resolveai/unknown").status_code == 404
        assert (
            client.get("/api/projects/resolveai/unknown")
            .headers["content-type"]
            .startswith("application/json")
        )
        assert client.get("/projects/resolveai/app/../../.env").status_code == 404
