"""Generate and verify a FYERS API v3 access token using credentials from .env.

Usage:
    python3 test_fyers.py            # login flow -> new access token
    python3 test_fyers.py --check    # only verify FYERS_ACCESS_TOKEN from .env
"""
import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

# Homebrew Pythons installed under a non-default prefix (e.g. ~/homebrew) ship without a CA bundle, so every HTTPS call
# fails with CERTIFICATE_VERIFY_FAILED. Point OpenSSL at the macOS system bundle (verification stays ON).
if "SSL_CERT_FILE" not in os.environ and os.path.exists("/etc/ssl/cert.pem"):
    os.environ["SSL_CERT_FILE"] = "/etc/ssl/cert.pem"

API_BASE = "https://api-t1.fyers.in/api/v3"
DEFAULT_REDIRECT_URI = "https://trade.fyers.in/api-login/redirect-uri/index.html"
ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")


def load_env(path):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def request(method, url, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    req.add_header("Content-Type", "application/json")
    # FYERS sits behind Cloudflare, which rejects the default Python-urllib User-Agent (error 1010)
    req.add_header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) test_fyers/1.0")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"s": "error", "http_status": e.code, "body": raw[:500]}


def get_profile(app_id, access_token):
    return request("GET", f"{API_BASE}/profile", headers={"Authorization": f"{app_id}:{access_token}"})


def generate_token(app_id, secret_key, redirect_uri):
    auth_url = f"{API_BASE}/generate-authcode?" + urllib.parse.urlencode({
        "client_id": app_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "state": "test_fyers",
    })
    print("Open this URL and log in to FYERS:\n")
    print(auth_url, "\n")
    webbrowser.open(auth_url)

    redirected = input("Paste the full redirected URL (or just the auth_code): ").strip()
    if "auth_code=" in redirected:
        auth_code = urllib.parse.parse_qs(urllib.parse.urlparse(redirected).query)["auth_code"][0]
    else:
        auth_code = redirected

    app_id_hash = hashlib.sha256(f"{app_id}:{secret_key}".encode()).hexdigest()
    return request("POST", f"{API_BASE}/validate-authcode", body={
        "grant_type": "authorization_code",
        "appIdHash": app_id_hash,
        "code": auth_code,
    })


def main():
    env = load_env(ENV_PATH)
    app_id = env.get("FYERS_APP_ID")
    secret_key = env.get("FYERS_SECRET_KEY")
    redirect_uri = env.get("FYERS_REDIRECT_URI", DEFAULT_REDIRECT_URI)
    if not app_id or not secret_key:
        sys.exit("FYERS_APP_ID and FYERS_SECRET_KEY must be set in .env")

    if "--check" in sys.argv:
        token = env.get("FYERS_ACCESS_TOKEN")
        if not token:
            sys.exit("FYERS_ACCESS_TOKEN is not set in .env")
        print(json.dumps(get_profile(app_id, token), indent=2))
        return

    result = generate_token(app_id, secret_key, redirect_uri)
    token = result.get("access_token")
    if not token:
        sys.exit(f"Token generation failed: {json.dumps(result, indent=2)}")

    print("\nAccess token generated. Update .env with:\n")
    print(f"FYERS_ACCESS_TOKEN={token}\n")

    profile = get_profile(app_id, token)
    print("Profile check:", "OK" if profile.get("s") == "ok" else json.dumps(profile, indent=2))


if __name__ == "__main__":
    main()
