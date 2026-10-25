# SmartDevTool — API Integration & Client Code Generator

A developer tool where you paste an API URL and it does two things at once:

1. **Live-tests** the API against the real server (status code, response time, response size, data preview).
2. **Generates ready-to-use client code** for that exact request in **Python**, **JavaScript (fetch)** and **cURL**.

**Domain:** Developer Tools — API Integration & Client Code Generation

---

## Features

- Request builder: URL, HTTP method (GET / POST / PUT / PATCH / DELETE), query params, headers, JSON body, timeout
- Live test of the real API with status, latency and response preview
- Auto-generated Python SDK class with error handling (timeout, connection error, HTTP error), `fetch_data()`, `fetch_raw()` and `ping()`
- Language tabs: switch the same request between Python, JavaScript and cURL
- Copy to clipboard and download as a file
- One-click presets (free, no API key needed): **Weather**, **GitHub User**, **IP Geolocation**
- Quick APIs tab for Weather with strict input validation
- Server status indicator in the header

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, Axios, plain CSS |
| Backend | Python 3, Flask, Flask-CORS, Requests |
| Communication | REST (JSON over HTTP) |

---

## Project Structure

```
API-project-main/
├── index.html          # Vite entry page (loads the React app)
├── package.json        # Frontend dependencies and scripts
├── vite.config.js
└── src/
    ├── main.jsx        # React entry
    ├── App.jsx         # Frontend UI (request builder, results, language tabs)
    ├── App.css
    ├── app.py          # Flask backend (run this for the API server)
    └── requirements.txt
```

> The `server/` and `client/` folders are leftovers from a separate project and are **not used** by SmartDevTool. You can ignore or delete them.

---

## How It Works

```
React frontend (localhost:5173)
        │  Axios POST /api/generate-sdk
        ▼
Flask backend (localhost:5000)
        │  requests.get/post(...)
        ▼
External API (wttr.in, api.github.com, ip-api.com, ...)
        │
        ▼
Backend returns { live_test, sdk_code, meta } → frontend displays it
```

1. You enter the URL, method, params, headers and body in the browser.
2. The frontend sends these details to the Flask backend.
3. Flask validates the input, calls the real external API and measures the result.
4. Flask builds a Python SDK class for that request.
5. The frontend shows the live result and the generated code. JavaScript and cURL versions are generated in the browser from the same request.

---

## Getting Started

### Prerequisites

- Python 3.9+
- Node.js 18+ and npm

### 1. Start the backend (Terminal 1)

```bash
cd src
pip install -r requirements.txt
python app.py
```

Wait for `Running on http://127.0.0.1:5000` and leave this terminal open.

### 2. Start the frontend (Terminal 2 — a new window)

Run this from the project root (the folder containing `package.json`):

```bash
npm install
npm run dev
```

Open the link it prints (usually `http://localhost:5173/`).

> Do not double-click `index.html`. The app only works through the Vite dev server.

---

## Usage

1. Click a preset (for example **Weather**) or enter your own URL.
2. Add params, headers or a JSON body if needed.
3. Click **Generate SDK & Test Live**.
4. Read the live test result, then switch between the **Python / JavaScript / cURL** tabs.
5. Copy or download the code.

---

## Backend API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Server status check |
| POST | `/api/validate-url` | Validates a URL |
| POST | `/api/generate-sdk` | Live-tests an API and returns the generated SDK |
| GET | `/api/weather` | Weather lookup with strict city validation |
