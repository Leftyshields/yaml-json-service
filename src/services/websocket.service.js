// src/services/websocket.service.js
const WebSocket = require('ws');
const url = require('url');

let wss; // WebSocket server instance
let conversionStreams = new Map(); // Map to track conversion streams

/**
 * Initialize the WebSocket service
 * @param {object} server The HTTP server instance
 */
function initWebSocket(server) {
  // Create WebSocket server attached to the HTTP server
  wss = new WebSocket.Server({ 
    server,
    path: '/api/ws'
  });
  
  console.log('[WS] WebSocket server initialized');
  
  // Handle connections
  wss.on('connection', (ws, req) => {
    const params = url.parse(req.url, true).query;
    const clientId = params.clientId || `anonymous-${Date.now()}`;
    
    console.log(`[WS] Client connected: ${clientId}`);
    
    // Store client info with WebSocket connection
    ws.clientId = clientId;
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connection',
      message: 'Connected to YAML/JSON Service WebSocket',
      clientId
    }));
    
    // Handle messages from client
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        console.log(`[WS] Message from ${clientId}:`, data);
        
        // Handle different message types
        switch (data.type) {
          case 'subscribe':
            handleSubscription(ws, data);
            break;
            
          default:
            console.log(`[WS] Unknown message type: ${data.type}`);
        }
      } catch (err) {
        console.error(`[WS] Error processing message: ${err.message}`);
      }
    });
    
    // Handle disconnection
    ws.on('close', () => {
      console.log(`[WS] Client disconnected: ${clientId}`);
      
      // Clean up any subscriptions
      for (const [streamId, clients] of conversionStreams.entries()) {
        if (clients.has(clientId)) {
          clients.delete(clientId);
          if (clients.size === 0) {
            conversionStreams.delete(streamId);
          }
        }
      }
    });
  });
}

/**
 * Handle client subscription to a conversion stream
 * @param {object} ws The WebSocket connection
 * @param {object} data The subscription data
 */
function handleSubscription(ws, data) {
  const { streamId } = data;
  const clientId = ws.clientId;
  
  if (!streamId) {
    sendError(ws, 'No streamId provided for subscription');
    return;
  }
  
  // Create new stream if it doesn't exist
  if (!conversionStreams.has(streamId)) {
    conversionStreams.set(streamId, new Map());
  }
  
  // Add client to stream
  conversionStreams.get(streamId).set(clientId, ws);
  
  console.log(`[WS] Client ${clientId} subscribed to stream ${streamId}`);
  
  // Send confirmation
  ws.send(JSON.stringify({
    type: 'subscribed',
    streamId
  }));
}

/**
 * Send conversion progress update to subscribed clients
 * @param {string} streamId The ID of the conversion stream
 * @param {object} data The update data
 */
function sendConversionUpdate(streamId, data) {
  if (!conversionStreams.has(streamId)) {
    console.log(`[WS] No subscribers for stream ${streamId}`);
    return;
  }
  
  const clients = conversionStreams.get(streamId);
  const message = JSON.stringify({
    type: 'conversionUpdate',
    streamId,
    timestamp: Date.now(),
    ...data
  });
  
  let sentCount = 0;
  for (const [_, ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sentCount++;
    }
  }
  
  console.log(`[WS] Sent update for stream ${streamId} to ${sentCount} clients`);
}

/**
 * Send error message to client
 * @param {object} ws The WebSocket connection
 * @param {string} message The error message
 */
function sendError(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'error',
      message
    }));
  }
}

module.exports = {
  initWebSocket,
  sendConversionUpdate
};
