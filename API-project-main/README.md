



## 🏗️ Comprehensive Project Architecture

This project is a Full-Stack application designed to automate the developer workflow by converting API documentation into functional SDK code.

### 1. Working Flowchart (Logic & Decision Making)

The flowchart below details the logic used by the backend to handle requests and generate the SDK.

* **Initialization**: The user inputs a City Name and a Documentation URL (which can even be a GitHub profile URL).
* **API Transmission**: The React frontend uses **Axios** to send a payload to the Flask backend.
* **Validation Layer**: The backend performs a **Strict Validation** check against the `wttr.in` API.
* **Conditional Branching**:
* **If Invalid**: If the city (e.g., "Chennaipur") doesn't match the database, a **404 Error** is returned to prevent "Garbage In, Garbage Out".
* **If Valid**: The backend proceeds to fetch the weather data and move to the generation phase.


* **SDK Synthesis**: The backend takes the user-provided URL and city to dynamically build a Python class string.

---

### 2. System Sequence Diagram (Component Interaction)

The following diagram illustrates the real-time communication between the Frontend, Backend, and External APIs.

* **Frontend (React)**: Manages the **App State** using the `useState` hook for values like `city`, `docUrl`, and `data`.
* **Middleware (CORS)**: Enables secure communication between the frontend (Port 5173) and backend (Port 5000).
* **Backend (Python Flask)**: Acts as the **Controller**, processing logic and communicating with:
* `wttr.in` for real-time weather data.
* `Open Exchange Rates` for currency logic.
* `Official Joke API` for the developer humor feature.



---

### 3. Detailed Technical Breakdown

| Component | Detailed Technical Functionality |
| --- | --- |
| **Input Controller** | React captures raw input strings. Even if you enter a GitHub profile URL, the system accepts it as a "Custom Base URL" to demonstrate flexibility. |
| **Strict City Validator** | Uses backend string matching. If the returned `areaName` from the API doesn't contain the user's input, it blocks the result, ensuring data accuracy. |
| **Code Generation Engine** | Uses **Python String Formatting** to inject variables into a pre-defined SDK class template, creating a downloadable or copyable code snippet. |
| **Asynchronous Handling** | The `fetchData` function in React is marked as `async` to handle the wait time for backend processing without freezing the UI. |

---


