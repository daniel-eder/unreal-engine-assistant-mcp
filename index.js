// SPDX-FileCopyrightText: 2026 Daniel Eder
//
// SPDX-License-Identifier: MIT

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { randomUUID } from "crypto";
import express from "express";
import { z } from "zod";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// Handle StealthPlugin for ES Modules just in case
const plugin = StealthPlugin();
puppeteer.use(plugin);

// Initialize the MCP Server using the newer McpServer class
const server = new McpServer({
  name: "UnrealAIAssistant",
  version: "1.0.0",
});

// Register the tool
server.tool(
  "ask_unreal_engine_assistant",
  "Ask the Epic Games Unreal AI Assistant a question about Unreal Engine. Use this tool to get up-to-date documentation, blueprints help, and C++ answers for Unreal Engine.",
  {
    question: z.string().describe("The question to ask the Unreal AI Assistant.")
  },
  async ({ question }) => {
    // Log out to stderr so we don't interfere with MCP's stdout protocol
    console.error(`[Tool Execution] Received request for Unreal AI: "${question}"`);
    
    const answer = await runPuppeteerQuery(question);
    
    console.error(`[Tool Execution] Successfully retrieved answer from Unreal AI: \n${answer}\n`);
    return {
      content: [
        {
          type: "text",
          text: answer
        }
      ]
    };
  }
);

/**
 * Runs the headless puppeteer script to query the Epic AI
 */
async function runPuppeteerQuery(query) {
  const delayArgIndex = process.argv.indexOf('--delay');
  const delayMs = delayArgIndex !== -1 ? parseInt(process.argv[delayArgIndex + 1], 10) : 2000;

  const browser = await puppeteer.launch({ 
    headless: true, // Keep GUI hidden
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Initial page load to pass Cloudflare and get session tokens
    await page.goto('https://dev.epicgames.com/community/assistant/unreal-engine/conversation', { 
      waitUntil: 'networkidle2' 
    });
    
    // Brief sleep to ensure Cloudflare doesn't block the next API requests
    await new Promise(r => setTimeout(r, delayMs));
    
    // Run the API payload directly within the authenticated Chromium context
    const finalAnswer = await page.evaluate(async (q) => {
      
      // Grab CSRF tokens from the HTML
      let csrfToken = "fallback";
      const csrfMeta = document.querySelector('meta[name="csrf-token"]') 
                    || document.querySelector('meta[name="public-csrf-token"]');
      
      if (csrfMeta) {
        csrfToken = csrfMeta.content;
      } else if (window.__csrf_token) {
        csrfToken = window.__csrf_token;
      }

      try {
        // Pre-flight endpoints to validate the session
        await fetch("https://dev.epicgames.com/community/api/assistant/questions/allowed");
        await fetch("https://dev.epicgames.com/community/api/assistant/questions/check_limit");

        // Main Question POST
        const response = await fetch("https://dev.epicgames.com/community/api/assistant/questions", {
          method: "POST",
          headers: {
            "accept": "text/event-stream",
            "content-type": "application/json",
            "public-csrf-token": csrfToken
          },
          body: JSON.stringify({
            content: q,
            application: "unreal_engine",
            format: "html"
          })
        });

        if (!response.ok) {
          return `Internal Browser API Error: ${response.status} - ${await response.text()}`;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamData = "";
        let finalResponseContent = "";
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          streamData += decoder.decode(value, { stream: true });
        }

        // Parse Server-Sent Events to find the final "answer_update" data block
        const lines = streamData.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i] && lines[i].startsWith('event: answer_update')) {
            const dataLine = lines[i+1];
            if (dataLine && dataLine.startsWith('data: ')) {
              try {
                const j = JSON.parse(dataLine.replace('data: ', ''));
                if (j.content) {
                  finalResponseContent = j.content;
                }
              } catch(e) {}
            }
          }
        }
        
        // Return only the parsed response (or the raw stream if parsing failed)
        return finalResponseContent ? finalResponseContent : streamData;
        
      } catch (error) {
        return `JavaScript Evaluation Error: ${error.toString()}`;
      }
    }, query);

    return finalAnswer;
  } catch (error) {
    return `Script Level Error: ${error.message}`;
  } finally {
    await browser.close();
  }
}

// Start the MCP Server based on the provided transport argument
async function run() {
  const portArgIndex = process.argv.indexOf('--port');
  const port = portArgIndex !== -1 ? parseInt(process.argv[portArgIndex + 1], 10) : (process.env.PORT || 3000);
  
  const hostArgIndex = process.argv.indexOf('--host');
  const host = hostArgIndex !== -1 ? process.argv[hostArgIndex + 1] : '127.0.0.1';

  if (process.argv.includes('--streamable-http')) {
    const app = createMcpExpressApp({ host });
    const transports = {};

    app.post('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      
      try {
        let transport;
        if (sessionId && transports[sessionId]) {
          transport = transports[sessionId];
        } else if (!sessionId && req.body && req.body.method === 'initialize') {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: id => { transports[id] = transport; }
          });
          transport.onclose = () => { if (transport.sessionId) delete transports[transport.sessionId]; };
          await server.connect(transport);
        } else {
          res.status(400).send('Invalid or missing session ID');
          return;
        }

        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('Error handling HTTP request', error);
        res.status(500).send('Internal Server Error');
      }
    });

    app.get('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      if (!sessionId || !transports[sessionId]) return res.status(400).send('Invalid session ID');
      await transports[sessionId].handleRequest(req, res);
    });

    app.delete('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      if (!sessionId || !transports[sessionId]) return res.status(400).send('Invalid session ID');
      await transports[sessionId].handleRequest(req, res);
    });

    app.listen(port, host, () => {
      console.error(`Unreal AI Assistant MCP Server listening with Streamable HTTP on http://${host}:${port}/mcp`);
    });

  } else if (process.argv.includes('--sse')) {
    const app = createMcpExpressApp({ host });
    let transport = null;

    app.get('/sse', async (req, res) => {
      console.error("New SSE connection received.");
      transport = new SSEServerTransport('/message', res);
      await server.connect(transport);
    });

    app.post('/message', async (req, res) => {
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(400).send("No active SSE connection.");
      }
    });

    app.listen(port, host, () => {
      console.error(`Unreal AI Assistant MCP Server listening on SSE at http://${host}:${port}/sse`);
    });
  } else {
    // Default to the robust stdio transport usually used by host applications
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Unreal AI Assistant MCP Server is running and listening on stdio...");
  }
}

run().catch((err) => {
  console.error("Error starting MCP server:", err);
  process.exit(1);
});