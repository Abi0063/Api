"""
╔══════════════════════════════════════════════════════════════════╗
║   Smart Developer Tool — Flask Backend                          ║
║   SDK Generator with Strict Validation & Live Test Layer        ║
║                                                                  ║
║   Run:  python app.py                                            ║
║   API:  http://127.0.0.1:5000                                   ║
╚══════════════════════════════════════════════════════════════════╝
"""

import json
import re
import time
from urllib.parse import urlparse

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from requests.exceptions import ConnectionError as ReqConnectionError
from requests.exceptions import RequestException, Timeout

# ──────────────────────────────────────────────────────────────────
#  App setup
# ──────────────────────────────────────────────────────────────────

app = Flask(__name__)

CORS(app, resources={r"/api/*": {"origins": "*"}})   # open for local dev

VALID_METHODS   = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
BODY_METHODS    = {"POST", "PUT", "PATCH"}
LIVE_TEST_TIMEOUT = 12   # seconds


# ──────────────────────────────────────────────────────────────────
#  Pure helpers
# ──────────────────────────────────────────────────────────────────

def is_valid_url(url: str) -> bool:
    """Return True if url has a valid http/https scheme and a netloc."""
    try:
        p = urlparse(url)
        return p.scheme in ("http", "https") and bool(p.netloc)
    except Exception:
        return False


def class_name_from_url(url: str) -> str:
    """
    Derive a PascalCase SDK class name from the URL hostname.
    e.g. 'https://wttr.in/...' → 'WttrInClient'
    """
    try:
        hostname = urlparse(url).hostname or "api"
        parts = re.split(r"[.\-_]", hostname)
        return "".join(p.capitalize() for p in parts if p) + "Client"
    except Exception:
        return "SmartAPIClient"


def http_status_label(code: int) -> str:
    if 100 <= code < 200:
        return "Informational"
    if 200 <= code < 300:
        return "Success"
    if 300 <= code < 400:
        return "Redirection"
    if 400 <= code < 500:
        return "Client Error"
    if 500 <= code < 600:
        return "Server Error"
    return "Unknown"


def format_size(n_bytes: int) -> str:
    if n_bytes >= 1_048_576:
        return f"{n_bytes / 1_048_576:.2f} MB"
    if n_bytes >= 1_024:
        return f"{n_bytes / 1_024:.1f} KB"
    return f"{n_bytes} B"


def py_dict_literal(d: dict, base_indent: int = 2) -> str:
    """
    Render a dict as a pretty Python dict literal for embedding
    inside a code-generated string.
    """
    if not d:
        return "{}"
    pad    = " " * (base_indent * 4)
    endpad = " " * ((base_indent - 1) * 4)
    inner  = ",\n".join(f'{pad}"{k}": "{v}"' for k, v in d.items())
    return "{\n" + inner + ",\n" + endpad + "}"


# ──────────────────────────────────────────────────────────────────
#  Strict Validation Layer
# ──────────────────────────────────────────────────────────────────

def validate_sdk_payload(payload: dict) -> list[str]:
    """
    Validate the /api/generate-sdk request body.
    Returns a list of error strings; empty list = valid.
    """
    errors: list[str] = []

    # ── api_url ────────────────────────────────────────────────────
    api_url = payload.get("api_url", "")
    if not isinstance(api_url, str) or not api_url.strip():
        errors.append("'api_url' is required and must be a non-empty string.")
        return errors   # nothing else makes sense without a URL

    api_url = api_url.strip()
    if not is_valid_url(api_url):
        errors.append(
            f"'api_url' \"{api_url}\" is not a valid HTTP/HTTPS URL. "
            "Example: https://api.example.com/v1/endpoint"
        )

    # ── method ────────────────────────────────────────────────────
    method = str(payload.get("method", "GET")).strip().upper()
    if method not in VALID_METHODS:
        errors.append(
            f"'method' \"{method}\" is not supported. "
            f"Allowed: {', '.join(sorted(VALID_METHODS))}."
        )

    # ── params ────────────────────────────────────────────────────
    params = payload.get("params", {})
    if params is not None and not isinstance(params, dict):
        errors.append("'params' must be a JSON object {key: value}, not a list or primitive.")
    elif isinstance(params, dict):
        # Validate city/q param if present
        city_val = str(params.get("city", params.get("q", ""))).strip()
        if city_val and not re.match(r"^[A-Za-z\s\-\.]{2,50}$", city_val):
            errors.append(
                f"Query parameter 'city' value \"{city_val}\" looks invalid. "
                "City names must contain only letters, spaces, or hyphens (2–50 chars)."
            )

    # ── headers ───────────────────────────────────────────────────
    headers = payload.get("headers", {})
    if headers is not None and not isinstance(headers, dict):
        errors.append("'headers' must be a JSON object {key: value}.")
    elif isinstance(headers, dict) and method in BODY_METHODS:
        has_ct = any(k.lower() == "content-type" for k in headers)
        if not has_ct:
            errors.append(
                f"Method '{method}' sends a body — please include a "
                "'Content-Type' header (e.g., 'application/json')."
            )

    # ── body ──────────────────────────────────────────────────────
    body = payload.get("body")
    if body is not None and not isinstance(body, (dict, list, str)):
        errors.append("'body' must be a JSON object, array, or string.")

    # ── timeout ───────────────────────────────────────────────────
    timeout = payload.get("timeout")
    if timeout is not None:
        if not isinstance(timeout, (int, float)) or timeout <= 0 or timeout > 120:
            errors.append("'timeout' must be a positive number between 1 and 120 seconds.")

    return errors


# ──────────────────────────────────────────────────────────────────
#  SDK Code Generator
# ──────────────────────────────────────────────────────────────────

def build_sdk_code(
    api_url:  str,
    method:   str,
    params:   dict,
    headers:  dict,
    body_obj: dict | None,
    timeout:  int = 15,
) -> str:
    """
    Dynamically synthesise a complete, runnable Python SDK class.
    """
    cls         = class_name_from_url(api_url)
    method_up   = method.upper()
    method_lo   = method.lower()
    has_body    = method_up in BODY_METHODS

    params_lit  = py_dict_literal(params  or {})
    headers_lit = py_dict_literal(headers or {})
    body_lit    = repr(body_obj) if body_obj else "None"
    body_arg    = ", json=self.body" if has_body else ""

    # ── compose the file ──────────────────────────────────────────
    return f'''\
"""
╔══════════════════════════════════════════════════════════╗
║  Auto-Generated Python SDK                              ║
║  Source : {api_url:<48} ║
║  Method : {method_up:<48} ║
║  Tool   : Smart Developer Tool — SDK Generator          ║
╚══════════════════════════════════════════════════════════╝

Usage
─────
    from sdk import {cls}

    client = {cls}()
    data   = client.fetch_data()
    print(data)

Requirements
────────────
    pip install requests
"""

import time
import requests
from requests.exceptions import (
    ConnectionError,
    HTTPError,
    RequestException,
    Timeout,
)


class {cls}:
    """
    SDK wrapper for {api_url}

    This class was auto-generated by Smart Developer Tool.
    Modify default values in __init__ to suit your project.
    """

    BASE_URL        = "{api_url}"
    DEFAULT_TIMEOUT = {timeout}    # seconds

    def __init__(
        self,
        base_url : str  = BASE_URL,
        params   : dict = None,
        headers  : dict = None,
        body     : dict = None,
        timeout  : int  = DEFAULT_TIMEOUT,
    ):
        self.base_url = base_url.rstrip("/")
        self.params   = params  if params  is not None else {params_lit}
        self.headers  = headers if headers is not None else {headers_lit}
        self.body     = body    if body    is not None else {body_lit}
        self.timeout  = timeout

    # ──────────────────────────────────────────────────────────────
    #  fetch_data — primary method
    # ──────────────────────────────────────────────────────────────

    def fetch_data(self) -> dict | list:
        """
        Perform a {method_up} request to self.base_url.

        Returns
        -------
        dict | list
            Parsed JSON response body.

        Raises
        ------
        RuntimeError
            On any network, timeout, or HTTP-level failure.
        """
        try:
            response = requests.{method_lo}(
                self.base_url,
                params  = self.params,
                headers = self.headers{body_arg},
                timeout = self.timeout,
            )
            response.raise_for_status()     # 4xx / 5xx → HTTPError
            return response.json()

        except Timeout:
            raise RuntimeError(
                f"Request timed out after {{self.timeout}} s. "
                "Try increasing the timeout or check your connection."
            ) from None

        except ConnectionError:
            raise RuntimeError(
                "Network error — could not reach the API. "
                "Verify the URL and your internet connection."
            ) from None

        except HTTPError as exc:
            raise RuntimeError(
                f"HTTP {{response.status_code}} {method_up} {{self.base_url!r}} — "
                f"{{response.reason}}. "
                f"Body: {{response.text[:300]!r}}"
            ) from exc

        except ValueError:
            raise RuntimeError(
                "API returned a non-JSON response. "
                "Use fetch_raw() to get the plain text."
            ) from None

        except RequestException as exc:
            raise RuntimeError(f"Unexpected request error: {{exc}}") from exc

    # ──────────────────────────────────────────────────────────────
    #  fetch_raw — returns text, never raises on HTTP errors
    # ──────────────────────────────────────────────────────────────

    def fetch_raw(self) -> str:
        """Return the raw response text (useful for non-JSON APIs)."""
        try:
            r = requests.{method_lo}(
                self.base_url,
                params  = self.params,
                headers = self.headers{body_arg},
                timeout = self.timeout,
            )
            return r.text
        except RequestException as exc:
            raise RuntimeError(f"Request failed: {{exc}}") from exc

    # ──────────────────────────────────────────────────────────────
    #  ping — lightweight health-check
    # ──────────────────────────────────────────────────────────────

    def ping(self) -> dict:
        """
        Fire a HEAD/GET request and return status + latency.
        Does NOT raise — returns {{"error": "..."}} on failure.
        """
        t0 = time.perf_counter()
        try:
            r = requests.head(self.base_url, timeout=self.timeout)
            latency = round((time.perf_counter() - t0) * 1000, 1)
            return {{
                "url"         : self.base_url,
                "status_code" : r.status_code,
                "ok"          : r.ok,
                "latency_ms"  : latency,
            }}
        except RequestException as exc:
            return {{"url": self.base_url, "error": str(exc)}}


# ──────────────────────────────────────────────────────────────────
#  Quick-test entrypoint
# ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 56)
    print(f"  SDK Quick-Test: {cls}")
    print("=" * 56)

    client = {cls}()

    print("\\n[1] ping()")
    print(client.ping())

    print("\\n[2] fetch_data()")
    try:
        data = client.fetch_data()
        if isinstance(data, (dict, list)):
            import json
            print(json.dumps(data, indent=2)[:800])
        else:
            print(data)
    except RuntimeError as exc:
        print(f"  Error: {{exc}}")

    print("\\n[3] fetch_raw()  (first 300 chars)")
    try:
        print(client.fetch_raw()[:300])
    except RuntimeError as exc:
        print(f"  Error: {{exc}}")
'''


# ──────────────────────────────────────────────────────────────────
#  Live-test helper
# ──────────────────────────────────────────────────────────────────

def run_live_test(
    method:   str,
    api_url:  str,
    params:   dict,
    headers:  dict,
    body_obj: dict | None,
) -> dict:
    """
    Make a real HTTP request to api_url and return a structured
    result dict suitable for the JSON response.
    Never raises — errors are captured in the result.
    """
    try:
        t0 = time.perf_counter()

        resp = requests.request(
            method  = method,
            url     = api_url,
            params  = params  or {},
            headers = headers or {},
            json    = body_obj if method in BODY_METHODS else None,
            timeout = LIVE_TEST_TIMEOUT,
        )

        elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)

        result = {
            "status_code"   : resp.status_code,
            "status_text"   : resp.reason,
            "status_label"  : http_status_label(resp.status_code),
            "latency_ms"    : elapsed_ms,
            "size_bytes"    : len(resp.content),
            "size_human"    : format_size(len(resp.content)),
            "content_type"  : resp.headers.get("Content-Type", ""),
        }

        # Response preview (JSON preferred, then plain text)
        try:
            parsed = resp.json()
            preview = json.dumps(parsed, indent=2, ensure_ascii=False)
            result["data_preview"]  = preview[:2000] + (" …(truncated)" if len(preview) > 2000 else "")
            result["response_type"] = "json"
        except ValueError:
            text = resp.text
            result["data_preview"]  = text[:1000] + (" …(truncated)" if len(text) > 1000 else "")
            result["response_type"] = "text"

        return result

    except Timeout:
        return {"error": f"Live test timed out after {LIVE_TEST_TIMEOUT} s. SDK was still generated."}
    except ReqConnectionError:
        return {"error": "Could not reach the URL during live test. SDK was still generated."}
    except RequestException as exc:
        return {"error": f"Live test failed: {exc}"}


# ──────────────────────────────────────────────────────────────────
#  Route: POST /api/generate-sdk    ← PRIMARY ENDPOINT
# ──────────────────────────────────────────────────────────────────

@app.route("/api/generate-sdk", methods=["POST"])
def generate_sdk():
    """
    Generate a Python SDK class from an API specification.

    Request JSON
    ────────────
    {
        "api_url"  : "https://wttr.in/Chennai?format=j1",  ← required
        "method"   : "GET",                                 ← default GET
        "params"   : { "city": "Chennai" },                 ← optional
        "headers"  : { "Accept": "application/json" },      ← optional
        "body"     : { "key": "value" },                    ← POST/PUT/PATCH only
        "timeout"  : 15                                     ← optional (seconds)
    }

    Response JSON (200)
    ───────────────────
    {
        "success"  : true,
        "sdk_code" : "...",
        "live_test": { "status_code": 200, "latency_ms": 142, ... },
        "meta"     : { "class": "WttrInClient", "method": "GET", ... }
    }

    Response JSON (400 / 415)
    ─────────────────────────
    {
        "success" : false,
        "error"   : "Validation failed.",
        "details" : ["'api_url' is required ...", ...]
    }
    """
    # ── Content-Type guard ────────────────────────────────────────
    if not request.is_json:
        return jsonify({
            "success": False,
            "error"  : "Content-Type must be 'application/json'.",
            "details": []
        }), 415

    payload = request.get_json(silent=True) or {}

    # ── 1. Strict validation ──────────────────────────────────────
    errors = validate_sdk_payload(payload)
    if errors:
        return jsonify({
            "success": False,
            "error"  : "Validation failed. Fix the issues below and try again.",
            "details": errors
        }), 400

    # ── 2. Extract validated fields ───────────────────────────────
    api_url  = payload["api_url"].strip()
    method   = str(payload.get("method", "GET")).strip().upper()
    params   = dict(payload.get("params",  {}) or {})
    headers  = dict(payload.get("headers", {}) or {})
    body_obj = payload.get("body") or None
    timeout  = int(payload.get("timeout", 15))

    # ── 3. Live test ──────────────────────────────────────────────
    live_result = run_live_test(method, api_url, params, headers, body_obj)

    # ── 4. Generate SDK code ──────────────────────────────────────
    sdk_code = build_sdk_code(api_url, method, params, headers, body_obj, timeout)

    return jsonify({
        "success"  : True,
        "sdk_code" : sdk_code,
        "live_test": live_result,
        "meta"     : {
            "api_url"   : api_url,
            "method"    : method,
            "class_name": class_name_from_url(api_url),
            "params"    : params,
            "headers"   : headers,
            "timeout"   : timeout,
        },
    }), 200


# ──────────────────────────────────────────────────────────────────
#  Route: GET /api/weather
# ──────────────────────────────────────────────────────────────────

@app.route("/api/weather", methods=["GET"])
def get_weather():
    """
    Fetch live weather for a city and return an SDK preview.

    Query params:  city (required), url (optional, the "doc URL" shown in SDK)
    """
    city    = request.args.get("city", "").strip()
    doc_url = request.args.get("url", "https://wttr.in").strip()

    # ── validate city ─────────────────────────────────────────────
    if not city:
        return jsonify({"error": "Query parameter 'city' is required."}), 400
    if len(city) < 2:
        return jsonify({"error": "City name must be at least 2 characters."}), 400
    if not re.match(r"^[A-Za-z\s\-\.]{2,50}$", city):
        return jsonify({"error": "City name must contain letters only (2–50 chars)."}), 400

    try:
        resp = requests.get(
            f"https://wttr.in/{city}?format=j1",
            timeout=10,
            headers={"User-Agent": "SmartDevTool/1.0"},
        )
        resp.raise_for_status()
        data = resp.json()

        # ── verify city was actually found ────────────────────────
        nearest   = data.get("nearest_area", [{}])[0]
        area_name = nearest.get("areaName",  [{}])[0].get("value", "").lower()
        country   = nearest.get("country",   [{}])[0].get("value", "")

        if city.lower() not in area_name and area_name not in city.lower():
            return jsonify({
                "error": f"City '{city}' not found — did you mean '{area_name.title()}'?"
            }), 404

        current = data["current_condition"][0]
        temp_c  = current["temp_C"]
        desc    = current["weatherDesc"][0]["value"]
        humidity = current["humidity"]
        wind_kmph = current["windspeedKmph"]
        feels_c = current["FeelsLikeC"]

        # ── SDK preview specific to weather ──────────────────────
        sdk_preview = f'''\
# Auto-Generated Weather SDK — {city.title()}, {country}
# Generated by Smart Developer Tool
import requests

class SmartWeatherSDK:
    """Wrapper around the wttr.in weather API."""

    BASE_URL = "https://wttr.in"

    def __init__(self, base_url: str = BASE_URL, timeout: int = 10):
        self.base_url = base_url
        self.timeout  = timeout

    def get_weather(self, city: str = "{city}") -> dict:
        """Fetch current weather for city. Returns parsed JSON."""
        try:
            url      = f"{{self.base_url}}/{{city}}?format=j1"
            response = requests.get(url, timeout=self.timeout)
            response.raise_for_status()
            return response.json()
        except requests.HTTPError as e:
            raise RuntimeError(f"HTTP error: {{e}}") from e
        except requests.RequestException as e:
            raise RuntimeError(f"Network error: {{e}}") from e

    def get_temperature(self, city: str = "{city}") -> str:
        data = self.get_weather(city)
        return data["current_condition"][0]["temp_C"] + " °C"


if __name__ == "__main__":
    sdk  = SmartWeatherSDK()
    data = sdk.get_weather()
    cond = data["current_condition"][0]
    print(f"{{cond['temp_C']}} °C — {{cond['weatherDesc'][0]['value']}}")
'''

        return jsonify({
            "city"       : city.title(),
            "country"    : country,
            "temp"       : temp_c,
            "feels_like" : feels_c,
            "desc"       : desc,
            "humidity"   : humidity,
            "wind_kmph"  : wind_kmph,
            "sdk_preview": sdk_preview,
        })

    except requests.HTTPError:
        return jsonify({"error": "Weather API returned an error. Try another city."}), 502
    except (ValueError, KeyError):
        return jsonify({"error": "Unexpected response format from weather API."}), 502
    except Exception:
        return jsonify({"error": "Could not fetch weather data. Try again later."}), 500


# ──────────────────────────────────────────────────────────────────
#  Route: GET /api/currency
# ──────────────────────────────────────────────────────────────────

@app.route("/api/currency", methods=["GET"])
def get_currency():
    """Convert between currencies using open.er-api.com."""
    from_curr = request.args.get("from", "USD").upper().strip()
    to_curr   = request.args.get("to",   "INR").upper().strip()

    try:
        amount = float(request.args.get("amount", 1))
        if amount < 0:
            return jsonify({"error": "'amount' must be a positive number."}), 400
    except ValueError:
        return jsonify({"error": "'amount' must be a valid number."}), 400

    # validate currency codes (ISO 4217 — 3 uppercase letters)
    if not re.match(r"^[A-Z]{3}$", from_curr):
        return jsonify({"error": f"Invalid 'from' currency code: '{from_curr}'."}), 400
    if not re.match(r"^[A-Z]{3}$", to_curr):
        return jsonify({"error": f"Invalid 'to' currency code: '{to_curr}'."}), 400

    try:
        resp = requests.get(
            f"https://open.er-api.com/v6/latest/{from_curr}",
            timeout=8
        )
        resp.raise_for_status()
        data = resp.json()

        if data.get("result") == "error":
            return jsonify({"error": f"Unsupported currency code: '{from_curr}'."}), 400

        rates = data.get("rates", {})
        if to_curr not in rates:
            return jsonify({"error": f"Currency '{to_curr}' not available."}), 400

        rate   = rates[to_curr]
        result = round(rate * amount, 4)

        return jsonify({
            "from"      : from_curr,
            "to"        : to_curr,
            "amount"    : amount,
            "rate"      : f"{rate:.6f}",
            "result"    : f"{result:.4f}",
            "updated_at": data.get("time_last_update_utc", ""),
        })

    except requests.HTTPError:
        return jsonify({"error": f"Could not fetch rates for '{from_curr}'."}), 502
    except Exception:
        return jsonify({"error": "Currency conversion failed. Try again later."}), 500


# ──────────────────────────────────────────────────────────────────
#  Route: GET /api/joke
# ──────────────────────────────────────────────────────────────────

@app.route("/api/joke", methods=["GET"])
def get_joke():
    """Return a random programming joke from the public Jokes API."""
    try:
        resp = requests.get(
            "https://official-joke-api.appspot.com/random_joke",
            timeout=8
        )
        resp.raise_for_status()
        data = resp.json()
        return jsonify({
            "id"       : data.get("id"),
            "type"     : data.get("type"),
            "setup"    : data["setup"],
            "punchline": data["punchline"],
        })
    except (KeyError, ValueError):
        return jsonify({"error": "Unexpected response from Jokes API."}), 502
    except Exception:
        return jsonify({"error": "Could not fetch a joke. Try again later."}), 500


# ──────────────────────────────────────────────────────────────────
#  Route: GET /api/health
# ──────────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health_check():
    """Simple health-check endpoint."""
    return jsonify({
        "status" : "ok",
        "service": "Smart Developer Tool — SDK Generator",
        "version": "2.0.0",
    }), 200


# ──────────────────────────────────────────────────────────────────
#  Route: POST /api/validate-url
# ──────────────────────────────────────────────────────────────────

@app.route("/api/validate-url", methods=["POST"])
def validate_url_endpoint():
    """
    Lightweight endpoint that only validates a URL without generating
    an SDK. Useful for real-time frontend feedback.

    Request JSON:  { "url": "https://..." }
    Response JSON: { "valid": true/false, "errors": [...] }
    """
    if not request.is_json:
        return jsonify({"valid": False, "errors": ["Content-Type must be application/json."]}), 415

    data = request.get_json(silent=True) or {}
    url  = str(data.get("url", "")).strip()

    if not url:
        return jsonify({"valid": False, "errors": ["'url' is required."]}), 400

    valid  = is_valid_url(url)
    errors = [] if valid else [f"'{url}' is not a valid HTTP/HTTPS URL."]

    return jsonify({"valid": valid, "errors": errors}), 200


# ──────────────────────────────────────────────────────────────────
#  Error handlers
# ──────────────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(_err):
    return jsonify({"success": False, "error": "Endpoint not found."}), 404


@app.errorhandler(405)
def method_not_allowed(_err):
    return jsonify({"success": False, "error": "HTTP method not allowed on this endpoint."}), 405


@app.errorhandler(500)
def internal_error(_err):
    return jsonify({"success": False, "error": "Internal server error."}), 500


# ──────────────────────────────────────────────────────────────────
#  Entry point
# ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n" + "=" * 56)
    print("  Smart Developer Tool — SDK Generator Backend")
    print("  http://127.0.0.1:5000")
    print("=" * 56)
    print("  Endpoints:")
    print("    POST /api/generate-sdk   ← SDK generator (primary)")
    print("    POST /api/validate-url   ← URL validator")
    print("    GET  /api/weather        ← Live weather + SDK")
    print("    GET  /api/currency       ← Currency converter")
    print("    GET  /api/joke           ← Random dev joke")
    print("    GET  /api/health         ← Health check")
    print("=" * 56 + "\n")
    app.run(debug=True, port=5000)
