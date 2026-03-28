<!--
SPDX-FileCopyrightText: 2026 Daniel Eder

SPDX-License-Identifier: CC0-1.0    
-->

# Unreal Engine Assistant MCP

A Model Context Protocol (MCP) server that connects to the Epic Games [Unreal AI Assistant](https://dev.epicgames.com/community/assistant/unreal-engine).

This server allows AI assistants (like Claude, Cursor, or any MCP-compatible client) to query Epic's Unreal AI and retrieve highly accurate, up-to-date documentation, C++ code snippets, and Blueprint guidance. It respects Epic's allowed contents (`/allowed` endpoint) and rate limits (`/check_limit` endpoint). Puppeteer is used to avoid reverse-engineering their API.

## Prerequisites

- Node.js (v18+)
- Yarn (`yarn set version stable`)

## Installation

Clone this repository and install dependencies:

```bash
git clone https://github.com/daniel-eder/unreal-engine-assistant-mcp.git
cd unreal-engine-assistant-mcp
yarn install
```

## Usage

This server supports multiple MCP transport methods:

### 1. Stdio (Default)
Standard communication over `stdout`/`stderr`. This is the most common integration method for tools like Claude Desktop and Cursor.

> **Note:** Because this project uses Yarn Zero Installs (PnP), you must use `yarn node` instead of standard `node` to resolve dependencies.

```bash
yarn node index.js
```

### 2. Standard Server-Sent Events (SSE)
Starts a local web server to handle context protocol requests via plain SSE. 

```bash
yarn node index.js --sse
```

By default it listens at: `http://127.0.0.1:3000/sse`

*(You can override the port/host by passing `--port XXXX` and `--host XXXX`, e.g., `yarn node index.js --sse --port 4000 --host localhost`)*

### 3. Streamable HTTP
Starts a local web server with full MCP Streamable HTTP session support. 

```bash
yarn node index.js --streamable-http
```

By default it listens at: `http://127.0.0.1:3000/mcp`

*(You can override the port/host by passing `--port XXXX` and `--host XXXX`, e.g., `yarn node index.js --streamable-http --port 4000 --host localhost`)*

## Development

If you want to run the server in development mode, simply use the scripts provided in `package.json`:
- `yarn start` - Starts the MCP server via standard stdio transport.
- `yarn start:sse` - Starts the plain HTTP SSE server.
- `yarn start:streamable-http` - Starts the MCP Streamable HTTP server.
- `yarn start:streamable-http --port 8080 --host localhost` - Starts the HTTP server with a custom port and host.

## Command-Line Arguments

The server accepts several command-line flags to customize its behavior:

| Argument | Description | Default |
| :--- | :--- | :--- |
| `--sse` | Runs the server using the plain Server-Sent Events (SSE) transport. Suitable for simple HTTP integration. | (Disabled) |
| `--streamable-http` | Runs the server using the advanced MCP Streamable HTTP transport with session support. | (Disabled) |
| `--port <number>` | Overrides the port used when binding the HTTP server (for `--sse` and `--streamable-http`). | `3000` |
| `--host <string>` | Overrides the host used when binding the HTTP server. Use `0.0.0.0` to expose to the local network. | `127.0.0.1` |
| `--delay <number>` | Adjusts the sleep duration (in milliseconds) used by the headless browser to wait for Cloudflare validation before querying Epic's APIs. If queries fail, try increasing this. | `2000` |

*(If no transport is defined via `--sse` or `--streamable-http`, the server defaults to Stdio transport)*

## MCP Client Configuration

Add the following to your mcp config json:

```json
{
  "mcpServers": {
    "unreal-ai-assistant": {
      "command": "yarn",
      "args": [
        "node",
        "/path/to/your/unreal-engine-assistant-mcp/index.js"
      ]
    }
  }
}
```

## Available Tools

* `ask_unreal_engine_assistant` - Sends your question to the Unreal Engine Assistant and returns the structured markdown/HTML response. Takes a single string parameter: `question`.

## Troubleshooting

- **Puppeteer crashing or failing to launch**: Sometimes the stealth plugin requires system libraries. Ensure you have standard local chromium dependencies installed if running on Linux. On Windows/Mac, it usually runs out of the box.
- **ARM / Raspberry Pi Support**: Puppeteer's bundled Chromium may not work on ARM architectures out of the box. To run this project on a Raspberry Pi or other ARM devices:
  1. Install the native Chromium browser: `sudo apt-get install chromium-browser`
  2. The server will automatically attempt to use `/usr/bin/chromium-browser`.
  3. If your Chromium is installed in a different location, set the `PUPPETEER_EXECUTABLE_PATH` environment variable before running the server (e.g., `export PUPPETEER_EXECUTABLE_PATH=/custom/path/to/chromium`).
- **Initial Request Delay**: The very first question may take a few seconds as the headless browser sets up the site https://dev.epicgames.com/community/assistant/unreal-engine. Subsequent requests in the same session will be much faster. You can use `--delay` to control the artificial delay while waiting for cloudflare verification. 

## Licensing

Copyright (c) 2026 Daniel Eder

All content in this repository is licensed under at least one of the licenses found in [./LICENSES](./LICENSES); you may not use this file, or any other file in this repository, except in compliance with the Licenses. 
You may obtain a copy of the Licenses by reviewing the files found in the [./LICENSES](./LICENSES) folder.

Unless required by applicable law or agreed to in writing, software distributed under the Licenses is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See in the [./LICENSES](./LICENSES) folder for the specific language governing permissions and limitations under the Licenses.

This project follows the [REUSE standard for software licensing](https://reuse.software/). 
Each file contains copyright and license information, and license texts can be found in the [./LICENSES](./LICENSES) folder. For more information visit https://reuse.software/.
You can find a guide for developers at https://telekom.github.io/reuse-template/.
